import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

/**
 * Explicitly permitted credential reuse only. This reads existing local provider
 * configuration in memory; it imports no application implementation or tokens.
 * Test-login credentials still come through secretsctl. No output includes values.
 */
export async function existingProviderCredentials() {
  const path =
    process.env.ZINE_EXISTING_PROVIDER_CONFIG ??
    '/Users/erikjohansson/dev/zine/apps/worker/.dev.vars';
  const configuration = parseEnv(await readFile(path, 'utf8'));
  const allowed = [
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'YOUTUBE_API_KEY',
    'X_CLIENT_ID',
    'X_CLIENT_SECRET',
    'X_BEARER_TOKEN',
  ];
  return Object.fromEntries(
    allowed.flatMap((name) => {
      const value = process.env[name] || configuration[name];
      return value ? [[name, value]] : [];
    })
  );
}
