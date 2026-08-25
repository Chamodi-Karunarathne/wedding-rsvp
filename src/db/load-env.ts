import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal .env loader for standalone scripts only (drizzle-kit config, db:seed).
 *
 * Next.js loads .env itself at runtime, so nothing under src/app, src/lib or
 * src/db/client.ts should ever import this. It exists because drizzle-kit and
 * `node src/db/seed.ts` run outside the Next.js process and would otherwise
 * need a dotenv dependency.
 */
export function loadEnv(file = '.env'): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);

    // A real environment variable always wins over the file.
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `${name} is not set.\n` +
        `Copy .env.example to .env and fill it in, or export ${name} in your shell.`,
    );
  }
  return value;
}
