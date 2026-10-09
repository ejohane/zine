import { expect, test } from 'bun:test';
import { CaptionSourceSchema, normalizeCaptions } from './captions';
import { chunkTranscript } from './transcript';
test('JSON3 import retains Unicode words and timestamps and ignores window-only events', () => {
  const value = normalizeCaptions({
    events: [
      { tStartMs: 0, dDurationMs: 2000 },
      { tStartMs: 10, dDurationMs: 100, segs: [{ utf8: 'Rust' }, { utf8: ' 😀' }] },
      { tStartMs: 50, segs: [{ utf8: '\n' }] },
    ],
  });
  expect(value.text).toBe('Rust 😀');
  expect(value.segments).toEqual([{ text: 'Rust 😀', startMs: 10, endMs: 110 }]);
  expect(
    chunkTranscript({
      version: 1,
      videoId: 'q9xD36NCtZ8',
      title: 'Rust',
      sourceUrl: 'https://youtube.com/watch?v=q9xD36NCtZ8',
      acquisition: 'YOUTUBE_AUTO_CAPTIONS',
      language: 'en',
      warnings: [],
      ...value,
    }).chunks.length
  ).toBe(1);
});
test('rejects empty or malformed captions and path-bearing source IDs', () => {
  expect(() => normalizeCaptions({ events: [] })).toThrow('no text');
  expect(() => normalizeCaptions({ events: [{ tStartMs: -1, segs: [{ utf8: 'x' }] }] })).toThrow();
  expect(() => CaptionSourceSchema.parse({ title: 'bad', videoId: '../../secrets' })).toThrow();
});
