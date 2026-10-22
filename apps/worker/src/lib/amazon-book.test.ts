import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseAmazonProductLink,
  resolveAmazonProductLink,
  bookFromKindleShare,
} from './amazon-book';
import { fetchLinkPreview } from './link-preview';

vi.mock('googleapis', () => ({ google: {} }));
afterEach(() => vi.restoreAllMocks());
const url = 'https://www.amazon.com/dp/B00SFZB93Y?ref_=quick_view_ref_tag';
const sharedText =
  "I think you might like this book: The Devil's Chessboard: Allen Dulles, the CIA, and the Rise of America's Secret Government by David Talbothttps://www.amazon.com/dp/B00SFZB93Y?ref_=quick_view_ref_tag";

// Representative Amazon book DOM; Amazon returned HTTP 500 during implementation.
const bookHTML = `<html><head><meta property="og:description" content="A history of Allen Dulles."></head><body>
<span id="productTitle">The Devil's Chessboard</span>
<div id="bylineInfo"><span class="author"><a class="a-link-normal">David Talbot</a><span>(Author)</span></span></div>
<img id="ebooksImgBlkFront" src="https://m.media-amazon.com/images/P/B00SFZB93Y.01.L.jpg">
<div id="bookDescription_feature_div"><div class="a-expander-content"><p>A history of Allen Dulles and the CIA.</p></div></div>
</body></html>`;

function respond(html = bookHTML, status = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async () => new Response(html, { status, headers: { 'content-type': 'text/html' } })
    );
}

