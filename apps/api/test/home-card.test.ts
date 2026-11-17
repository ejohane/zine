import { describe, expect, it } from 'vitest';
import { homeCard, openingText } from '../src/home';

type Item = Parameters<typeof homeCard>[0];
const item = (content: Record<string, unknown>) =>
  ({
    id: 'itm_1',
    savedAt: '2026-11-15T00:00:00Z',
    progress: { position: null, unit: null, completedAt: null, updatedAt: null },
    content: {
      id: 'cnt_1',
      url: 'https://example.com/a',
      platform: 'web',
      type: 'article',
      ...content,
    },
  }) as unknown as Item;

describe('Home card opening text', () => {
  it('keeps whole paragraphs while they fit', () => {
    const text = 'First paragraph here.\n\nSecond one.\n\nThird.';
    expect(openingText(text)).toBe(text);
  });

  it('cuts a long paragraph at a sentence boundary', () => {
    const sentence = 'This sentence has exactly some words in it. ';
    const preview = openingText(sentence.repeat(40), 200)!;
    expect(preview.length).toBeLessThanOrEqual(200);
    expect(preview.endsWith('in it.')).toBe(true);
  });

  it('falls back to a word boundary with an ellipsis', () => {
    const preview = openingText('word '.repeat(300), 100)!;
    expect(preview.length).toBeLessThanOrEqual(100);
    expect(preview.endsWith('word…')).toBe(true);
  });
});

describe('homeCard', () => {
  it('adds reading time and a preview from complete article text without returning the text', () => {
    const text = Array.from({ length: 5 }, () => 'word '.repeat(100).trim()).join('\n\n');
    const card = homeCard(item({ title: 'T', article: { text, coverage: 'complete' } }));
    expect(card.content.readMinutes).toBe(3);
    expect(card.content.preview).toBeTruthy();
    expect(card.content).not.toHaveProperty('article');
  });

  it('omits reading time for partial articles and uses the summary when there is no text', () => {
    const partial = homeCard(item({ article: { text: 'Short text.', coverage: 'partial' } }));
    expect(partial.content.readMinutes).toBeUndefined();
    expect(partial.content.preview).toBe('Short text.');
    const bare = homeCard(item({ summary: 'A summary.' }));
    expect(bare.content.preview).toBe('A summary.');
    expect(bare.content.readMinutes).toBeUndefined();
  });

  it('uses the author’s own thread from the saved post and counts its posts', () => {
    const card = homeCard(
      item({
        type: 'post',
        platform: 'x',
        thread: {
          selectedId: '2',
          posts: [
            { id: '1', author_id: 'other', text: 'Parent from someone else' },
            { id: '2', author_id: 'a', text: 'Saved post' },
            { id: '3', author_id: 'a', text: 'Follow-up' },
          ],
        },
      })
    );
    expect(card.content.preview).toBe('Saved post\n\nFollow-up');
    expect(card.content.threadPosts).toBe(2);
    expect(card.content).not.toHaveProperty('thread');
  });
});
