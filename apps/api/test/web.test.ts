import { describe, expect, it } from 'vitest';
import { extractWebDocument } from '../src/providers/web';
const page = (html: string, mime = 'text/html') => ({
  url: 'https://publisher.example/article',
  headers: new Headers({ 'content-type': mime }),
  text: html,
});
describe('web material access and extraction', () => {
  it('preserves publisher metadata, article text and original links while declaring a paywall preview', () => {
    const text =
      'This is a visible introductory paragraph about databases and reliable systems. '.repeat(12);
    const result = extractWebDocument(
      page(
        `<html lang="en"><head><title>Publisher title</title><meta property="og:title" content="Article title"><link rel="alternate" type="application/rss+xml" href="/feed"><script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false,"author":{"name":"Writer"},"datePublished":"2025-01-01"}</script></head><body><main><article><h1>Article title</h1><p>${text}</p><p><a href="/background">Background</a></p></article></main></body></html>`
      )
    );
    expect(result.contributions.find((value) => value.field === 'title')?.value).toBe(
      'Article title'
    );
    expect(result.contributions.find((value) => value.field === 'creator')?.value).toBe('Writer');
    expect(result.contributions.find((value) => value.field === 'article')?.value).toMatchObject({
      coverage: 'partial',
    });
    expect(result.contributions.find((value) => value.field === 'links')?.value).toContainEqual({
      url: 'https://publisher.example/background',
      text: 'Background',
    });
    expect(result.feedUrls).toEqual(['https://publisher.example/feed']);
    expect(result.components).toContainEqual({
      component: 'article',
      status: 'available',
      reasonCode: 'source_preview_only',
    });
  });
  it('does not interpret a challenge or unsupported binary format as an article', () => {
    expect(() =>
      extractWebDocument(
        page(
          '<html><head><title>Just a moment</title></head><body><form id="challenge-form">Checking your browser</form></body></html>'
        )
      )
    ).toThrow();
    const binary = extractWebDocument(page('%PDF-1.7 binary content', 'application/pdf'));
    expect(binary.contributions).toEqual([]);
    expect(
      binary.components.every((value) => value.reasonCode === 'unsupported_content_type')
    ).toBe(true);
  });
});
