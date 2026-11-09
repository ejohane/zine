import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { existingProviderCredentials } from './provider-credentials';
const token = process.env.CLOUDFLARE_API_TOKEN;
assert.ok(token, 'Cloudflare inspection credential unavailable');
const response = await fetch(
  'https://api.cloudflare.com/client/v4/accounts/887513bb1f71a8ef2029e2f9bd3086b2/workers/scripts/zine-worker-production/settings',
  { headers: { authorization: `Bearer ${token}` } }
);
assert.ok(response.ok, `Settings metadata inspection ${response.status}`);
const value = (await response.json()) as {
  success: boolean;
  result: { bindings: { name: string; type: string; text?: string }[] };
};
assert.equal(value.success, true);
const bindings = value.result.bindings
  .filter((binding) =>
    /^(ENCRYPTION_KEY(?:_PREVIOUS|_VERSION(?:_PREVIOUS)?)?|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|YOUTUBE_API_KEY)$/.test(
      binding.name
    )
  )
  .map((binding) => ({
    name: binding.name,
    type: binding.type,
    readableValueAvailable: typeof binding.text === 'string' && binding.text.length > 0,
  }));
const local = await existingProviderCredentials();
const presentLocalNames = Object.keys(local).filter(
  (name) => name.startsWith('GOOGLE_') || name === 'YOUTUBE_API_KEY'
);
const profiles = execFileSync('secretsctl', ['profiles'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((line) => line.startsWith('zine.'))
  .map((line) => {
    const fields = line.split('\t');
    return { name: fields[0], status: fields[1], configuration: fields[2] };
  });
const report = {
  at: new Date().toISOString(),
  scope:
    'Read-only metadata from the existing production Worker, current process/existing local provider configuration and allowlisted Zine secrets profiles; no credential values recorded',
  originalWorkerBindings: bindings,
  presentLocalNames,
  allowlistedProfiles: profiles,
  originalInfrastructureChanged: false,
  valuesPersisted: false,
  note: 'An existing production secret binding is not a readable credential value. The local encryption key failed to decrypt the existing account grant in google-grant-reuse.json. This inventory does not claim there are no credentials in other uninspected sources.',
};
await writeFile(
  'evidence/google-credential-availability.json',
  JSON.stringify(report, null, 2) + '\n'
);
console.log(
  JSON.stringify({
    bindings,
    presentLocalNames,
    profiles,
    originalInfrastructureChanged: false,
    valuesPersisted: false,
  })
);
