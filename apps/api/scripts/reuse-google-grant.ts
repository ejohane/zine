import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { realSession } from './clerk-session';
import { existingProviderCredentials } from './provider-credentials';

// Explicitly authorized credential reuse: one account's existing Google grant.
// This is a one-time copy, not a runtime dependency on the former backend.
// Old database access is SELECT only. Tokens never enter arguments, logs or files.
const session = await realSession();
try {
  const token = await session.getToken();
  const me = await fetch('https://api-next.myzine.app/v1/me', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!me.ok) throw new Error('New API authentication failed');
  const { id: owner } = (await me.json()) as { id: string };
  if (!/^user_[A-Za-z0-9]+$/.test(owner)) throw new Error('Unexpected authenticated subject');
  const configuration = parseEnv(
    await readFile(
      process.env.ZINE_EXISTING_PROVIDER_CONFIG ??
        '/Users/erikjohansson/dev/zine/apps/worker/.dev.vars',
      'utf8'
    )
  );
  const credentials = await existingProviderCredentials();
  const sourceDatabase = process.env.ZINE_CREDENTIAL_SOURCE_DATABASE ?? 'zine-db-production';
  const sourceEnvironment =
    sourceDatabase === 'zine-db-production'
      ? 'production'
      : sourceDatabase === 'zine-db-dev'
        ? 'development'
        : null;
  if (!sourceEnvironment) throw new Error('Unsupported credential source database');
  const child = spawn(
    'bunx',
    [
      'wrangler',
      'd1',
      'execute',
      sourceDatabase,
      '--remote',
      ...(sourceEnvironment === 'production' ? ['--env', 'production'] : []),
      '--command',
      `SELECT refresh_token FROM provider_connections WHERE user_id='${owner}' AND provider='YOUTUBE' AND status='ACTIVE' LIMIT 1`,
      '--json',
    ],
    { cwd: '../worker', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.resume();
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
  if (code) throw new Error('Read-only credential lookup failed; output suppressed');
  const result = JSON.parse(output) as { results: { refresh_token: string }[] }[];
  const encrypted = result[0]?.results[0]?.refresh_token;
  if (!encrypted) throw new Error('No active Google credential found for this account');
  const parts = encrypted.split(':');
  if (parts[0].startsWith('v')) parts.shift();
  if (parts.length !== 2) throw new Error('Unknown source credential envelope');
  const keyHex = process.env.ENCRYPTION_KEY ?? configuration.ENCRYPTION_KEY;
  if (!keyHex || !/^[a-fA-F0-9]{64}$/.test(keyHex))
    throw new Error('Source credential key not available');
  const key = await crypto.subtle.importKey('raw', Buffer.from(keyHex, 'hex'), 'AES-GCM', false, [
    'decrypt',
  ]);
  let clear: ArrayBuffer;
  try {
    clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Buffer.from(parts[0], 'hex') },
      key,
      Buffer.from(parts[1], 'hex')
    );
  } catch {
    throw new Error('Source credential key could not decrypt the existing grant');
  }
  const refreshToken = new TextDecoder().decode(clear);
  const response = await fetch('https://api-next.myzine.app/v1/connections/google', {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${await session.getToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      clientId: credentials.GOOGLE_CLIENT_ID,
      clientSecret: credentials.GOOGLE_CLIENT_SECRET,
      refreshToken,
    }),
  });
  const value = (await response.json()) as { status?: string; error?: { code?: string } };
  const evidence = {
    at: new Date().toISOString(),
    provider: 'google',
    httpStatus: response.status,
    status: value.status ?? value.error?.code,
    requestId: response.headers.get('x-request-id'),
    oldInfrastructureChanged: false,
    credentialValuesPersistedLocally: false,
  };
  await writeFile('evidence/google-grant-reuse.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
  if (!response.ok) process.exitCode = 1;
} catch (error) {
  const known = new Map([
    [
      'Source credential key could not decrypt the existing grant',
      'existing_grant_decryption_failed',
    ],
    ['No active Google credential found for this account', 'no_active_source_grant'],
    ['Source credential key not available', 'source_encryption_key_unavailable'],
  ]);
  const status =
    error instanceof Error
      ? (known.get(error.message) ?? 'credential_investigation_failed')
      : 'credential_investigation_failed';
  const evidence = {
    at: new Date().toISOString(),
    provider: 'google',
    status,
    oldInfrastructureChanged: false,
    credentialValuesPersistedLocally: false,
  };
  await writeFile('evidence/google-grant-reuse.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
  process.exitCode = 1;
} finally {
  await session.close();
}
