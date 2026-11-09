import { Hono } from 'hono';
import { z } from 'zod4';
import {
  all,
  ApiError,
  atomicOwnerWrite,
  operationGeneration,
  ownerGeneration,
  now,
  parseBody,
  stmt,
} from './lib';
import { ProviderError, providerJson } from './remote';
import type { AppEnv, Env } from './types';

export const googleCredentialSchema = z
  .object({
    clientId: z.string().min(1).max(1000),
    clientSecret: z
      .string()
      .min(1)
      .max(4000)
      .meta({ writeOnly: true, format: 'password' })
      .optional(),
    refreshToken: z.string().min(1).max(16000).meta({ writeOnly: true, format: 'password' }),
  })
  .strict();
type Credentials = z.infer<typeof googleCredentialSchema> & {
  accessToken?: string;
  expiresAt?: number;
};
const encoder = new TextEncoder();
async function key(env: Env) {
  if (!env.CREDENTIAL_KEY)
    throw new ApiError(
      503,
      'credential_storage_unavailable',
      'Provider credential storage is not configured'
    );
  const bytes = Uint8Array.from(atob(env.CREDENTIAL_KEY), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error('Invalid credential key configuration');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const base64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join(''));
/** Authenticated envelope binds ciphertext to its owner and purpose. */
export async function sealCredentials(env: Env, owner: string, credentials: Credentials) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`zine-api:google:${owner}`) },
    await key(env),
    encoder.encode(JSON.stringify(credentials))
  );
  return `1.${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}
export async function openCredentials(
  env: Env,
  owner: string,
  envelope: string
): Promise<Credentials> {
  const [version, iv, data] = envelope.split('.');
  if (version !== '1' || !iv || !data) throw new Error('Invalid credential envelope');
  const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(iv), additionalData: encoder.encode(`zine-api:google:${owner}`) },
    await key(env),
    decode(data)
  );
  return JSON.parse(new TextDecoder().decode(clear)) as Credentials;
}
async function refresh(credentials: Credentials): Promise<Credentials> {
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
    client_id: credentials.clientId,
    ...(credentials.clientSecret ? { client_secret: credentials.clientSecret } : {}),
  });
  const result = await providerJson<{
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  }>(new URL('https://oauth2.googleapis.com/token'), undefined, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!result.access_token || !result.expires_in)
    throw new ProviderError('google_invalid_token_response', false);
  return {
    ...credentials,
    refreshToken: result.refresh_token ?? credentials.refreshToken,
    accessToken: result.access_token,
    expiresAt: Date.now() + result.expires_in * 1000,
  };
}
export async function googleToken(env: Env, owner: string, force = false): Promise<string | null> {
  const epoch = await operationGeneration(env, owner);
  if ((await ownerGeneration(env, owner)) !== epoch)
    throw new ApiError(409, 'account_data_erased', 'The account was erased during this request');
  const row = await stmt(
    env.DB,
    "SELECT credentials,revision,status FROM connections WHERE owner_id=? AND provider='google'",
    owner
  ).first<{ credentials: string; revision: number; status: string }>();
  if (!row) return null;
  if (row.status !== 'active') throw new ProviderError('google_reauthorization_required', false);
  const credentials = await openCredentials(env, owner, row.credentials);
  if (!force && credentials.accessToken && credentials.expiresAt! > Date.now() + 60000)
    return credentials.accessToken;
  try {
    const updated = await refresh(credentials);
    const [written] = await atomicOwnerWrite(
      env,
      owner,
      [
        stmt(
          env.DB,
          "UPDATE connections SET credentials=?,revision=revision+1,updated_at=? WHERE owner_id=? AND provider='google' AND revision=? AND credentials=?",
          await sealCredentials(env, owner, updated),
          now(),
          owner,
          row.revision,
          row.credentials
        ),
      ],
      epoch
    );
    if (!written.meta.changes) return googleToken(env, owner);
    return updated.accessToken!;
  } catch (error) {
    if (
      error instanceof ProviderError &&
      ['provider_http_400', 'provider_credentials_expired'].includes(error.code)
    ) {
      const [changed] = await atomicOwnerWrite(
        env,
        owner,
        [
          stmt(
            env.DB,
            "UPDATE connections SET status='reauthorization_required',updated_at=? WHERE owner_id=? AND provider='google' AND revision=? AND credentials=?",
            now(),
            owner,
            row.revision,
            row.credentials
          ),
        ],
        epoch
      );
      if (!changed.meta.changes) return googleToken(env, owner);
      throw new ProviderError('google_reauthorization_required', false);
    }
    throw error;
  }
}
export const connectionRoutes = new Hono<AppEnv>();
connectionRoutes.use('/connections/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.get('principal').contributor.startsWith('api-token:'))
    throw new ApiError(
      403,
      'interactive_login_required',
      'Manage provider credentials through interactive sign-in'
    );
  await next();
});
connectionRoutes.get('/connections', async (c) =>
  c.json({
    connections: await all(
      c.env.DB,
      'SELECT provider,status,created_at AS createdAt,updated_at AS updatedAt FROM connections WHERE owner_id=?',
      c.get('principal').userId
    ),
  })
);
connectionRoutes.put('/connections/google', async (c) => {
  const input = await parseBody(c.req.raw, googleCredentialSchema);
  const credentials = await refresh(input);
  const owner = c.get('principal').userId;
  const timestamp = now();
  await atomicOwnerWrite(c.env, owner, [
    stmt(
      c.env.DB,
      "INSERT INTO connections(owner_id,provider,credentials,status,created_at,updated_at) VALUES(?,'google',?,'active',?,?) ON CONFLICT(owner_id,provider) DO UPDATE SET credentials=excluded.credentials,status='active',revision=connections.revision+1,updated_at=excluded.updated_at",
      owner,
      await sealCredentials(c.env, owner, credentials),
      timestamp,
      timestamp
    ),
  ]);
  return c.json({ provider: 'google', status: 'active' });
});
connectionRoutes.delete('/connections/google', async (c) => {
  // Local disconnect deliberately does not revoke a grant shared with another
  // application installation. No other Zine installation is modified.
  const [removed] = await atomicOwnerWrite(c.env, c.get('principal').userId, [
    stmt(
      c.env.DB,
      "DELETE FROM connections WHERE owner_id=? AND provider='google'",
      c.get('principal').userId
    ),
  ]);
  if (!removed.meta.changes) throw new ApiError(404, 'not_found', 'Connection not found');
  return c.body(null, 204);
});
