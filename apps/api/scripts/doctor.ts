import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';

// Safe for fresh sessions: no credentials read, login, deployment or API mutation.
const offline = process.argv.includes('--offline');
const base = new URL(process.env.ZINE_API_BASE_URL ?? 'https://api-next.myzine.app');
if (
  base.username ||
  base.password ||
  (base.protocol !== 'https:' &&
    !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))
)
  throw new Error('Use an HTTPS API origin or loopback development origin without credentials');
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const dirty = git('status', '--porcelain');
const node = execFileSync('node', ['--version'], { encoding: 'utf8' }).trim();
const localFiles = [
  'AGENTS.md',
  'docs/STATUS.md',
  'docs/blueprint.md',
  'docs/usage.md',
  'docs/verification.md',
  'wrangler.jsonc',
];
const files = Object.fromEntries(
  await Promise.all(
    localFiles.map(async (path) => {
      try {
        await access(path);
        return [path, true];
      } catch {
        return [path, false];
      }
    })
  )
);
const warnings: string[] = [];
if (!/^v22\./.test(node))
  warnings.push('Host Node differs from the repository pin. Use Node 22 for release checks.');
if (dirty)
  warnings.push(
    'The checkout has uncommitted work. Inspect and preserve it before editing or releasing.'
  );
let health: Record<string, unknown> = { status: 'skipped' },
  contract: Record<string, unknown> = { status: 'skipped' };
let failures = Object.entries(files).filter(([, present]) => !present).length;
async function get(path: string) {
  const response = await fetch(new URL(path, base.origin), {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}
if (!offline) {
  try {
    const value = await get('/health');
    if (value.service !== 'zine-api' || value.status !== 'ok')
      throw new Error('Unexpected service identity or health status');
    health = {
      status: 'passed',
      service: value.service,
      version: value.version,
      deploymentId: value.deploymentId,
      scope: 'Public health endpoint; includes its database connectivity check',
    };
  } catch (error) {
    failures++;
    health = {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Health check failed',
    };
  }
  try {
    const value = await get('/openapi.json');
    const paths = value.paths as Record<string, Record<string, unknown>> | undefined;
    if (!paths?.['/v1/saves'] || !paths['/v1/items/search'] || !paths['/v1/subscriptions'])
      throw new Error('Expected rewrite API operations are missing');
    contract = {
      status: 'passed',
      paths: Object.keys(paths).length,
      scope: 'Public API contract availability; not behavior verification',
    };
  } catch (error) {
    failures++;
    contract = {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Contract check failed',
    };
  }
}
console.log(
  JSON.stringify(
    {
      at: new Date().toISOString(),
      apiOrigin: base.origin,
      mode: offline ? 'offline' : 'public-http',
      checkout: {
        head: git('rev-parse', 'HEAD'),
        branch: git('branch', '--show-current') || 'detached HEAD',
        uncommittedPaths: dirty ? dirty.split('\n').length : 0,
      },
      runtime: {
        bun: execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim(),
        hostNode: node,
        expectedNodeMajor: 22,
      },
      requiredFiles: files,
      checks: { health, contract },
      warnings,
      scope:
        'Local checkout and anonymous HTTP startup checks. Authentication, providers, queue progress, recovery and release readiness require their own verification.',
      nextSteps: [
        'Read docs/STATUS.md and inspect git status',
        'Follow docs/usage.md for authenticated operations',
        'Use docs/verification.md for the evidence map; inspect scripts before running them',
      ],
      completedWithoutFailure: failures === 0,
    },
    null,
    2
  )
);
if (failures) process.exitCode = 1;
