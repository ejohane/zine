import { readFile, writeFile } from 'node:fs/promises';

// The frontend publishable key is public configuration. No backend secret,
// session token or user credential is read or persisted by this script.
const path = process.env.ZINE_EXISTING_PUBLIC_AUTH_CONFIG ?? '../ios/Configuration/Config.xcconfig';
const configuration = await readFile(path, 'utf8');
const key =
  process.env.ZINE_PUBLIC_CLERK_KEY ??
  configuration.match(/^ZINE_CLERK_PUBLISHABLE_KEY\s*=\s*(\S+)/m)?.[1];
if (!key || !/^pk_(live|test)_[A-Za-z0-9+/=]+$/.test(key))
  throw new Error('No valid public Clerk key found');
let wrangler = await readFile('wrangler.jsonc', 'utf8');
const domain = Buffer.from(key.split('_')[2], 'base64').toString().replace(/\$$/, '');
if (!/^[a-z0-9.-]+$/.test(domain)) throw new Error('Invalid Clerk domain');
wrangler = wrangler.replace(/"AUTH_ISSUER":\s*"[^"]*"/, `"AUTH_ISSUER": "https://${domain}"`);
if (wrangler.includes('"CLERK_PUBLISHABLE_KEY"'))
  wrangler = wrangler.replace(
    /"CLERK_PUBLISHABLE_KEY":\s*"[^"]*"/,
    `"CLERK_PUBLISHABLE_KEY": ${JSON.stringify(key)}`
  );
else
  wrangler = wrangler.replace(
    /("AUTH_ISSUER":\s*"[^"]*",)/,
    `$1\n    "CLERK_PUBLISHABLE_KEY": ${JSON.stringify(key)},`
  );
await writeFile('wrangler.jsonc', wrangler);
console.log(JSON.stringify({ publicAuthConfigured: true, secretValuesPersisted: false }));
