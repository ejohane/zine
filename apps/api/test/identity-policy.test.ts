import { describe, expect, it } from 'vitest';
import { identify, strongRedirect, unrelatedRedirect } from '../src/identity';
describe('conservative late identity evidence', () => {
  it('recognizes stable account IDs and distinct personalized channel URL forms', () => {
    expect(identify('https://x.com/i/user/424242').key).toBe('x:account_id:424242');
    expect(identify('https://www.youtube.com/user/YouTube').key).toBe('youtube:username:youtube');
    expect(identify('https://www.youtube.com/c/YouTubeCreators').key).toBe(
      'youtube:custom:youtubecreators'
    );
    expect(identify('https://www.youtube.com/@Handle%EC%A7%81%ED%95%A8').externalId).toBe(
      '@Handle직함'
    );
    expect(identify('https://www.youtube.com/@Handle%EC%A7%81%ED%95%A8').key).toBe(
      identify('https://www.youtube.com/@handle직함').key
    );
    expect(identify('https://www.youtube.com/%65mbed/abcdef12345').key).toBe(
      'youtube:video:abcdef12345'
    );
  });
  it('requires permanent relocation, a recognized short link, or a transport alias', () => {
    expect(
      strongRedirect('https://publisher.example/old', 'https://publisher.example/new', [
        { status: 301 },
      ])
    ).toBe(true);
    expect(
      strongRedirect('https://publisher.example/old', 'https://publisher.example/new', [
        { status: 302 },
      ])
    ).toBe(false);
    expect(
      strongRedirect('https://bit.ly/short', 'https://publisher.example/new', [{ status: 302 }])
    ).toBe(true);
    expect(
      strongRedirect('http://publisher.example/article', 'https://www.publisher.example/article', [
        { status: 302 },
      ])
    ).toBe(true);
    expect(
      strongRedirect('https://publisher.example/old', 'https://publisher.example/new', [])
    ).toBe(false);
  });
  it('does not equate access gates, homepage fallbacks or canonical-tag suggestions with identity', () => {
    for (const target of [
      'https://publisher.example/login',
      'https://publisher.example/account/signin',
      'https://publisher.example/subscribe',
      'https://publisher.example/',
    ]) {
      expect(unrelatedRedirect('https://publisher.example/article', target)).toBe(true);
      expect(strongRedirect('https://publisher.example/article', target, [{ status: 301 }])).toBe(
        false
      );
    }
    expect(
      unrelatedRedirect('https://publisher.example/article', 'https://publisher.example/p/login')
    ).toBe(false);
    expect(
      strongRedirect('https://publisher.example/article', 'https://different.example/canonical', [])
    ).toBe(false);
  });
});

it('recognizes X article URLs as one article identity separate from posts', () => {
  const canonical = 'https://x.com/i/article/12345';
  expect(identify('https://twitter.com/writer/article/12345?utm_source=share')).toEqual({
    key: 'x:article:12345',
    url: canonical,
    platform: 'x',
    kind: 'article',
    externalId: '12345',
  });
  expect(identify(canonical).key).toBe('x:article:12345');
  expect(identify('https://x.com/writer/status/12345').key).toBe('x:post:12345');
});
