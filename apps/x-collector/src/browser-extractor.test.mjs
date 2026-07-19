import { afterEach, describe, expect, it } from 'bun:test';
import { parseHTML } from 'linkedom';
import { extractVisibleTimelineBatch } from './browser-extractor.mjs';

afterEach(() => {
  delete globalThis.document;
});

describe('X browser extractor', () => {
  it('keeps organic posts, repost context, and quote pointers while excluding ads', () => {
    const { document } = parseHTML(`
      <main>
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <span>Original Author</span><span>@original</span><a href="/original"></a>
          </div>
          <a href="/original/status/100"><time datetime="2026-07-11T12:00:00.000Z"></time></a>
          <div data-testid="tweetText" lang="en">
            An original post
            <a href="https://t.co/story" data-expanded-url="https://example.com/story?utm_source=x#section">example.com/story</a>
          </div>
          <div data-testid="card.wrapper">
            <a href="https://t.co/story" data-expanded-url="https://example.com/story?utm_source=x#section">
              <div data-testid="card.layoutLarge.detail">
                <span>example.com</span><span>A linked story</span><span>Story description</span>
              </div>
              <img src="https://example.com/card.jpg" />
            </a>
          </div>
          <button data-testid="like" aria-label="12 Likes"></button>
        </article>

        <article data-testid="tweet">
          <span>Ad</span>
          <div data-testid="User-Name"><span>Advertiser</span><a href="/advertiser"></a></div>
          <a href="/advertiser/status/200"><time datetime="2026-07-11T12:01:00.000Z"></time></a>
          <div data-testid="tweetText">Buy something</div>
        </article>

        <article data-testid="tweet">
          <div data-testid="socialContext"><a href="/reposter"></a><span>Reposter reposted</span></div>
          <div data-testid="User-Name">
            <span>Quote Author</span><span>@quoteauthor</span><a href="/quoteauthor"></a>
          </div>
          <a href="/quoteauthor/status/300"><time datetime="2026-07-11T12:02:00.000Z"></time></a>
          <div data-testid="tweetText">My comment</div>
          <div role="link">
            <div data-testid="User-Name"><span>Quoted</span><span>@quoted</span><a href="/quoted"></a></div>
            <a href="/quoted/status/301"><time datetime="2026-07-11T11:00:00.000Z"></time></a>
            <div data-testid="tweetText">
              Quoted text
              <a href="https://t.co/quoted" data-expanded-url="https://quoted.example/watch?utm_medium=x">watch this</a>
            </div>
          </div>
        </article>
      </main>
    `);
    globalThis.document = document;

    const result = extractVisibleTimelineBatch();

    expect(result.excludedAds).toBe(1);
    expect(result.adKeys).toHaveLength(1);
    expect(result.items.map((item) => item.tweetId)).toEqual(['100', '300']);
    expect(result.posts.map((post) => post.tweetId)).toEqual(['100', '300', '301']);
    expect(result.items[1]).toMatchObject({ presentation: 'REPOST' });
    expect(result.posts[1]).toMatchObject({
      kind: 'QUOTE',
      relationships: [{ type: 'QUOTE_OF', tweetId: '301' }],
    });
    expect(result.posts[0].links).toEqual([
      {
        url: 'https://example.com/story?utm_source=x#section',
        normalizedUrl: 'https://example.com/story',
        displayUrl: 'example.com',
        redirectUrl: 'https://t.co/story',
        source: 'CARD',
        card: {
          title: 'A linked story',
          description: 'Story description',
          domain: 'example.com',
          imageUrl: 'https://example.com/card.jpg',
        },
      },
    ]);
    expect(result.posts[1].links).toEqual([]);
    expect(result.posts[2].links).toMatchObject([
      {
        normalizedUrl: 'https://quoted.example/watch',
        source: 'TEXT',
      },
    ]);

    const repeated = extractVisibleTimelineBatch(result.adKeys);
    expect(repeated.excludedAds).toBe(0);
    expect(repeated.adKeys).toEqual([]);
  });
});
