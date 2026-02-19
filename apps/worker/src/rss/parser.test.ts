import { describe, expect, it } from 'vitest';

import { parseRssFeedXml } from './parser';

describe('parseRssFeedXml', () => {
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
