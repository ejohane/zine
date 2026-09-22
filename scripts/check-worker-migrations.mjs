import { readFileSync, readdirSync } from 'node:fs';

const directory = new URL('../apps/worker/src/db/migrations/', import.meta.url);
const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', directory), 'utf8'));
const sqlFiles = readdirSync(directory).filter((name) => name.endsWith('.sql'));
const registered = journal.entries.map((entry) => `${entry.tag}.sql`);
const missing = sqlFiles.filter((name) => !registered.includes(name));
const absent = registered.filter((name) => !sqlFiles.includes(name));
if (missing.length || absent.length || new Set(registered).size !== registered.length) {
  throw new Error(
    `Worker migration journal mismatch: unregistered SQL [${missing}], missing SQL [${absent}], or duplicate entries`
  );
}
console.log(`Worker migration journal matches all ${sqlFiles.length} SQL files.`);
