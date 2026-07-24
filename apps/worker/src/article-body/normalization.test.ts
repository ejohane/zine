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

  it('removes a known comments widget footer only when it trails the article', () => {
    const normalized = normalizeArticleBodyHtml(
      '<p>The article discusses comments powered by Disqus as part of its analysis.</p><p>A complete conclusion.</p><p>blog comments powered by Disqus</p>',
      'https://example.com/story'
    );

    expect(normalized.plainText).toBe(
      'The article discusses comments powered by Disqus as part of its analysis.\n\nA complete conclusion.'
    );
    expect(normalized.sanitizedHtml).not.toContain('blog comments powered by Disqus');
    expect(normalized.diagnostics.droppedElements).toBe(1);
  });

  it('recovers long prose wrapped in a pre element without rewriting code blocks', () => {
    const proseParagraph =
      'This is a complete prose sentence about dependable reading systems and careful product decisions.';
    const normalized = normalizeArticleBodyHtml(
      `<pre>${Array.from({ length: 12 }, (_, index) => `${proseParagraph} Paragraph ${index + 1}.`).join('\n\n')}</pre><pre>function keepAsCode() {\n  return true;\n}</pre>`,
      'https://example.com/story'
    );

    expect(normalized.blocks.filter((block) => block.kind === 'paragraph')).toHaveLength(12);
    expect(normalized.sanitizedHtml).toContain('<p>This is a complete prose sentence');
    expect(normalized.sanitizedHtml).toContain('<pre>function keepAsCode()');
  });

  it('removes consecutive duplicate blocks at the article tail but preserves earlier repetition', () => {
    const repeated = 'This deliberate refrain belongs in the article.';
    const duplicateFootnote = 'This post was based on a useful source comment.';
    const normalized = normalizeArticleBodyHtml(
      `<p>${repeated}</p><p>${repeated}</p>${Array.from({ length: 10 }, (_, index) => `<p>Body paragraph ${index + 1} carries distinct context.</p>`).join('')}<p>${duplicateFootnote}</p><p>${duplicateFootnote}</p>`,
      'https://example.com/story'
    );

    expect(normalized.blocks.filter((block) => block.text === repeated)).toHaveLength(2);
    expect(normalized.blocks.filter((block) => block.text === duplicateFootnote)).toHaveLength(1);
    expect(normalized.diagnostics.droppedElements).toBe(1);
  });

  it('counts nested list and quote content once in semantic text and metrics', () => {
    const normalized = normalizeArticleBodyHtml(
      '<ul><li><p>A nested list item with useful detail.</p></li></ul><blockquote><p>A nested quotation.</p></blockquote>',
      'https://example.com/story'
    );

    expect(normalized.blocks).toEqual([
      { id: 'b1', kind: 'list_item', text: 'A nested list item with useful detail.' },
      { id: 'b2', kind: 'quote', text: 'A nested quotation.' },
    ]);
    expect(normalized.wordCount).toBe(10);
  });
});
