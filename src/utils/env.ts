import dotenv from 'dotenv';

dotenv.config();

export interface Env {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  BLACKLISTED_VERSIONS: string[];
  WEBHOOK_URL: string;
}

if (!process.env.CLIENT_ID) {
  throw new Error('CLIENT_ID is not defined');
}

if (!process.env.CLIENT_SECRET) {
  throw new Error('CLIENT_SECRET is not defined');
}

if (!process.env.BLACKLISTED_VERSIONS) {
  throw new Error('BLACKLISTED_VERSIONS is not defined');
}

if (!process.env.WEBHOOK_URL) {
  throw new Error('WEBHOOK_URL is not defined');
}

export const env = {
  CLIENT_ID: process.env.CLIENT_ID,
  CLIENT_SECRET: process.env.CLIENT_SECRET,
  BLACKLISTED_VERSIONS: process.env.BLACKLISTED_VERSIONS.split(','),
  WEBHOOK_URL: process.env.WEBHOOK_URL,
} satisfies Env;
