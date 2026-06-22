/**
 * @vitest-environment miniflare
 */

import { describe, expect, it, vi } from 'vitest';
import { apiTokensRouter } from './api-tokens';
import type { TRPCContext } from '../context';

function createTokenRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token_1',
    userId: 'user_123',
    name: 'Codex on MacBook',
    tokenHash: 'secret-hash',
    tokenPrefix: 'zine_pat_abcd1234',
    scopesJson: JSON.stringify(['bookmarks:read', 'bookmarks:write']),
    createdAt: 1_800_000_000_000,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function createContext(db: unknown): TRPCContext {
  return {
    userId: 'user_123',
    db,
    env: {} as TRPCContext['env'],
    requestId: 'request-id',
    traceId: 'trace-id',
    clientRequestId: undefined,
    environment: 'test',
    release: {},
  } as TRPCContext;
}

describe('apiTokensRouter', () => {
  it('lists token summaries without raw tokens or hashes', async () => {
    const token = createTokenRecord();
    const orderBy = vi.fn().mockResolvedValue([token]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const caller = apiTokensRouter.createCaller(createContext({ select }));

    const result = await caller.list();

    expect(result.tokens).toEqual([
      {
        id: 'token_1',
        name: 'Codex on MacBook',
        tokenPrefix: 'zine_pat_abcd1234',
        scopes: ['bookmarks:read', 'bookmarks:write'],
        createdAt: 1_800_000_000_000,
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-hash');
  });

  it('creates a token, stores only a hash, and returns the raw token once', async () => {
    const insertedTokens: Record<string, unknown>[] = [];
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const insert = vi
      .fn()
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({ onConflictDoNothing }),
      })
      .mockReturnValueOnce({
        values: vi.fn(async (values: Record<string, unknown>) => {
          insertedTokens.push(values);
        }),
      });

    const findFirst = vi.fn(async () =>
      createTokenRecord({
        id: insertedTokens[0]?.id,
        name: insertedTokens[0]?.name,
        tokenHash: insertedTokens[0]?.tokenHash,
        tokenPrefix: insertedTokens[0]?.tokenPrefix,
        scopesJson: insertedTokens[0]?.scopesJson,
        createdAt: insertedTokens[0]?.createdAt,
      })
    );
    const caller = apiTokensRouter.createCaller(
      createContext({
        insert,
        query: { apiTokens: { findFirst } },
      })
    );

    const result = await caller.create({
      name: 'Codex on MacBook',
      scopes: ['bookmarks:read', 'bookmarks:write'],
    });

    expect(result.rawToken).toMatch(/^zine_pat_/);
    const storedToken = insertedTokens[0];
    if (!storedToken) {
      throw new Error('Expected token insert values to be captured');
    }
    expect(storedToken.tokenHash).toEqual(expect.any(String));
    expect(storedToken.tokenHash).not.toBe(result.rawToken);
    expect(storedToken.tokenPrefix).toBe(result.rawToken.slice(0, 'zine_pat_'.length + 8));
    expect(result.token).not.toHaveProperty('tokenHash');
  });

  it('revokes an owned active token', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'token_1' }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const caller = apiTokensRouter.createCaller(createContext({ update }));

    await expect(caller.revoke({ id: 'token_1' })).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalledWith({ revokedAt: expect.any(Number) });
  });

  it('rejects revoke for missing tokens', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const caller = apiTokensRouter.createCaller(createContext({ update }));

    await expect(caller.revoke({ id: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
