import { createHash } from 'node:crypto';
import { expect, test } from 'bun:test';
import { chunkTranscript } from './transcript';
const fixture = {
  version: 1,
  videoId: 'q9xD36NCtZ8',
  title: 'Rust',
  sourceUrl: 'https://youtube.com/watch?v=q9xD36NCtZ8',
  acquisition: 'YOUTUBE_AUTO_CAPTIONS',
  language: 'en',
  textSha256: createHash('sha256')
    .update('😀'.repeat(150) + '\nend')
    .digest('hex'),
  warnings: [],
  segments: [
    { text: '😀'.repeat(150), startMs: 0, endMs: 1000 },
    { text: 'end', startMs: 1000, endMs: 2000 },
  ],
};
test('chunking covers long Unicode segments and preserves timing', () => {
  const { chunks } = chunkTranscript(fixture, 256);
  expect(
    chunks
      .map((c) => c.text)
      .join('')
      .replace(/\n/g, '')
  ).toBe('😀'.repeat(150) + 'end');
  expect(chunks.every((c) => Buffer.byteLength(c.text) <= 256)).toBe(true);
  expect(chunks.at(-1)!.endMs).toBe(2000);
});
test('rejects reversed or incomplete timestamp pairs', () => {
  expect(() =>
    chunkTranscript({
      ...fixture,
      textSha256: createHash('sha256').update('x').digest('hex'),
      segments: [{ text: 'x', startMs: 20, endMs: 10 }],
    })
  ).toThrow('Invalid transcript timestamp sequence.');
  expect(() =>
    chunkTranscript({
      ...fixture,
      textSha256: createHash('sha256').update('x').digest('hex'),
      segments: [{ text: 'x', startMs: 20 }],
    })
  ).toThrow();
});

test('rejects changed transcript content', () => {
  expect(() => chunkTranscript({ ...fixture, textSha256: 'a'.repeat(64) })).toThrow(
    'Transcript content hash mismatch.'
  );
});
