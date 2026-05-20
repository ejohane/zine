#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const WORKER_DIR = join(REPO_ROOT, 'apps/worker');
const DEFAULT_DATABASE = 'zine-db-production';
const DEFAULT_ENV = 'production';
const CHUNK_SIZE = 50;

const LOWERCASE_NAME_PARTICLES = new Set([
  'al',
  'bin',
  'da',
  'de',
  'del',
  'der',
  'di',
  'dos',
  'du',
  'ibn',
  'la',
  'le',
  'van',
  'von',
  'y',
]);

const args = process.argv.slice(2);
const dryRun = !args.includes('--yes');

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

const database = argValue('--database', DEFAULT_DATABASE);
const env = argValue('--env', DEFAULT_ENV);
const userId = argValue('--user-id');
const sampleLimit = Number(argValue('--sample-limit', '20'));

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function capitalizeNameSegment(value) {
  if (!value) return value;
  const rest = value.slice(1);
  const shouldNormalizeRest = value === value.toLowerCase() || value === value.toUpperCase();
  return `${value[0]?.toUpperCase() ?? ''}${shouldNormalizeRest ? rest.toLowerCase() : rest}`;
}

function capitalizeNameWord(value, wordIndex) {
  const lower = value.toLowerCase();
  if (wordIndex > 0 && LOWERCASE_NAME_PARTICLES.has(lower)) {
    return lower;
  }
  if (/^([a-z]\.)+[a-z]?\.?$/i.test(value)) {
    return value.toUpperCase();
  }

  return value
    .split('-')
    .map((hyphenPart) =>
      hyphenPart
        .split("'")
        .map((apostrophePart) => capitalizeNameSegment(apostrophePart))
        .join("'")
    )
    .join('-');
}

function normalizePersonDisplayName(value) {
  const trimmed = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!trimmed) return '';

  return trimmed
    .split(' ')
    .map((word, index) => capitalizeNameWord(word, index))
    .join(' ');
}

function runD1(command) {
  const output = execFileSync(
    'bun',
    [
      'wrangler',
      'd1',
      'execute',
      database,
      '--env',
      env,
      '--remote',
      '--json',
      '--command',
      command,
    ],
    {
      cwd: WORKER_DIR,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 50,
    }
  );

  const parsed = JSON.parse(output);
  const statements = Array.isArray(parsed) ? parsed : [parsed];
  const failed = statements.find((statement) => statement?.success === false);
  if (failed) {
    throw new Error(JSON.stringify(failed, null, 2));
  }

  return statements.flatMap((statement) => statement?.results ?? []);
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildUpdateSql(updates) {
  const cases = updates
    .map((update) => `WHEN ${sqlString(update.id)} THEN ${sqlString(update.nextDisplayName)}`)
    .join('\n      ');
  const ids = updates.map((update) => sqlString(update.id)).join(', ');

  return `
    UPDATE user_people
    SET display_name = CASE id
      ${cases}
      ELSE display_name
    END
    WHERE id IN (${ids});
  `;
}

const whereClause = userId ? `WHERE user_id = ${sqlString(userId)}` : '';
const rows = runD1(`
  SELECT id, user_id AS userId, display_name AS displayName
  FROM user_people
  ${whereClause}
  ORDER BY user_id, display_name;
`);

const updates = rows
  .map((row) => {
    const current = String(row.displayName ?? '');
    const next = normalizePersonDisplayName(current);
    return {
      id: String(row.id),
      userId: String(row.userId),
      currentDisplayName: current,
      nextDisplayName: next,
    };
  })
  .filter((row) => row.currentDisplayName && row.nextDisplayName !== row.currentDisplayName);

console.log(
  JSON.stringify(
    {
      database,
      env,
      dryRun,
      scanned: rows.length,
      updates: updates.length,
      sample: updates.slice(0, Number.isFinite(sampleLimit) ? sampleLimit : 20),
    },
    null,
    2
  )
);

if (dryRun || updates.length === 0) {
  if (dryRun) {
    console.log('\nDry run only. Re-run with --yes to update production display names.');
  }
  process.exit(0);
}

for (const updatesChunk of chunk(updates, CHUNK_SIZE)) {
  runD1(buildUpdateSql(updatesChunk));
}

console.log(`Updated ${updates.length} user_people display_name values.`);
