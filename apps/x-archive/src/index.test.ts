import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

const TOKEN = 'zine_pat_test-token-for-x-archive';
const USER_ID = 'user_test';
const testEnv = env as unknown as Env;

async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function api(path: string, init: RequestInit = {}) {
  return SELF.fetch(`https://example.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

function post(tweetId: string) {
  return {
    tweetId,
    url: `https://x.com/example/status/${tweetId}`,
    text: `Post ${tweetId}`,
    publishedAt: '2026-07-11T12:00:00.000Z',
    kind: 'POST',
    author: {
      id: 'author-1',
      username: 'example',
      name: 'Example',
      profileUrl: 'https://x.com/example',
    },
    media: [{ type: 'IMAGE', url: 'https://pbs.twimg.com/media/example.jpg' }],
    links: [
      {
        url: 'https://example.com/story?utm_source=x',
        normalizedUrl: 'https://example.com/story',
        displayUrl: 'example.com/story',
        redirectUrl: 'https://t.co/story',
        source: 'CARD',
        card: {
          title: 'A linked story',
          description: 'Story description',
          domain: 'example.com',
          imageUrl: 'https://example.com/card.jpg',
        },
      },
    ],
    relationships: [],
    metrics: { likes: 10 },
    capturedAt: '2026-07-11T13:00:00.000Z',
  };
}

beforeEach(async () => {
  await testEnv.AUTH_DB.exec('DELETE FROM api_tokens;');
  await testEnv.ARCHIVE_DB.exec(
    'DELETE FROM x_ingest_chunks; DELETE FROM x_timeline_run_items; DELETE FROM x_post_links; DELETE FROM x_post_relationships; DELETE FROM x_posts; DELETE FROM x_authors; DELETE FROM x_timeline_runs;'
  );
  await testEnv.AUTH_DB.prepare(
    `INSERT INTO api_tokens
      (id, user_id, name, token_hash, token_prefix, scopes_json, created_at, last_used_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`
  )
    .bind(
      'token-1',
      USER_ID,
      'Archive test',
      await tokenHash(TOKEN),
      'zine_pat_test',
      JSON.stringify(['x-archive:read', 'x-archive:write']),
      Date.now()
    )
    .run();
});