describe('Amazon and Kindle book links', () => {
  it('normalizes ASIN identity across product paths, tracking, fragments and case', () => {
    const target = parseAmazonProductLink(url);
    expect(target).toEqual({
      asin: 'B00SFZB93Y',
      canonicalUrl: 'https://www.amazon.com/dp/B00SFZB93Y',
      providerId: 'amazon.com:B00SFZB93Y',
    });
    for (const path of [
      '/gp/product/B00SFZB93Y/ref=share',
      '/a-book-title/dp/b00sfzb93y/',
      '/gp/aw/d/B00SFZB93Y?tag=test#details',
    ]) {
      expect(parseAmazonProductLink('https://amazon.com' + path)).toEqual(target);
    }
    for (const value of [
      'https://amazon.com.evil.test/dp/B00SFZB93Y',
      'https://www.amazon.com@evil.test/dp/B00SFZB93Y',
      'https://www.amazon.com/dp/SHORT',
      'https://www.amazon.com/s?k=books',
    ])
      expect(parseAmazonProductLink(value)).toBeNull();
  });
  it('extracts the exact Kindle share text, even with author and URL joined', () => {
    expect(bookFromKindleShare(sharedText, parseAmazonProductLink(url)!)).toMatchObject({
      title:
        "The Devil's Chessboard: Allen Dulles, the CIA, and the Rise of America's Secret Government",
      author: 'David Talbot',
    });
    expect(
      bookFromKindleShare(
        sharedText,
        parseAmazonProductLink('https://www.amazon.com/dp/B012345678')!
      )
    ).toBeNull();
    expect(
      bookFromKindleShare(
        sharedText.replace('this book:', 'this product:'),
        parseAmazonProductLink(url)!
      )
    ).toBeNull();
  });
  it('extracts book-page metadata before article extraction', async () => {
    const fetch = respond();
    const result = await fetchLinkPreview(url);
    expect(result).toMatchObject({
      provider: 'WEB',
      contentType: 'BOOK',
      creator: 'David Talbot',
      title: "The Devil's Chessboard",
      source: 'book_page',
      canonicalUrl: 'https://www.amazon.com/dp/B00SFZB93Y',
      providerId: 'amazon.com:B00SFZB93Y',
      hasArticleContent: false,
      description: 'A history of Allen Dulles and the CIA.',
    });
    expect(JSON.parse(result!.rawMetadata!).book.asin).toBe('B00SFZB93Y');
    expect(result?.readingTimeMinutes).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('selects the Kindle title once and preserves paragraph boundaries', async () => {
    respond(
      bookHTML
        .replace(
          '<div id="bylineInfo">',
          '<span id="ebooksProductTitle">Kindle title</span><div id="bylineInfo">'
        )
        .replace(
          '<p>A history of Allen Dulles and the CIA.</p>',
          '<p>First paragraph.</p><p>Second paragraph.</p>'
        )
    );
    expect(await fetchLinkPreview(url)).toMatchObject({
      title: 'Kindle title',
      description: 'First paragraph. Second paragraph.',
    });
  });

  it('saves the Kindle metadata when the Amazon page is unavailable', async () => {
    const fetch = respond('<html><title>Service unavailable</title></html>', 500);
    const result = await fetchLinkPreview(url, { sharedText });
    expect(result).toMatchObject({
      contentType: 'BOOK',
      creator: 'David Talbot',
      source: 'book_share',
      thumbnailUrl: 'https://m.media-amazon.com/images/P/B00SFZB93Y.01.L.jpg',
      canonicalUrl: 'https://www.amazon.com/dp/B00SFZB93Y',
    });
    expect(result?.description).toBeUndefined();
    expect(JSON.parse(result!.rawMetadata!).metadataSource).toBe('kindle_share');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('prefers fetched book metadata over stale shared text', async () => {
    respond();
    expect(
      await fetchLinkPreview(url, {
        sharedText: sharedText.replace('David Talbot', 'Wrong Author'),
      })
    ).toMatchObject({ creator: 'David Talbot', source: 'book_page' });
  });
  it('does not classify ordinary products or a mismatched recommendation as books', async () => {
    respond(
      '<html><head><meta property="og:title" content="A tennis racket"></head><body><span id="productTitle">A tennis racket</span><div id="bylineInfo">Visit the store</div></body></html>'
    );
    expect((await fetchLinkPreview(url))?.contentType).toBe('ARTICLE');
    expect(
      (await fetchLinkPreview('https://www.amazon.com/dp/B012345678', { sharedText }))?.contentType
    ).toBe('ARTICLE');
  });
  it('supports JSON-LD Book metadata as well as Amazon-specific markup', async () => {
    respond(
      '<html><head><script type="application/ld+json">{"@type":"Book","name":"A Book","author":{"name":"An Author"}}</script></head></html>'
    );
    expect(await fetchLinkPreview(url)).toMatchObject({
      contentType: 'BOOK',
      title: 'A Book',
      creator: 'An Author',
    });
  });
});

const shortUrl = 'https://a.co/0gbZxe3s';
const productUrl = 'https://www.amazon.com/dp/B000O76ON6?ref_=k4w_ss_dp_bot';
const neuromancerHTML = bookHTML
  .replaceAll("The Devil's Chessboard", 'Neuromancer (Sprawl Trilogy Book 1)')
  .replaceAll('David Talbot', 'William Gibson')
  .replaceAll('B00SFZB93Y', 'B000O76ON6');
function networkResponse(body: string, url: string, status = 200, headers = {}) {
  const response = new Response(body, {
    status,
    headers: { 'content-type': 'text/html', ...headers },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('Amazon short links', () => {
  it('stops at the product redirect before Amazon can send the request to sign-in', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(networkResponse('', shortUrl, 302, { location: productUrl }));
    expect(await resolveAmazonProductLink(shortUrl)).toEqual(parseAmazonProductLink(productUrl));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(shortUrl, expect.objectContaining({ redirect: 'manual' }));
  });
  it('recognizes the real Kindle kshare redirect without following it into sign-in', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      networkResponse('', shortUrl, 301, {
        location: 'https://read.amazon.com/kp/kshare?asin=B000O76ON6&id=share-id&ref_=share',
      })
    );
    expect(await resolveAmazonProductLink(shortUrl)).toEqual(parseAmazonProductLink(productUrl));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('extracts a bare short link using mobile metadata when desktop metadata is generic', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === shortUrl) return networkResponse('', url, 302, { location: productUrl });
      return networkResponse(
        url.includes('/gp/aw/d/') ? neuromancerHTML : '<html><title>Amazon</title></html>',
        url
      );
    });
    expect(await fetchLinkPreview(shortUrl)).toMatchObject({
      contentType: 'BOOK',
      title: 'Neuromancer (Sprawl Trilogy Book 1)',
      creator: 'William Gibson',
      canonicalUrl: 'https://www.amazon.com/dp/B000O76ON6',
      providerId: 'amazon.com:B000O76ON6',
      source: 'book_page',
      hasArticleContent: false,
    });
  });
  it('uses a matching short-link recommendation when both product pages are unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input) === shortUrl
        ? networkResponse('', shortUrl, 302, { location: productUrl })
        : networkResponse('', String(input), 500)
    );
    const sharedText = 'I think you might like this book: Neuromancer by William Gibson' + shortUrl;
    expect(await fetchLinkPreview(shortUrl, { sharedText })).toMatchObject({
      contentType: 'BOOK',
      creator: 'William Gibson',
      source: 'book_share',
    });
    expect(
      bookFromKindleShare(sharedText, parseAmazonProductLink(productUrl)!, 'https://a.co/other')
    ).toBeNull();
  });
  it('does not trust book metadata redirected to another ASIN or ordinary products', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input) === shortUrl
        ? networkResponse('', shortUrl, 302, { location: productUrl })
        : networkResponse(neuromancerHTML, 'https://www.amazon.com/dp/B012345678')
    );
    expect((await fetchLinkPreview(shortUrl))?.contentType).toBe('ARTICLE');
  });
  it.each([
    'http://127.0.0.1/private',
    'https://evil.test/dp/B000O76ON6',
    'https://amazon.com.evil.test/dp/B000O76ON6',
    'http://www.amazon.com/dp/B000O76ON6',
    '/0gbZxe3s',
    'https://www.amazon.com/ap/signin',
    'https://read.amazon.com.evil.test/kp/kshare?asin=B000O76ON6',
    'https://read.amazon.com/kp/kshare?asin=BAD',
  ])('does not follow an untrusted, looping or non-product destination: %s', async (location) => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(networkResponse('', shortUrl, 302, { location }));
    expect(await resolveAmazonProductLink(shortUrl)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('bounds redirect chains and handles unavailable short links', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        networkResponse('', String(input), 302, { location: String(input) + 'x' })
      );
    expect(await resolveAmazonProductLink(shortUrl)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(4);
    fetch.mockRejectedValue(new Error('Network unavailable'));
    expect(await resolveAmazonProductLink(shortUrl)).toBeNull();
  });
  it.each([
    'https://a.co.evil.test/abc',
    'https://user@a.co/abc',
    'https://a.co:8080/abc',
    'http://a.co/abc',
  ])('does not fetch a lookalike or invalid short URL: %s', async (url) => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(await resolveAmazonProductLink(url)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
