import { execSync } from 'child_process';
import fs from 'fs';

import needle from 'needle';

import { env } from './utils/env';
import getToken from './utils/get-token';

import type { CloudstorageResponse } from './types/response';

const folders = ['output', 'output/_persistent'];

const fileRegex = /^(Branch-Release-(?<version>\d{1,2}\.\d{1,2})_)?((?<platform>[a-z\d]+)_)?(?<type>[a-z]+)\.ini$/i;

folders.forEach((folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

let isDoingTheThing = false;

const doTheThing = async () => {
  if (isDoingTheThing) {
    console.log('Already doing the thing');

    return;
  }

  isDoingTheThing = true;

  const timeout = setTimeout(() => {
    isDoingTheThing = false;
    console.log('Timed out doing the thing');
  }, 1000 * 60 * 5);

  const { access_token: token } = await getToken();
  const updateId = new Date().toISOString().replace(/:/g, '-');

  console.log(`Update ID: ${updateId}`);

  const cloudstorageResponse = await needle('get', 'https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/cloudstorage/system', {
    headers: {
      Authorization: `bearer ${token}`,
    },
  });

  if (cloudstorageResponse.statusCode !== 200) {
    console.log(cloudstorageResponse.body);

    throw new Error('Failed to get cloudstorage');
  }

  const cachedFiles: CloudstorageResponse[] = [];

  if (fs.existsSync('output/files.json')) {
    cachedFiles.push(...<CloudstorageResponse[]>JSON.parse(fs.readFileSync('output/files.json', 'utf8')));
  }

  // sort by filename so that the order is consistent
  const files = (<CloudstorageResponse[]>cloudstorageResponse.body)
    .sort((a, b) => a.filename.localeCompare(b.filename));

  const platforms: string[] = [];
  const configTypes: string[] = [];

  const mergableFiles: string[] = [];
  const changedFiles: string[] = [];

  files.forEach((file) => {
    if (file.length === 0) {
      return;
    }

    if (!cachedFiles.length || !cachedFiles.find((cachedFile) => cachedFile.filename === file.filename
      && new Date(cachedFile.uploaded) >= new Date(file.uploaded))
    ) {
      changedFiles.push(file.filename);
    }

    const match = file.filename.match(fileRegex);

    if (!match?.groups) {
      console.log(`Excluding ${file.filename} from merge because it doesn't match the regex`);

      return;
    }

    const { version, platform, type } = match.groups;

    if (env.BLACKLISTED_VERSIONS.includes(version)) {
      // console.log(`Excluding ${file.filename} from merge because its version is blacklisted`);

      return;
    }

    if (platform && !platforms.includes(platform)) {
      platforms.push(platform);
    }

    if (type && !configTypes.includes(type)) {
      configTypes.push(type);
    }

    mergableFiles.push(file.filename);
  });

  if (!changedFiles.length) {
    console.log('No files changed');

    isDoingTheThing = false;
    clearTimeout(timeout);

    return;
  }

  fs.mkdirSync(`output/${updateId}`, { recursive: true });

  if (fs.existsSync('output/_persistent')) {
    fs.rmSync('output/_persistent', { recursive: true });
    fs.mkdirSync('output/_persistent', { recursive: true });
  }

  const results: Record<string, string> = {};

  console.log('');
  console.log(`Platforms: ${platforms.join(', ')}`);
  console.log(`Config types: ${configTypes.join(', ')}`);
  console.log('');

  const responses: string[] = [];

  const promises = files.map(async (file, index) => {
    if (file.length === 0) {
      return;
    }

    if (!mergableFiles.includes(file.filename) && !changedFiles.includes(file.filename)) {
      return;
    }

    const response = await needle('get', `https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/cloudstorage/system/${file.uniqueFilename}`, {
      headers: {
        Authorization: `bearer ${token}`,
      },
    });

    if (response.statusCode !== 200) {
      console.log(response.body);

      throw new Error('Failed to get file');
    }

    const content = (<Buffer>response.body).toString().replaceAll('\r\n', '\n');

    if (changedFiles.includes(file.filename)) {
      fs.writeFileSync(`output/${updateId}/${file.filename}`, content);
    }

    if (!mergableFiles.includes(file.filename)) {
      return;
    }

    responses[index] = content;
  });

  await Promise.all(promises);

  responses.forEach((content, index) => {
    if (content === undefined) {
      return;
    }

    const file = files[index];

    const getContent = () => {
      let a = `; -----------------------------------
; ${file.filename}
; -----------------------------------
`;

      a += content.replaceAll('\r\n', '\n');

      if (a[a.length - 1] !== '\n') {
        a += '\n';
      }

      return a;
    };

    const match = file.filename.match(fileRegex);

    if (!match?.groups) {
      return;
    }

    const { platform, type } = match.groups;

    if (!platform) {
      if (!results[type]) {
        results[type] = '';
      }

      results[type] += getContent();

      return;
    }

    // platform specific
    if (!results[`${platform}-${type}`]) {
      results[`${platform}-${type}`] = '';
    }

    results[`${platform}-${type}`] += getContent();
  });

  fs.writeFileSync('output/files.json', JSON.stringify(files, null, 2));

  Object.keys(results).forEach((platform) => {
    const [platformName, configType] = platform.split('-');

    if (!configType) {
      fs.writeFileSync(`output/_persistent/${platformName}.ini`, results[platform]);

      return;
    }

    if (!fs.existsSync(`output/_persistent/${platformName}`)) {
      fs.mkdirSync(`output/_persistent/${platformName}`);
    }

    fs.writeFileSync(`output/_persistent/${platformName}/${configType}.ini`, results[platform]);
  });

  let commitMessage = 'Update ';

  if (changedFiles.length > 4) {
    commitMessage += `${changedFiles.length} files`;
    commitMessage += `\n-${changedFiles.join('\n-')}`;
  } else {
    commitMessage += changedFiles.join(', ');
  }

  execSync(`git add output/${updateId} output/_persistent output/files.json`);
  execSync(`git -c commit.gpgsign=false commit --author="41898282+github-actions[bot]@users.noreply.github.com" -m "${commitMessage}"`);
  execSync('git push');

  console.log('Updated');
  console.log(changedFiles);

  let fieldValue = '';

  let overflowCount = 0;

  changedFiles.forEach((file) => {
    const a = `- ${file}\n`;

    if (fieldValue.length + a.length > 1000) {
      overflowCount += 1;

      return;
    }

    fieldValue += a;
  });

  if (overflowCount) {
    fieldValue += `- + ${overflowCount} more`;
  }

  const webhookResponse = await needle('post', env.WEBHOOK_URL, {
    content: '<@&1195402951439691946>',
    embeds: [{
      title: 'Update',
      description: `**${changedFiles.length}** files changed`,
      fields: [{
        name: 'Files',
        value: fieldValue,
      }],
    }],
  }, {
    json: true,
  });

  if (webhookResponse.statusCode !== 204) {
    console.log(webhookResponse.body);

    throw new Error('Failed to send webhook');
  }

  isDoingTheThing = false;
  clearTimeout(timeout);
};

// eslint-disable-next-line @typescript-eslint/no-misused-promises
setInterval(doTheThing, 1000 * 10);
