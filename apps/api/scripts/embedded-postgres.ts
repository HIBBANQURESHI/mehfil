import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';

/** Local Postgres with no Docker or installation needed, using the details in DATABASE_URL. Development only. */
async function main() {
  // embedded-postgres is ESM-only, so this CommonJS script has to load it dynamically.
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const url =new URL(process.env.DATABASE_URL ?? '');
  const database = url.pathname.slice(1);
  const databaseDir = path.resolve(__dirname, '../.pg-data');
  const fresh = !fs.existsSync(path.join(databaseDir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({ databaseDir, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), port: Number(url.port), persistent: true, onLog: () => undefined });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh && database !== 'postgres') await pg.createDatabase(database);
  console.log(`Postgres ready on ${url.hostname}:${url.port}, database ${database}`);
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

main().catch((e) => { console.error(e); process.exit(1); });
