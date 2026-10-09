import { createHash } from 'node:crypto';
import { z } from 'zod';
import { hash } from './jev';

export const TranscriptSchema = z.object({
  version: z.literal(1),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().min(1),
  sourceUrl: z.string().url(),
  acquisition: z.enum([
    'YOUTUBE_AUTO_CAPTIONS',
    'YOUTUBE_UPLOADED_CAPTIONS',
    'PUBLISHER_TRANSCRIPT',
  ]),
  language: z.string().min(1),
  textSha256: z.string().regex(/^[a-f0-9]{64}$/),
  warnings: z.array(z.string()),
  segments: z
    .array(
      z.object({
        text: z.string().min(1),
        startMs: z.number().nonnegative().optional(),
        endMs: z.number().nonnegative().optional(),
      })
    )
    .min(1),
});

/** Every segment is included; long segments are split without dropping Unicode. */
export function chunkTranscript(raw: unknown, maxBytes = 12000) {
  if (!Number.isInteger(maxBytes) || maxBytes < 256) throw new Error('Invalid chunk byte budget.');
  const transcript = TranscriptSchema.parse(raw);
  const canonicalText = transcript.segments.map((segment) => segment.text).join('\n');
  if (createHash('sha256').update(canonicalText).digest('hex') !== transcript.textSha256)
    throw new Error('Transcript content hash mismatch.');
  const chunks: Array<{ text: string; startMs?: number; endMs?: number; hash: string }> = [];
  let text = '',
    startMs: number | undefined,
    endMs: number | undefined;
  const flush = () => {
    if (text) chunks.push({ text, startMs, endMs, hash: hash(text) });
    text = '';
    startMs = undefined;
    endMs = undefined;
  };
  let previousStart = -1;
  for (const segment of transcript.segments) {
    if (
      (segment.startMs === undefined) !== (segment.endMs === undefined) ||
      (segment.startMs !== undefined &&
        (segment.startMs < previousStart || segment.endMs! < segment.startMs))
    )
      throw new Error('Invalid transcript timestamp sequence.');
    previousStart = segment.startMs ?? previousStart;
    if (text && Buffer.byteLength(text + '\n' + segment.text) > maxBytes) flush();
    if (text) text += '\n';
    startMs ??= segment.startMs;
    endMs = segment.endMs;
    for (const char of segment.text) {
      if (Buffer.byteLength(text + char) > maxBytes) {
        flush();
        startMs = segment.startMs;
        endMs = segment.endMs;
      }
      text += char;
    }
  }
  flush();
  return { transcript, chunks };
}
