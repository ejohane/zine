import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAmazonProductLink, bookFromKindleShare } from './amazon-book';
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
    expect(fetch).toHaveBeenCalledTimes(1);
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
