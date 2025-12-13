/**
 * User Durable Object Tests
 *
 * Integration tests for UserDO using Miniflare's isolated storage.
 *
 * Note: These tests use the Cloudflare Workers vitest pool which provides
 * proper SQLite storage for Durable Objects.
 */

import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { Provider, ContentType } from '@zine/shared';

// Helper to get a fresh DO instance
const getUserDO = (suffix = '') => {
  const id = env.USER_DO.idFromName(`test-user-${Date.now()}-${Math.random()}${suffix}`);
  return env.USER_DO.get(id);
};

describe('UserDO', () => {
  describe('/init', () => {
    it('runs migrations and returns schema version', async () => {
      const stub = getUserDO('init-1');

      const res = await stub.fetch('http://do/init', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        success: boolean;
        schemaVersion: number;
        migrationsApplied: string[];
      };

      expect(data.success).toBe(true);
      expect(data.schemaVersion).toBeGreaterThan(0);
      expect(data.migrationsApplied).toBeDefined();
    });

    it('stores user profile when provided', async () => {
      const stub = getUserDO('init-2');

      const res = await stub.fetch('http://do/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user_123',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          createdAt: '2024-01-01T00:00:00Z',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { profileUpdated: boolean };
      expect(data.profileUpdated).toBe(true);
    });
  });

  describe('/push', () => {
    it('processes addSource mutation', async () => {
      const stub = getUserDO('push-1');

      const pushRes = await stub.fetch('http://do/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientGroupID: 'client-group-1',
          profileID: 'user_123',
          mutations: [
            {
              id: 1,
              name: 'addSource',
              args: {
                source: {
                  id: 'source-1',
                  provider: Provider.YOUTUBE,
                  providerId: 'UC123',
                  name: 'Test Channel',
                },
              },
              timestamp: Date.now(),
            },
          ],
        }),
      });

      expect(pushRes.status).toBe(200);
      const pushData = (await pushRes.json()) as { error?: string };
      expect(pushData.error).toBeUndefined();
    });

    it('rejects invalid request', async () => {
      const stub = getUserDO('push-2');

      const res = await stub.fetch('http://do/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required fields
          mutations: [],
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Invalid request');
    });
  });

  describe('/pull', () => {
    it('returns data for initial sync', async () => {
      const stub = getUserDO('pull-1');

      const res = await stub.fetch('http://do/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientGroupID: 'new-client',
          profileID: 'user_123',
          cookie: null,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        cookie: { version: number; schemaVersion: number };
        lastMutationIDChanges: Record<string, number>;
        patch: Array<{ op: string }>;
      };

      expect(data.cookie).toBeDefined();
      expect(data.cookie.version).toBeDefined();
      expect(data.lastMutationIDChanges).toBeDefined();
      expect(data.patch).toContainEqual({ op: 'clear' });
    });
  });

  describe('/ingest', () => {
    it('requires valid sourceId and items', async () => {
      const stub = getUserDO('ingest-1');

      const res = await stub.fetch('http://do/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing sourceId
          items: [],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns error for non-existent source', async () => {
      const stub = getUserDO('ingest-2');

      const res = await stub.fetch('http://do/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: 'non-existent',
          items: [
            {
              providerItemId: 'item-1',
              contentType: ContentType.ARTICLE,
              title: 'Test',
            },
          ],
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { errors: string[] };
      expect(data.errors).toContain('Source non-existent not found');
    });
  });

  describe('/cleanup and /delete', () => {
    it('cleanup succeeds', async () => {
      const stub = getUserDO('cleanup-1');

      const res = await stub.fetch('http://do/cleanup', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('/delete works as alias', async () => {
      const stub = getUserDO('delete-1');

      const res = await stub.fetch('http://do/delete', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });
  });

  describe('/profile', () => {
    it('returns null for user without profile', async () => {
      const stub = getUserDO('profile-1');

      const res = await stub.fetch('http://do/profile', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { profile: null };
      expect(data.profile).toBeNull();
    });

    it('rejects non-GET requests', async () => {
      const stub = getUserDO('profile-2');

      const res = await stub.fetch('http://do/profile', {
        method: 'POST',
      });

      expect(res.status).toBe(405);
    });
  });

  describe('error handling', () => {
    it('returns 404 for unknown routes', async () => {
      const stub = getUserDO('error-1');

      const res = await stub.fetch('http://do/unknown-route', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Not Found');
    });

    it('returns 405 for wrong HTTP method', async () => {
      const stub = getUserDO('error-2');

      const res = await stub.fetch('http://do/push', {
        method: 'GET',
      });

      expect(res.status).toBe(405);
    });
  });
});
