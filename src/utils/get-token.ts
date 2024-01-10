import needle from 'needle';

import { env } from './env';

export interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
}

let tokenData: TokenData | null = null;

export default async () => {
  if (tokenData && new Date(tokenData.expires_at).getTime() - 1000 * 60 > Date.now()) {
    return tokenData;
  }

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

  tokenData = <TokenData>tokenResponse.body;

  return tokenData;
};
