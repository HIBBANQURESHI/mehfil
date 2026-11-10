// Runs outside Jest because embedded-postgres is ESM-only. Stops when the parent closes stdin.
import EmbeddedPostgres from 'embedded-postgres';
const [dir, port] = process.argv.slice(2);
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'mehfil', password: 'mehfil', port: Number(port), persistent: false, onLog: () => undefined });
await pg.initialise();
await pg.start();
await pg.createDatabase('mehfil_test');
console.log('READY');
process.stdin.resume();
process.stdin.on('end', async () => { await pg.stop(); process.exit(0); });
