import { describe, expect, it } from 'vitest';

import { parseRssFeedXml } from './parser';

describe('parseRssFeedXml', () => {
  it('parses podcast audio, GUID, duration, and separate show and episode artwork', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
      <title>Example Podcast</title><link>https://publisher.example/show</link>
      <itunes:image href="https://cdn.example/show.jpg" />
      <item><guid isPermaLink="false">episode-guid-42</guid><title>Episode 42</title>
        <link>https://publisher.example/episodes/42</link>
        <description><![CDATA[<p>Episode notes</p>]]></description>
        <itunes:image href="https://cdn.example/episode.jpg" />
        <itunes:duration>1:02:03</itunes:duration>
        <enclosure url="https://cdn.example/episode.mp3" length="123" type="audio/mpeg" />
      </item></channel></rss>`;

    const parsed = parseRssFeedXml(xml, 'https://publisher.example/feed.xml');

    expect(parsed.contentType).toBe('PODCAST');
    expect(parsed.imageUrl).toBe('https://cdn.example/show.jpg');
    expect(parsed.entries[0]).toMatchObject({
      entryId: 'episode-guid-42',
      rawGuid: 'episode-guid-42',
      canonicalUrl: 'https://publisher.example/episodes/42',
      audioUrl: 'https://cdn.example/episode.mp3',
      imageUrl: 'https://cdn.example/episode.jpg',
      creatorImageUrl: 'https://cdn.example/show.jpg',
      durationSeconds: 3723,
      contentType: 'PODCAST',
    });
  });

  it('does not mistake an audio enclosure for article artwork', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Audio</title><item>
      <guid>episode-1</guid><title>One</title>
      <enclosure url="https://cdn.example/audio.mp3" type="audio/mpeg" />
    </item></channel></rss>`;
    const entry = parseRssFeedXml(xml, 'https://example.com/feed.xml').entries[0];
    expect(entry?.imageUrl).toBeUndefined();
    expect(entry?.audioUrl).toBe('https://cdn.example/audio.mp3');
  });

  it('scopes podcast identity to the feed and GUID when episode links are reused', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Audio</title>
      <item><guid>episode-1</guid><title>One</title><link>https://example.com/episodes</link>
        <enclosure url="https://cdn.example/one.mp3" type="audio/mpeg" /></item>
      <item><guid>episode-2</guid><title>Two</title><link>https://example.com/episodes</link>
        <enclosure url="https://cdn.example/two.mp3" type="audio/mpeg" /></item>
    </channel></rss>`;
    const entries = parseRssFeedXml(xml, 'https://example.com/feed.xml').entries;

    expect(entries[0]?.canonicalUrl).toBe(entries[1]?.canonicalUrl);
    expect(entries[0]?.providerId).not.toBe(entries[1]?.providerId);
    expect(entries.map((entry) => entry.entryId)).toEqual(['episode-1', 'episode-2']);
  });

  it('falls back from missing episode artwork to show artwork', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
      <title>Audio</title><itunes:image href="https://cdn.example/show.jpg" />
      <item><guid>episode-1</guid><title>One</title>
        <enclosure url="https://cdn.example/one.mp3" type="audio/mpeg" /></item>
    </channel></rss>`;

    const entry = parseRssFeedXml(xml, 'https://example.com/feed.xml').entries[0];
    expect(entry?.imageUrl).toBe('https://cdn.example/show.jpg');
  });

  it('preserves non-audio enclosure and untyped media artwork for articles', () => {
    const enclosureXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Articles</title><item>
      <guid>article-1</guid><title>One</title>
      <enclosure url="https://cdn.example/article.jpg" type="image/jpeg" />
    </item></channel></rss>`;
    const mediaXml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Articles</title><item>
      <guid>article-2</guid><title>Two</title>
      <media:content url="https://cdn.example/media.jpg" />
    </item></channel></rss>`;

    expect(parseRssFeedXml(enclosureXml, 'https://example.com/feed.xml').entries[0]?.imageUrl).toBe(
      'https://cdn.example/article.jpg'
    );
    expect(parseRssFeedXml(mediaXml, 'https://example.com/feed.xml').entries[0]?.imageUrl).toBe(
      'https://cdn.example/media.jpg'
    );
  });
  it('parses RSS 2.0 feeds', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel>
          <title>Example Feed</title>
          <link>https://example.com</link>
          <description>Example Description</description>
          <item>
            <title>Hello World</title>
            <link>https://example.com/hello?utm_source=newsletter</link>
            <guid>item-1</guid>
            <dc:creator>Jane Doe</dc:creator>
            <pubDate>Wed, 18 Feb 2026 10:00:00 GMT</pubDate>
            <description><![CDATA[
              <p>Post summary</p>
              <img src="/images/post-thumb.jpg" />
            ]]></description>
          </item>
        </channel>
      </rss>`;

    const parsed = parseRssFeedXml(xml, 'https://example.com/feed.xml');

    expect(parsed.title).toBe('Example Feed');
    expect(parsed.siteUrl).toBe('https://example.com/');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].title).toBe('Hello World');
    expect(parsed.entries[0].creator).toBe('Jane Doe');
    expect(parsed.entries[0].canonicalUrl).toBe('https://example.com/hello');
    expect(parsed.entries[0].providerId).toBe('https://example.com/hello');
    expect(parsed.entries[0].imageUrl).toBe('https://example.com/images/post-thumb.jpg');
  });

  it('parses Atom feeds', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom Feed</title>
        <link href="https://atom.example.com" rel="alternate" />
        <entry>
          <id>tag:atom.example.com,2026:post-1</id>
          <title>Atom Entry</title>
          <link href="https://atom.example.com/post-1" rel="alternate" />
          <updated>2026-02-18T10:00:00Z</updated>
          <summary type="html">
            &lt;p&gt;Atom summary&lt;/p&gt;
            &lt;img src="https://cdn.atom.example.com/post-1.jpg" /&gt;
          </summary>
          <author><name>Atom Author</name></author>
        </entry>
      </feed>`;

    const parsed = parseRssFeedXml(xml, 'https://atom.example.com/feed.xml');

    expect(parsed.title).toBe('Atom Feed');
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].title).toBe('Atom Entry');
    expect(parsed.entries[0].creator).toBe('Atom Author');
    expect(parsed.entries[0].canonicalUrl).toBe('https://atom.example.com/post-1');
    expect(parsed.entries[0].imageUrl).toBe('https://cdn.atom.example.com/post-1.jpg');
    expect(parsed.entries[0].articleBodyCandidate).toMatchObject({
      sourceKind: 'ATOM_FULL',
      sourceUrl: 'https://atom.example.com/feed.xml',
      html: expect.stringContaining('<p>Atom summary</p>'),
    });
  });

  it('retains richer RSS content separately from the display summary', () => {
    const richBody = `<p>${'Full article paragraph with meaningful reporting. '.repeat(30)}</p>`;
    const xml = `<?xml version="1.0"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>Rich Feed</title>
          <item>
            <title>Full story</title>
            <link>https://example.com/full-story</link>
            <description><![CDATA[Short display summary]]></description>
            <content:encoded><![CDATA[${richBody}]]></content:encoded>
          </item>
        </channel>
      </rss>`;

    const entry = parseRssFeedXml(xml, 'https://example.com/feed.xml').entries[0];

    expect(entry.summary).toBe('Short display summary');
    expect(entry.articleBodyCandidate).toEqual({
      html: richBody,
      sourceKind: 'RSS_FULL',
      sourceUrl: 'https://example.com/feed.xml',
    });
  });

  it('preserves escaped markup examples inside a CDATA article body', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Code Feed</title>
        <entry>
          <id>code-example</id>
          <title>Markup examples</title>
          <link href="https://example.com/code-example" rel="alternate" />
          <updated>2026-07-24T10:00:00Z</updated>
          <content type="html"><![CDATA[
            <p>Before the example.</p>
            <p>Use a <code>&lt;script&gt;</code> tag when embedding JSON.</p>
            <h2>The final section</h2>
            <p>This tail must remain part of the candidate.</p>
          ]]></content>
        </entry>
      </feed>`;

    const entry = parseRssFeedXml(xml, 'https://example.com/atom.xml').entries[0];

    expect(entry.articleBodyCandidate?.html).toContain('<code>&lt;script&gt;</code>');
    expect(entry.articleBodyCandidate?.html).toContain('<h2>The final section</h2>');
    expect(entry.articleBodyCandidate?.html).toContain(
      '<p>This tail must remain part of the candidate.</p>'
    );
  });

  it('falls back to hash identity when link/guid are missing', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Fallback Feed</title>
          <item>
            <title>Fallback Entry</title>
            <description>Only description</description>
          </item>
        </channel>
      </rss>`;

    const parsed = parseRssFeedXml(xml, 'https://example.com/feed.xml');

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].entryId.length).toBeGreaterThan(8);
    expect(parsed.entries[0].providerId.length).toBeGreaterThan(8);
    expect(parsed.entries[0].canonicalUrl).toContain('https://example.com/feed.xml#entry-');
  });

  it('throws on unsupported feed shapes', () => {
    const xml = `<?xml version="1.0"?><html><body>no feed</body></html>`;
    expect(() => parseRssFeedXml(xml, 'https://example.com/feed.xml')).toThrow(
      'Unsupported feed format'
    );
  });
});
