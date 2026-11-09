import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { realSession } from './clerk-session';
import { ZineClient } from '../client';
// Values travel from the approved live login to this service and gh stdin only.
const session = await realSession(),
  client = new ZineClient({
    baseUrl: 'https://api-next.myzine.app',
    token: session.getToken,
    retries: 0,
  });
let id: string | undefined,
  configured = false;
async function gh(args: string[], input?: string) {
  const process = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  process.stdout.resume();
  process.stderr.resume();
  process.stdin.end(input);
  const code = await new Promise<number>((resolve, reject) => {
    process.on('error', reject);
    process.on('exit', (c) => resolve(c ?? 1));
  });
  assert.equal(code, 0, 'GitHub monitor configuration failed; output suppressed');
}
try {
  const name = 'Zine API scheduled monitor';
  const old = await client.request<{ tokens: { id: string; name: string }[] }>('GET', '/v1/tokens');
  const key = await client.request<{ id: string; token: string; expiresAt: string }>(
    'POST',
    '/v1/tokens',
    { name, expiresInDays: 365, scopes: ['ops:read'] }
  );
  id = key.id;
  await gh(['secret', 'set', 'ZINE_API_NEXT_OPS_TOKEN', '--repo', 'ejohane/zine'], key.token);
  await gh([
    'variable',
    'set',
    'ZINE_API_NEXT_OPS_TOKEN_EXPIRES_AT',
    '--repo',
    'ejohane/zine',
    '--body',
    key.expiresAt,
  ]);
  configured = true;
  for (const token of old.tokens.filter((t) => t.name === name))
    await client.request('DELETE', '/v1/tokens/' + token.id);
  console.log(
    JSON.stringify({
      configured: true,
      scopes: ['ops:read'],
      expiresAt: key.expiresAt,
      secretValuesLogged: false,
      oldNamedMonitorTokensRevoked: true,
    })
  );
} finally {
  if (id && !configured) await client.request('DELETE', '/v1/tokens/' + id);
  await session.close();
}
