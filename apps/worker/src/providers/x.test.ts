import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchXBookmarksPage, lookupXUserByUsername, searchXUsers, XAuthError } from './x';
import type { XRateLimitError } from './x';

type FetchMock = ReturnType<typeof vi.fn>;

describe('X provider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as never;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches one capped bookmark page with minimal display fields', async () => {
    const fetchMock = globalThis.fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'tweet-1', text: 'Saved post', author_id: 'user-1' }],
          includes: { users: [{ id: 'user-1', name: 'Author', username: 'author' }] },
          meta: { result_count: 1 },
        }),
        {
          status: 200,
          headers: {
            'x-rate-limit-limit': '180',
            'x-rate-limit-remaining': '179',
            'x-rate-limit-reset': '1700000100',
          },
        }
      )
    );

    const result = await fetchXBookmarksPage({
      accessToken: 'token',
      userId: 'x-user-1',
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.pathname).toBe('/2/users/x-user-1/bookmarks');
    expect(requestedUrl.searchParams.get('max_results')).toBe('100');
    expect(requestedUrl.searchParams.get('tweet.fields')).toContain('text');
    expect(requestedUrl.searchParams.get('expansions')).toContain('author_id');
    expect(result.data?.[0].id).toBe('tweet-1');
    expect(result.rateLimit.remaining).toBe(179);
    expect(result.rateLimit.resetAt).toBe(1700000100 * 1000);
  });

  it('throws a structured rate-limit error for 429 responses', async () => {
    (globalThis.fetch as unknown as FetchMock).mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ title: 'Too Many Requests' }] }), {
        status: 429,
        headers: {
          'x-rate-limit-reset': '1700000200',
        },
      })
    );

    await expect(
      fetchXBookmarksPage({ accessToken: 'token', userId: 'x-user-1' })
    ).rejects.toMatchObject({
      name: 'XRateLimitError',
      resetAt: 1700000200 * 1000,
    } satisfies Partial<XRateLimitError>);
  });

  it('throws an auth error for revoked or insufficient X access', async () => {
    (globalThis.fetch as unknown as FetchMock).mockResolvedValue(
      new Response('Forbidden', { status: 403 })
    );

    await expect(
      fetchXBookmarksPage({ accessToken: 'token', userId: 'x-user-1' })
    ).rejects.toBeInstanceOf(XAuthError);
  });

  it('searches X users with profile fields for inferred social resolution', async () => {
    const fetchMock = globalThis.fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'user-1',
              name: 'Armin Ronacher',
              username: 'mitsuhiko',
              description: 'Creator of Flask',
              profile_image_url: 'https://pbs.twimg.com/profile_images/armin.jpg',
              verified: true,
            },
          ],
        }),
        { status: 200 }
      )
    );

    const users = await searchXUsers({
      bearerToken: 'bearer',
      query: '"Armin Ronacher" Flask',
      maxResults: 5,
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.pathname).toBe('/2/users/search');
    expect(requestedUrl.searchParams.get('query')).toBe('"Armin Ronacher" Flask');
    expect(requestedUrl.searchParams.get('user.fields')).toContain('profile_image_url');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'Bearer bearer',
      }),
    });
    expect(users[0].username).toBe('mitsuhiko');
  });

  it('looks up an X user by username with profile fields', async () => {
    const fetchMock = globalThis.fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: 'user-2',
            name: 'Marc Andreessen',
            username: 'pmarca',
            description: 'Partner at a16z.',
            profile_image_url: 'https://pbs.twimg.com/profile_images/pmarca.jpg',
            verified: true,
          },
        }),
        { status: 200 }
      )
    );

    const user = await lookupXUserByUsername({
      bearerToken: 'bearer',
      username: 'pmarca',
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.pathname).toBe('/2/users/by/username/pmarca');
    expect(requestedUrl.searchParams.get('user.fields')).toContain('profile_image_url');
    expect(user?.name).toBe('Marc Andreessen');
    expect(user?.username).toBe('pmarca');
  });
});
