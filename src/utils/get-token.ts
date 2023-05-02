import needle from 'needle';

import { env } from './env';

export interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
}

export default async () => {
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

  return <TokenData>tokenResponse.body;
};
