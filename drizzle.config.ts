import { defineConfig } from 'drizzle-kit';
import { loadEnv } from './src/db/load-env';

loadEnv();

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  // `drizzle-kit generate` diffs the schema offline and never connects, so a
  // missing DATABASE_URL must not stop migrations being written. Commands that
  // do connect (migrate, push, studio) fail loudly on this placeholder.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://DATABASE_URL-is-not-set',
  },
  strict: true,
  verbose: true,
});
