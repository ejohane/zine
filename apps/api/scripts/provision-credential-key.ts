import { spawn } from 'node:child_process';
async function execute(args: string[], input?: string) {
  const child = spawn('bunx', ['wrangler@4.158.0', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.resume();
  child.stdin.end(input);
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
  if (code) throw new Error(`Credential configuration failed (${code}); output suppressed`);
  return output;
}
const listed = await execute(['secret', 'list', '--name', 'zine-api-next']);
if (listed.includes('"CREDENTIAL_KEY"')) {
  console.log(JSON.stringify({ credentialKey: 'already_configured' }));
} else {
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
  await execute(
    ['secret', 'bulk', '--name', 'zine-api-next'],
    JSON.stringify({ CREDENTIAL_KEY: key })
  );
  console.log(
    JSON.stringify({ credentialKey: 'new_independent_key_provisioned', valuesLogged: false })
  );
}
