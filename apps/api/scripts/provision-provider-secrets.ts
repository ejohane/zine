import { spawn } from 'node:child_process';
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--staging'))
  throw new Error('Use no argument for production or --staging');
const workerName = args[0] === '--staging' ? 'zine-api-next-staging' : 'zine-api-next';
import { existingProviderCredentials } from './provider-credentials';

// Values travel only from approved existing configuration through stdin to
// Wrangler's secret upload. No shell interpolation, temp file, log or CLI value.
const credentials = await existingProviderCredentials();
// App-only X credentials are issued here once and stored only as a new Worker
// secret. This avoids making every cold isolate depend on token issuance.
if (!credentials.X_BEARER_TOKEN && credentials.X_CLIENT_ID && credentials.X_CLIENT_SECRET) {
  const response = await fetch('https://api.x.com/oauth2/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${encodeURIComponent(credentials.X_CLIENT_ID)}:${encodeURIComponent(credentials.X_CLIENT_SECRET)}`)}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'ZineApi/0.1 (+https://myzine.app)',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(`X app token provisioning failed (${response.status}); details suppressed`);
  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) throw new Error('X app token response was incomplete');
  credentials.X_BEARER_TOKEN = token.access_token;
}
if (!Object.keys(credentials).length) throw new Error('No reusable provider credentials found');
const child = spawn('bunx', ['wrangler@4.158.0', 'secret', 'bulk', '--name', workerName], {
  stdio: ['pipe', 'inherit', 'inherit'],
});
child.stdin.end(JSON.stringify(credentials));
const code = await new Promise<number>((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', (code) => resolve(code ?? 1));
});
if (code) process.exitCode = code;
