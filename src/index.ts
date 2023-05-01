import fs from 'fs';

import needle from 'needle';

import { env } from './utils/env';
import getToken from './utils/get-token';

import type { CloudstorageResponse } from './types/response';

const folders = ['cache', 'output', 'output/_persistent'];

const fileRegex = /^(Branch-Release-(?<version>\d{1,2}\.\d{1,2})_)?((?<platform>[a-z\d]+)_)?(?<type>[a-z]+)\.ini$/i;

folders.forEach((folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

(async () => {
  const token = await getToken();
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

  if (fs.existsSync('cache/files.json')) {
    cachedFiles.push(...<CloudstorageResponse[]>JSON.parse(fs.readFileSync('cache/files.json', 'utf8')));
  }

  const files = <CloudstorageResponse[]>cloudstorageResponse.body;

  const platforms: string[] = [];
  const configTypes: string[] = [];

  const mergableFiles: string[] = [];
  const changedFiles: string[] = [];

  files.forEach((file) => {
    if (file.length === 0) {
      return;
    }

    if (!cachedFiles.length
      || cachedFiles.find((cachedFile) => cachedFile.filename === file.filename && cachedFile.hash !== file.hash)) {
      changedFiles.push(file.filename);
    }

    const match = file.filename.match(fileRegex);

    if (!match?.groups) {
      console.log(`Excluding ${file.filename} from merge because it doesn't match the regex`);

      return;
    }

    const { version, platform, type } = match.groups;

    if (env.BLACKLISTED_VERSIONS.includes(version)) {
      console.log(`Excluding ${file.filename} from merge because its version is blacklisted`);

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

  const promises = files.map(async (file) => {
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

    const content = (<Buffer>response.body).toString();

    if (changedFiles.includes(file.filename)) {
      fs.writeFileSync(`output/${updateId}/${file.filename}`, content);
    }

    if (!mergableFiles.includes(file.filename)) {
      return;
    }

    const getContent = () => {
      let a = `; -----------------------------------
; ${file.filename}
; -----------------------------------
`;

      a += content;

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

  await Promise.all(promises);

  fs.writeFileSync('cache/files.json', JSON.stringify(files));

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
})().finally(console.log);
