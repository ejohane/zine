import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchXBookmarksPage, XAuthError } from './x';
import type { XRateLimitError } from './x';

describe('X provider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches one capped bookmark page with minimal display fields', async () => {
    const fetchMock = vi.mocked(fetch);
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
    vi.mocked(fetch).mockResolvedValue(
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
    vi.mocked(fetch).mockResolvedValue(new Response('Forbidden', { status: 403 }));

    await expect(
      fetchXBookmarksPage({ accessToken: 'token', userId: 'x-user-1' })
    ).rejects.toBeInstanceOf(XAuthError);
  });
});
