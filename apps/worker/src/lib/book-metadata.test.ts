import { describe, expect, it, vi, afterEach } from 'vitest';
import { extractBookMetadata, isSupportedBookPage } from './book-metadata';
import { scrapeOpenGraph } from './opengraph';
import { fetchLinkPreview } from './link-preview';
import html from './fixtures/prh-inner-game';

vi.mock('googleapis', () => ({ google: {} }));

const url =
  'https://www.penguinrandomhouse.com/books/57757/the-inner-game-of-tennis-50th-anniversary-edition-by-w-timothy-gallwey/9780307758859/';
afterEach(() => vi.restoreAllMocks());

describe('publisher book recognition', () => {
  it('extracts the shared ebook edition from captured publisher HTML through the real preview pipeline', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, {
        headers: { 'content-type': 'text/html' },
      })
    );
    const preview = await fetchLinkPreview(url + '?utm_source=share');
    expect(preview).toMatchObject({
      provider: 'WEB',
      contentType: 'BOOK',
      source: 'book_page',
      title: 'The Inner Game of Tennis',
      creator: 'W. Timothy Gallwey',
      thumbnailUrl: 'https://images.penguinrandomhouse.com/cover/9780307758859',
      canonicalUrl: url.slice(0, -1),
      hasArticleContent: false,
      duration: null,
    });
    expect(preview?.description).toContain('relaxed concentration');
    expect(preview?.readingTimeMinutes).toBeUndefined();
    expect(JSON.parse(preview!.rawMetadata!).book.isbn).toBe('9780307758859');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses the same saved identity for tracking, fragments and trailing-slash variants', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(html, {
          headers: { 'content-type': 'text/html' },
        })
    );
    const first = await fetchLinkPreview(url + '?utm_source=share#description');
    const second = await fetchLinkPreview(url.slice(0, -1));
    expect(first?.contentType).toBe('BOOK');
    expect(first?.providerId).toBe(second?.providerId);
    expect(first?.canonicalUrl).toBe(url.slice(0, -1));
  });

  it('exposes structured book fields alongside the ordinary OG metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(html, {
        headers: { 'content-type': 'text/html' },
      })
    );
    const page = await scrapeOpenGraph(url);
    expect(page.book).toMatchObject({
      title: 'The Inner Game of Tennis',
      author: 'W. Timothy Gallwey',
      isbn: '9780307758859',
    });
    // Generic OG artwork advertises the hardcover, not the shared ebook.
    expect(page.image).toContain('9780593732038');
    expect(page.book?.coverUrl).toContain('9780307758859');
  });

  it('handles graph arrays, author objects, multiple authors, and relative covers', () => {
    const book = {
      '@type': ['Thing', 'https://schema.org/Book'],
      name: 'Book',
      author: [{ name: 'One' }, { name: 'Two' }],
      image: { url: '/cover.jpg' },
    };
    expect(
      extractBookMetadata(['broken json', JSON.stringify({ '@graph': [book] })], url)
    ).toMatchObject({
      title: 'Book',
      author: 'One, Two',
      coverUrl: 'https://www.penguinrandomhouse.com/cover.jpg',
    });
  });

  it('does not classify incomplete metadata or unrelated product pages as books', () => {
    expect(
      extractBookMetadata([JSON.stringify({ '@type': 'Product', name: 'Tennis racket' })], url)
    ).toBeNull();
    expect(
      extractBookMetadata([JSON.stringify({ '@type': 'Book', name: 'Missing author' })], url)
    ).toBeNull();
    for (const value of [
      'https://www.penguinrandomhouse.com/articles/tennis/',
      'https://www.penguinrandomhouse.com.evil.com/books/57757/book/',
      'https://example.com/books/57757/book/',
    ]) {
      expect(isSupportedBookPage(value)).toBe(false);
    }
    expect(isSupportedBookPage(url)).toBe(true);
  });

  it('falls back to ordinary link saving when publisher structured data is malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          '<html><head><meta property="og:title" content="Publisher page"><script type="application/ld+json">broken</script></head><body></body></html>',
          { headers: { 'content-type': 'text/html' } }
        )
    );
    expect(await fetchLinkPreview(url)).toMatchObject({
      contentType: 'ARTICLE',
      title: 'Publisher page',
      source: 'opengraph',
    });
  });
});
