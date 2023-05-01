import fs from 'fs';

import needle from 'needle';

import { env } from './env';

export interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
}

const refreshToken = async () => {
  const tokenResponse = await needle('post', 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token', {
    grant_type: 'client_credentials',
    token_type: 'eg1',
  }, {
    auth: 'basic',
    username: env.CLIENT_ID,
    password: env.CLIENT_SECRET,
  });

  if (tokenResponse.statusCode !== 200) {
    console.log(tokenResponse.body);

    throw new Error('Failed to get token');
  }

  const tokenData = <TokenData>tokenResponse.body;

  fs.writeFileSync('cache/token.json', JSON.stringify(tokenData));

  return tokenData;
};

export default async () => {
  let tokenData: TokenData | null = null;

  if (fs.existsSync('cache/token.json')) {
    tokenData = <TokenData>JSON.parse(fs.readFileSync('cache/token.json', 'utf8'));
  }

  if (!tokenData || new Date(tokenData.expires_at) < new Date()) {
    tokenData = await refreshToken();
  }

  return tokenData.access_token;
};
