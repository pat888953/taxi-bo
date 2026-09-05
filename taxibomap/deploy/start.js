import pg from 'pg';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL || !process.env.NAVIDRIVE_TEST_PASSWORD || process.env.NAVIDRIVE_TEST_PASSWORD.length < 16) {
  throw new Error('Test deployment needs DATABASE_URL and NAVIDRIVE_TEST_PASSWORD (at least 16 characters).');
}
if (process.env.VALHALLA_HOSTPORT) process.env.VALHALLA_URL = `http://${process.env.VALHALLA_HOSTPORT}`;
const client = new pg.Client({connectionString: process.env.DATABASE_URL});
await client.connect();
try {
  await client.query('BEGIN');
  for (const file of ['schema.sql', 'route_matching.sql']) {
    await client.query(await readFile(new URL(`../db/${file}`, import.meta.url), 'utf8'));
  }
  await client.query('COMMIT');
} finally { await client.end(); }
await import('../server/index.js');
