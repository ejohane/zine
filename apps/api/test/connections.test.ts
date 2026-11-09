import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { googleToken, openCredentials, sealCredentials } from '../src/connections';
import { now, stmt } from '../src/lib';
import type { Env } from '../src/types';

describe('independent owner-bound provider credentials', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let env: Env;
  beforeAll(async () => {
    runtime = await runtimeHarness();
    env = { DB: runtime.db as unknown as D1Database, CREDENTIAL_KEY: btoa('a'.repeat(32)) } as Env;
  });
  afterAll(async () => runtime?.close());
  it('encrypts credentials with randomized nonces and owner-bound authentication', async () => {
    const credential = { clientId: 'synthetic-client', refreshToken: 'synthetic-refresh-token' };
    const a = await sealCredentials(env, 'owner-a', credential),
      b = await sealCredentials(env, 'owner-a', credential);
    expect(a).not.toBe(b);
    expect(a).not.toContain(credential.refreshToken);
    expect(await openCredentials(env, 'owner-a', a)).toEqual(credential);
    await expect(openCredentials(env, 'owner-b', a)).rejects.toThrow();
    const keyChanged = { ...env, CREDENTIAL_KEY: btoa('b'.repeat(32)) };
    await expect(openCredentials(keyChanged, 'owner-a', a)).rejects.toThrow();
  });
  it('isolates token lookup and disconnects a single owner without touching another grant', async () => {
    const envelope = await sealCredentials(env, 'owner-a', {
      clientId: 'client',
      refreshToken: 'refresh',
      accessToken: 'synthetic-access',
      expiresAt: Date.now() + 3600000,
    });
    await stmt(
      env.DB,
      "INSERT INTO connections(owner_id,provider,credentials,status,created_at,updated_at) VALUES(?,'google',?,'active',?,?)",
      'owner-a',
      envelope,
      now(),
      now()
    ).run();
    expect(await googleToken(env, 'owner-a')).toBe('synthetic-access');
    expect(await googleToken(env, 'owner-b')).toBeNull();
    await stmt(
      env.DB,
      "UPDATE connections SET status='reauthorization_required' WHERE owner_id=?",
      'owner-a'
    ).run();
    await expect(googleToken(env, 'owner-a')).rejects.toMatchObject({
      code: 'google_reauthorization_required',
    });
    await stmt(env.DB, 'DELETE FROM connections WHERE owner_id=?', 'owner-a').run();
    expect(await googleToken(env, 'owner-a')).toBeNull();
  });
});
