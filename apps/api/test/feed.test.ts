import { describe, expect, it } from 'vitest';
import { parseFeed, newestFirst } from '../src/providers/feed';
import { identify } from '../src/identity';

describe('feed and source identity contracts', () => {
  it('retains RSS podcast enclosures, transcript references and rich text', () => {
    const feed = parseFeed(
      `<?xml version="1.0"?><rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Example</title><link>https://example.com/</link><item><guid isPermaLink="false">episode-1</guid><title>Episode &amp; discussion</title><link>https://example.com/episode</link><description><![CDATA[<p>Actual <b>discussion</b></p><script>bad()</script>]]></description><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate><enclosure url="https://example.com/episode.mp3" type="audio/mpeg"/><itunes:duration>1:02:03</itunes:duration><podcast:transcript url="https://example.com/transcript.vtt" type="text/vtt" language="en"/></item></channel></rss>`,
      'https://example.com/feed'
    );
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]).toMatchObject({
      id: 'episode-1',
      title: 'Episode & discussion',
      kind: 'podcast_episode',
      durationSeconds: 3723,
      text: 'Actual discussion',
      publishedAt: '2026-11-06T10:00:00.000Z',
    });
    expect(feed.entries[0].transcripts[0].language).toBe('en');
  });
  it('handles Atom singleton entries and alternate/enclosure links', () => {
    const feed = parseFeed(
      `<feed xmlns="http://www.w3.org/2005/Atom"><title>Notes</title><link rel="alternate" href="https://example.com/"/><entry><id>urn:uuid:episode</id><title>A note</title><link rel="alternate" href="/note"/><updated>2026-11-07T01:00:00Z</updated><author><name>Author</name></author><content type="html">&lt;p&gt;The text&lt;/p&gt;</content></entry></feed>`,
      'https://example.com/feed'
    );
    expect(feed.entries[0]).toMatchObject({
      url: 'https://example.com/note',
      text: 'The text',
      creator: 'Author',
    });
  });
  it('handles JSON Feed enclosures and pagination', () => {
    const feed = parseFeed(
      JSON.stringify({
        version: 'https://jsonfeed.org/version/1.1',
        title: 'Podcast',
        next_url: 'https://example.com/feed?page=2',
        items: [
          {
            id: 'one',
            url: 'https://example.com/one',
            content_text: 'Episode',
            attachments: [
              {
                url: 'https://example.com/audio.mp3',
                mime_type: 'audio/mpeg',
                duration_in_seconds: 123,
              },
            ],
          },
        ],
      }),
      'https://example.com/feed'
    );
    expect(feed.entries[0].kind).toBe('podcast_episode');
    expect(feed.nextUrl).toContain('page=2');
    expect(feed.entries[0].durationSeconds).toBe(123);
  });
  it('sorts dated entries rather than assuming publisher feed order', () => {
    const feed = parseFeed(
      `<rss><channel><title>Feed</title><item><link>https://example.com/old</link><pubDate>2026-11-01</pubDate></item><item><link>https://example.com/new</link><pubDate>2026-11-07</pubDate></item></channel></rss>`,
      'https://example.com/feed'
    );
    expect(newestFirst(feed.entries)[0].url).toBe('https://example.com/new');
  });
  it('rejects entities and excludes unsafe enclosure targets', () => {
    expect(() =>
      parseFeed('<!DOCTYPE html><html><body>Publication</body></html>', 'https://example.com/')
    ).toThrow('unsupported_feed');
    expect(() =>
      parseFeed(
        '<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss/>',
        'https://example.com/feed'
      )
    ).toThrow();
    const feed = parseFeed(
      '<rss><channel><item><link>https://example.com/a</link><enclosure url="http://127.0.0.1/secret" type="audio/mpeg"/></item></channel></rss>',
      'https://example.com/feed'
    );
    expect(feed.entries[0].enclosures).toEqual([]);
  });
  it('keeps platform editions separate and normalizes platform URL aliases', () => {
    expect(identify('https://twitter.com/person/status/123?s=20').key).toBe(
      identify('https://x.com/i/status/123').key
    );
    expect(identify('https://x.com/i/broadcasts/1yxBePQkRmaJN').kind).toBe('video');
    expect(
      identify('https://open.spotify.com/intl-en/episode/1234567890123456789012?si=abc').url
    ).toBe('https://open.spotify.com/episode/1234567890123456789012');
    expect(identify('https://example.com/a?utm_source=x&chapter=2').url).toBe(
      'https://example.com/a?chapter=2'
    );
    expect(identify('https://example.com/a?chapter=2').key).not.toBe(
      identify('https://example.com/a?chapter=3').key
    );
  });
  it('retains Media RSS descriptions, artwork, duration and source media in Atom entries', () => {
    const feed = parseFeed(
      '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>Video feed</title><entry><id>yt:video:abcdef12345</id><yt:videoId>abcdef12345</yt:videoId><title>Video title</title><link href="https://www.youtube.com/watch?v=abcdef12345"/><media:group><media:description>Published description with useful context</media:description><media:thumbnail url="https://img.example/thumb.jpg" width="640" height="360"/><media:content url="https://media.example/video.mp4" type="video/mp4" duration="123"/></media:group></entry></feed>',
      'https://example.com/feed'
    );
    expect(feed.entries[0]).toMatchObject({
      kind: 'video',
      description: 'Published description with useful context',
      thumbnail: 'https://img.example/thumb.jpg',
      durationSeconds: 123,
      enclosures: [{ url: 'https://media.example/video.mp4', type: 'video/mp4' }],
    });
  });
});
