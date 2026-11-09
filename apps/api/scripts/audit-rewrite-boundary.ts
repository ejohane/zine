import assert from 'node:assert/strict';
import { format, resolveConfig } from 'prettier';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
const sourceFiles: string[] = [];
async function walk(dir: string) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) await walk(p);
    else sourceFiles.push(p);
  }
}
await walk('src');
for (const p of sourceFiles) {
  const contents = await readFile(p, 'utf8');
  assert.doesNotMatch(
    contents,
    /(?:from|import\()\s*['"][^'"]*(?:apps\/worker|packages\/shared|@zine\/|\.\.\/\.\.\/worker)/,
    `Legacy runtime dependency in ${p}`
  );
}
const modified = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);
const allowedTrackedChanges = new Set(['AGENTS.md', 'bun.lock']);
assert.ok(
  modified.every(
    (path) =>
      allowedTrackedChanges.has(path) ||
      path.startsWith('apps/api/') ||
      /^\.github\/workflows\/api-next(?:-[a-z]+)?\.yml$/.test(path)
  ),
  'Existing application implementation changed outside the rewrite'
);
const ignored = execFileSync(
  'git',
  ['check-ignore', 'apps/api/.local-data/manual-http.jsonl', 'apps/api/.wrangler/build/index.js'],
  { cwd: '../..', encoding: 'utf8' }
)
  .trim()
  .split('\n');
assert.equal(ignored.length, 2);
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
  cwd: '../..',
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
assert.ok(
  untracked.every(
    (p) => p.startsWith('apps/api/') || /^\.github\/workflows\/api-next(?:-[a-z]+)?\.yml$/.test(p)
  )
);
assert.ok(
  untracked.every(
    (p) =>
      !p.includes('/.local-data/') &&
      !p.includes('/.wrangler/') &&
      !/(?:^|\/)\.env(?:\.|$)|\.dev\.vars$/.test(p)
  )
);
const report = {
  at: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceFiles: sourceFiles.length,
  noLegacyRuntimeImports: true,
  modifiedTracked: modified,
  newPaths: ['apps/api', '.github/workflows/api-next.yml'],
  rootDocumentationChange: modified.includes('AGENTS.md'),
  privateDataAndBuildOutputIgnored: true,
  existingApplicationImplementationChanged: false,
  note: 'One-time credential/library inspection helpers are separate from runtime code; fresh deployed bindings are independently checked in deployment.json; root AGENTS.md has an intentional API session-routing addition',
};
await writeFile(
  'evidence/rewrite-boundary.json',
  await format(JSON.stringify(report), {
    ...(await resolveConfig('evidence/rewrite-boundary.json')),
    parser: 'json',
  })
);
console.log(JSON.stringify(report));
