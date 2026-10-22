import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { loadEnv } from './load-env.ts';
import * as schema from './schema.ts';

const usage = 'Use: prepare.ts prepare | prepare.ts reset-test-data --confirm-test-data';

async function main(): Promise<void> {
  const [mode, ...rawFlags] = process.argv.slice(2);
  const flags = rawFlags.filter((flag) => flag !== '--');
  if ((mode !== 'prepare' && mode !== 'reset-test-data') ||
      flags.some((flag) => flag !== '--confirm-test-data') ||
      (mode === 'prepare' && flags.length > 0)) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (mode === 'reset-test-data' && !flags.includes('--confirm-test-data')) {
    console.error('Reset refused. Pass --confirm-test-data only when all application records are test data.');
    process.exitCode = 1;
    return;
  }

  // Package scripts also use --env-file-if-exists. Load before the dynamic
  // service import so standalone execution sees the same date overrides.
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Configure the intended database before preparing it.');
    process.exitCode = 1;
    return;
  }
  const { prepareDatabase, resetTestData } = await import('./prepare-service.ts');
  if (!neonConfig.webSocketConstructor && typeof globalThis.WebSocket !== 'undefined') {
    neonConfig.webSocketConstructor = globalThis.WebSocket as never;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool, { schema });
    const summary = mode === 'prepare'
      ? await prepareDatabase(db)
      : await resetTestData(db, { confirmTestData: true });
    console.log(mode === 'prepare'
      ? 'Database foundations prepared. Existing settings and guest data were preserved.'
      : 'Test data removed. Wedding foundations restored; the guest list is empty.');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  // Driver errors may include SQL parameters or connection URLs. Keep CLI
  // failures controlled and secret-free; a failed transaction rolls back.
  console.error('Database preparation failed. Check the intended connection, migration state and wedding defaults before retrying.');
  process.exitCode = 1;
});
