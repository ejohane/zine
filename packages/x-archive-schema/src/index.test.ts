import { describe, expect, it } from 'vitest';
import { XPostSchema } from './index';

function basePost() {
  return {
    tweetId: '100',
    url: 'https://x.com/example/status/100',
    text: 'Read this',
    kind: 'POST',
    author: { username: 'example', name: 'Example' },
    capturedAt: '2026-07-18T12:00:00.000Z',
  };
}

describe('X post outbound links', () => {
  it('keeps legacy post payloads backward compatible', () => {
    expect(XPostSchema.parse(basePost())).toMatchObject({
      media: [],
      links: [],
      relationships: [],
      metrics: {},
    });
  });

  it('validates normalized destinations and card metadata', () => {
    const parsed = XPostSchema.parse({
      ...basePost(),
      links: [
        {
          url: 'https://example.com/story?utm_source=x',
          normalizedUrl: 'https://example.com/story',
          displayUrl: 'example.com/story',
          redirectUrl: 'https://t.co/story',
          source: 'CARD',
          card: {
            title: 'A linked story',
            description: 'Why it matters',
            domain: 'example.com',
            imageUrl: 'https://example.com/card.jpg',
          },
        },
      ],
    });

    expect(parsed.links[0]).toMatchObject({
      normalizedUrl: 'https://example.com/story',
      source: 'CARD',
      card: { domain: 'example.com' },
    });
  });

  it('rejects a non-URL normalized destination', () => {
    expect(() =>
      XPostSchema.parse({
        ...basePost(),
        links: [{ url: 'https://example.com/story', normalizedUrl: 'example.com/story' }],
      })
    ).toThrow();
  });

  it('rejects duplicate normalized destinations in one post', () => {
    expect(() =>
      XPostSchema.parse({
        ...basePost(),
        links: [
          { url: 'https://example.com/story?a=1', normalizedUrl: 'https://example.com/story' },
          { url: 'https://example.com/story?a=2', normalizedUrl: 'https://example.com/story' },
        ],
      })
    ).toThrow(/Duplicate normalized outbound URL/);
  });
});
