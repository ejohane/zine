import { describe, expect, it } from 'vitest';

import { normalizeArticleBodyHtml } from './normalization';

describe('normalizeArticleBodyHtml', () => {
  it('sanitizes active content, attributes, and unsafe URLs', () => {
    const normalized = normalizeArticleBodyHtml(
      `<div onclick="steal()"><script>alert(1)</script><p>Hello <a href="/story" onclick="x()">world</a>. <a href="http://127.0.0.1/admin">Local</a></p><img src="javascript:bad" onerror="x()"><img src="http://192.168.1.2/private.jpg"><iframe src="https://bad.example"></iframe></div>`,
      'https://example.com/base/'
    );

    expect(normalized.sanitizedHtml).toContain('href="https://example.com/story"');
    expect(normalized.sanitizedHtml).toContain('>Local</a>');
    expect(normalized.sanitizedHtml).not.toContain('127.0.0.1');
    expect(normalized.sanitizedHtml).not.toMatch(/script|iframe|onclick|onerror|javascript:/);
    expect(normalized.plainText).toBe('Hello world. Local');
    expect(normalized.diagnostics.droppedElements).toBeGreaterThanOrEqual(2);
    expect(normalized.diagnostics.blockedUrls).toBe(3);
  });

  it('creates stable semantic blocks and exact word metrics', () => {
    const normalized = normalizeArticleBodyHtml(
      '<h2>A heading</h2><p>One two three.</p><blockquote>Four five.</blockquote>',
      'https://example.com/story'
    );

    expect(normalized.blocks).toEqual([
      { id: 'b1', kind: 'heading', text: 'A heading' },
      { id: 'b2', kind: 'paragraph', text: 'One two three.' },
      { id: 'b3', kind: 'quote', text: 'Four five.' },
    ]);
    expect(normalized.wordCount).toBe(7);
    expect(normalized.readingTimeMinutes).toBe(1);
  });
});