describe('X archive worker', () => {
  it('captures, deduplicates, completes, reads, and exports a run', async () => {
    const create = await api('/api/v1/x-timeline/runs', {
      method: 'POST',
      body: JSON.stringify({
        runId: 'run-00000001',
        requestedCount: 1,
        startedAt: '2026-07-11T13:00:00.000Z',
        collectorVersion: 'test-v1',
      }),
    });
    expect(create.status).toBe(201);

    const chunkBody = {
      posts: [post('100')],
      items: [
        {
          tweetId: '100',
          position: 0,
          observedAt: '2026-07-11T13:00:00.000Z',
          presentation: 'REPOST',
          repostedBy: { username: 'reposter', name: 'Reposter' },
        },
      ],
    };
    const chunk = await api('/api/v1/x-timeline/runs/run-00000001/chunks/0', {
      method: 'PUT',
      body: JSON.stringify(chunkBody),
    });
    expect(chunk.status).toBe(200);
    expect(await chunk.json()).toMatchObject({
      duplicateChunk: false,
      canonicalPosts: { created: 1, updated: 0, unchanged: 0 },
    });

    const retry = await api('/api/v1/x-timeline/runs/run-00000001/chunks/0', {
      method: 'PUT',
      body: JSON.stringify(chunkBody),
    });
    expect(await retry.json()).toMatchObject({ duplicateChunk: true });

    const complete = await api('/api/v1/x-timeline/runs/run-00000001/complete', {
      method: 'POST',
      body: JSON.stringify({
        collectedCount: 1,
        completedAt: '2026-07-11T13:01:00.000Z',
        excludedAds: 2,
        status: 'COMPLETE',
        failureReason: null,
      }),
    });
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({
      run: { id: 'run-00000001', collectedCount: 1, excludedAds: 2, status: 'COMPLETE' },
    });

    const read = await api('/api/v1/x-timeline/runs/run-00000001');
    expect(await read.json()).toMatchObject({
      items: [
        {
          position: 0,
          presentation: 'REPOST',
          repostedBy: { username: 'reposter' },
          post: {
            tweetId: '100',
            text: 'Post 100',
            links: [
              {
                normalizedUrl: 'https://example.com/story',
                source: 'CARD',
                card: { title: 'A linked story' },
              },
            ],
          },
        },
      ],
    });

    const links = await api(
      `/api/v1/x-timeline/links?runId=run-00000001&normalizedUrl=${encodeURIComponent('https://example.com/story')}`
    );
    expect(await links.json()).toMatchObject({
      links: [
        {
          normalizedUrl: 'https://example.com/story',
          redirectUrl: 'https://t.co/story',
          source: 'CARD',
          card: { title: 'A linked story', domain: 'example.com' },
          post: { tweetId: '100' },
        },
      ],
    });

    const indexedLinks = await testEnv.ARCHIVE_DB.prepare(
      'SELECT COUNT(*) AS count FROM x_post_links WHERE normalized_url = ?'
    )
      .bind('https://example.com/story')
      .first<{ count: number }>();
    expect(indexedLinks?.count).toBe(1);

    expect(await testEnv.ARCHIVE_BUCKET.head('users/user_test/posts/100.json.gz')).not.toBeNull();
    const exported = await api('/api/v1/x-timeline/runs/run-00000001/export');
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-encoding')).toBe('gzip');
  });

  it('stores one canonical post across multiple runs', async () => {
    for (const [index, runId] of ['run-00000001', 'run-00000002'].entries()) {
      await api('/api/v1/x-timeline/runs', {
        method: 'POST',
        body: JSON.stringify({
          runId,
          requestedCount: 1,
          startedAt: `2026-07-1${index + 1}T13:00:00.000Z`,
          collectorVersion: 'test-v1',
        }),
      });
      const response = await api(`/api/v1/x-timeline/runs/${runId}/chunks/0`, {
        method: 'PUT',
        body: JSON.stringify({
          posts: [index === 0 ? post('100') : { ...post('100'), links: [] }],
          items: [
            {
              tweetId: '100',
              position: 0,
              observedAt: `2026-07-1${index + 1}T13:00:00.000Z`,
              presentation: 'POST',
            },
          ],
        }),
      });
      expect(response.status).toBe(200);
    }

    const posts = await testEnv.ARCHIVE_DB.prepare('SELECT COUNT(*) AS count FROM x_posts').first<{
      count: number;
    }>();
    const pointers = await testEnv.ARCHIVE_DB.prepare(
      'SELECT COUNT(*) AS count FROM x_timeline_run_items'
    ).first<{ count: number }>();
    expect(posts?.count).toBe(1);
    expect(pointers?.count).toBe(2);

    const read = await api('/api/v1/x-timeline/posts/100');
    expect(await read.json()).toMatchObject({
      post: {
        tweetId: '100',
        links: [{ normalizedUrl: 'https://example.com/story', source: 'CARD' }],
      },
    });
  });

  it('accepts an empty-link chunk retry recorded with the version 1 checksum shape', async () => {
    await api('/api/v1/x-timeline/runs', {
      method: 'POST',
      body: JSON.stringify({
        runId: 'run-legacy-retry',
        requestedCount: 1,
        startedAt: '2026-07-11T13:00:00.000Z',
        collectorVersion: 'browser-dom-v2',
      }),
    });
    const legacyPost: Partial<ReturnType<typeof post>> = post('900');
    delete legacyPost.links;
    const legacyChunk = {
      chunkIndex: 0,
      posts: [legacyPost],
      items: [
        {
          tweetId: '900',
          position: 0,
          observedAt: '2026-07-11T13:00:00.000Z',
          presentation: 'POST',
        },
      ],
    };
    await testEnv.ARCHIVE_DB.prepare(
      `INSERT INTO x_ingest_chunks
        (run_id, chunk_index, checksum, posts_received, timeline_items_received, created_at)
       VALUES (?, 0, ?, 1, 1, ?)`
    )
      .bind('run-legacy-retry', await tokenHash(JSON.stringify(legacyChunk)), Date.now())
      .run();

    const retry = await api('/api/v1/x-timeline/runs/run-legacy-retry/chunks/0', {
      method: 'PUT',
      body: JSON.stringify({ posts: legacyChunk.posts, items: legacyChunk.items }),
    });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ duplicateChunk: true });
  });

  it('requires archive-specific token scopes', async () => {
    await testEnv.AUTH_DB.prepare('UPDATE api_tokens SET scopes_json = ? WHERE id = ?')
      .bind(JSON.stringify(['bookmarks:write']), 'token-1')
      .run();
    const response = await api('/api/v1/x-timeline/runs');
    expect(response.status).toBe(403);
  });
});
