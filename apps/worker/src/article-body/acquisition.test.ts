import { describe, expect, it, vi } from 'vitest';

import {
  acquireArticleBody,
  articleBodyAcquisitionInternals,
  isSafePublicArticleUrl,
} from './acquisition';

function articleText(sentences = 40): string {
  return 'This reporting provides evidence, context, analysis, and useful conclusions. '.repeat(
    sentences
  );
}

function page(title = 'A dependable article', sentences = 40): string {
  return `<!doctype html><html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${articleText(sentences)}</p><p>${articleText(sentences)}</p></article></body></html>`;
}

function input() {
  return {
    itemId: 'item_1',
    canonicalUrl: 'https://example.com/story',
    title: 'A dependable article',
    publisher: 'Example',
  };
}

describe('acquireArticleBody', () => {
  it('uses a high-quality embedded feed body without a public fetch', async () => {
    const fetch = vi.fn();
    const result = await acquireArticleBody(
      {
        ...input(),
        embeddedCandidates: [
          {
            html: `<p>${articleText(40)}</p><p>${articleText(40)}</p>`,
            sourceKind: 'RSS_FULL',
            sourceUrl: 'https://example.com/feed.xml',
          },
        ],
      },
      { fetch: fetch as never, now: () => 1_700_000_000_000 }
    );

    expect(result.status).toBe('AVAILABLE');
    expect(result.artifact).toMatchObject({ sourceKind: 'RSS_FULL', qualityScore: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to public Readability when the feed only exposes a teaser', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(page(), { headers: { 'content-type': 'text/html; charset=utf-8' } })
      );
    const result = await acquireArticleBody(
      {
        ...input(),
        embeddedCandidates: [
          {
            html: '<p>A short teaser. Read more</p>',
            sourceKind: 'RSS_FULL',
            sourceUrl: 'https://example.com/feed.xml',
          },
        ],
      },
      { fetch: fetch as never }
    );

    expect(result.status).toBe('AVAILABLE');
    expect(result.artifact?.sourceKind).toBe('PUBLIC_WEB');
    expect(result.attempts).toMatchObject([
      { sourceKind: 'RSS_FULL', disposition: 'UNAVAILABLE' },
      { sourceKind: 'PUBLIC_WEB', disposition: 'AVAILABLE', httpStatus: 200 },
    ]);
  });

  it('retains a readable degraded feed body when public fallback fails', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('blocked', { status: 403 }));
    const result = await acquireArticleBody(
      {
        ...input(),
        embeddedCandidates: [
          {
            html: `<p>${articleText(7)}</p>`,
            sourceKind: 'ATOM_FULL',
            sourceUrl: 'https://example.com/feed.atom',
          },
        ],
      },
      { fetch: fetch as never }
    );

    expect(result.status).toBe('DEGRADED');
    expect(result.artifact?.sourceKind).toBe('ATOM_FULL');
    expect(result.attempts[1]).toMatchObject({ errorCode: 'HTTP_403' });
  });

  it('rejects unsafe public destinations before fetch', async () => {
    const fetch = vi.fn();
    const result = await acquireArticleBody(
      { ...input(), canonicalUrl: 'http://127.0.0.1/admin' },
      { fetch: fetch as never }
    );

    expect(result).toMatchObject({ status: 'UNAVAILABLE', errorCode: 'UNSAFE_URL' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects non-HTML responses explicitly', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const result = await acquireArticleBody(input(), { fetch: fetch as never });

    expect(result).toMatchObject({
      status: 'UNAVAILABLE',
      errorCode: 'UNSUPPORTED_CONTENT_TYPE',
      lastHttpStatus: 200,
    });
  });

  it('rejects a public redirect to a private destination before following it', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      })
    );

    const result = await acquireArticleBody(input(), { fetch: fetch as never });

    expect(result).toMatchObject({ status: 'UNAVAILABLE', errorCode: 'UNSAFE_REDIRECT' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/story',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('fetches stable Substack publication URLs instead of rate-limited share redirects', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(page('Text is king'), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    );

    const result = await acquireArticleBody(
      {
        ...input(),
        canonicalUrl:
          'https://open.substack.com/pub/experimentalhistory/p/text-is-king?r=share-token',
        title: 'Text is king',
      },
      { fetch: fetch as never }
    );

    expect(result.status).toBe('AVAILABLE');
    expect(fetch).toHaveBeenCalledWith(
      'https://experimentalhistory.substack.com/p/text-is-king',
      expect.objectContaining({ redirect: 'manual' })
    );
  });
});

describe('isSafePublicArticleUrl', () => {
  it('permits public HTTP URLs and rejects local or credentialed URLs', () => {
    expect(isSafePublicArticleUrl('https://example.com/story')).toBe(true);
    expect(isSafePublicArticleUrl('http://localhost/story')).toBe(false);
    expect(isSafePublicArticleUrl('http://192.168.1.2/story')).toBe(false);
    expect(isSafePublicArticleUrl('https://user:pass@example.com/story')).toBe(false);
    expect(isSafePublicArticleUrl('file:///etc/passwd')).toBe(false);
  });
});

describe('article-body public URL resolution', () => {
  it('rewrites only recognized open.substack.com publication share paths', () => {
    expect(
      articleBodyAcquisitionInternals.resolvePublicArticleFetchUrl(
        'https://open.substack.com/pub/experimentalhistory/p/text-is-king?r=share-token'
      )
    ).toBe('https://experimentalhistory.substack.com/p/text-is-king');
    expect(
      articleBodyAcquisitionInternals.resolvePublicArticleFetchUrl(
        'https://open.substack.com/redirect?url=https://example.com'
      )
    ).toBe('https://open.substack.com/redirect?url=https://example.com');
  });
});
