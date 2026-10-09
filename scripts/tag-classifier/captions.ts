import { createHash } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { chunkTranscript } from './transcript';

export const CaptionSourceSchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().min(1),
});
const CaptionsSchema = z.object({
  events: z.array(
    z.object({
      tStartMs: z.number().nonnegative(),
      dDurationMs: z.number().nonnegative().optional(),
      segs: z.array(z.object({ utf8: z.string() })).optional(),
    })
  ),
});
export function normalizeCaptions(raw: unknown) {
  const segments = CaptionsSchema.parse(raw).events.flatMap((event) => {
    const text = (event.segs ?? [])
      .map((s) => s.utf8)
      .join('')
      .trim();
    return text
      ? [{ text, startMs: event.tStartMs, endMs: event.tStartMs + (event.dDurationMs ?? 0) }]
      : [];
  });
  if (!segments.length) throw new Error('Caption track contains no text.');
  const text = segments.map((s) => s.text).join('\n');
  return { segments, text, textSha256: createHash('sha256').update(text).digest('hex') };
}
async function atomicJson(path: string, value: unknown) {
  const temporary = path + '.tmp';
  await Bun.write(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, path);
}

/** Caption-only acquisition. No cookies, audio/video download, or production writes. */
export async function acquireCaptions(sourcesPath: string, out: string) {
  const sources = z
    .array(CaptionSourceSchema)
    .min(1)
    .parse(await Bun.file(sourcesPath).json());
  if (new Set(sources.map((s) => s.videoId)).size !== sources.length)
    throw new Error('Duplicate video sources.');
  await mkdir(out, { recursive: true });
  const versionProcess = Bun.spawn(['yt-dlp', '--version'], { stdout: 'pipe', stderr: 'pipe' });
  const version = (await new Response(versionProcess.stdout).text()).trim();
  if ((await versionProcess.exited) !== 0)
    throw new Error('yt-dlp is unavailable. Install it before caption acquisition.');
  const manifest = [];
  for (const source of sources) {
    const path = join(out, source.videoId + '.transcript.json');
    if (await Bun.file(path).exists()) {
      const existing = chunkTranscript(await Bun.file(path).json()).transcript;
      if (existing.videoId !== source.videoId)
        throw new Error('Existing transcript belongs to another video.');
      manifest.push({
        ...source,
        status: 'ACQUIRED',
        file: source.videoId + '.transcript.json',
        acquisition: existing.acquisition,
      });
    } else {
      const sourceUrl = `https://www.youtube.com/watch?v=${source.videoId}`;
      const proc = Bun.spawn(
        [
          'yt-dlp',
          '--ignore-config',
          '--skip-download',
          '--write-subs',
          '--write-auto-subs',
          '--write-info-json',
          '--sub-langs',
          'en',
          '--sub-format',
          'json3',
          '--no-playlist',
          '--socket-timeout',
          '15',
          '--retries',
          '1',
          '--sleep-requests',
          '3',
          '--sleep-subtitles',
          '10',
          '-o',
          join(out, '%(id)s.%(ext)s'),
          sourceUrl,
        ],
        { stdout: 'pipe', stderr: 'pipe' }
      );
      const deadline = setTimeout(() => proc.kill(), 90_000);
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const code = await proc.exited;
      clearTimeout(deadline);
      if (code !== 0) {
        const reason = /429|Too Many Requests/.test(stdout + stderr)
          ? 'RATE_LIMITED'
          : /subtitles.*not|no subtitles/i.test(stdout + stderr)
            ? 'NO_CAPTIONS'
            : 'ACQUISITION_FAILED';
        manifest.push({
          ...source,
          status: reason,
          exitCode: code,
          attemptedAt: new Date().toISOString(),
        });
      } else {
        try {
          const rawPath = join(out, source.videoId + '.en.json3'),
            infoPath = join(out, source.videoId + '.info.json');
          const raw = await Bun.file(rawPath).json();
          const info = await Bun.file(infoPath).json();
          if (info.id !== source.videoId) throw new Error('Source video mismatch.');
          const acquisition = info.subtitles?.en?.length
            ? 'YOUTUBE_UPLOADED_CAPTIONS'
            : info.automatic_captions?.en?.length
              ? 'YOUTUBE_AUTO_CAPTIONS'
              : null;
          if (!acquisition) throw new Error('English caption provenance unavailable.');
          const normalized = normalizeCaptions(raw);
          const last = Math.max(...normalized.segments.map((s) => s.endMs)) / 1000;
          const warnings =
            acquisition === 'YOUTUBE_AUTO_CAPTIONS'
              ? ['AUTOMATIC_CAPTIONS_MAY_CONTAIN_ERRORS']
              : [];
          if (typeof info.duration === 'number' && last < info.duration * 0.95)
            warnings.push('CAPTIONS_END_BEFORE_LAST_5_PERCENT');
          const transcript = {
            version: 1,
            ...source,
            sourceUrl,
            acquisition,
            language: 'en',
            retrievedAt: new Date().toISOString(),
            extractor: `yt-dlp ${version}`,
            normalizerVersion: 1,
            videoDurationSeconds: info.duration,
            lastCaptionEndSeconds: last,
            warnings,
            ...normalized,
          };
          chunkTranscript(transcript);
          await atomicJson(path, transcript);
          // The normalized archive retains provenance, not expiring signed media URLs.
          await unlink(infoPath);
          manifest.push({
            ...source,
            status: 'ACQUIRED',
            file: source.videoId + '.transcript.json',
            acquisition,
          });
        } catch {
          manifest.push({
            ...source,
            status: 'INVALID_CAPTION_ARTIFACT',
            attemptedAt: new Date().toISOString(),
          });
        }
      }
    }
    await atomicJson(join(out, 'manifest.json'), manifest);
  }
  return manifest;
}
if (import.meta.main) {
  const [sources, out] = process.argv.slice(2);
  if (!sources || !out) throw new Error('Usage: captions.ts SOURCE_MANIFEST OUTPUT_DIRECTORY');
  console.log(JSON.stringify(await acquireCaptions(sources, out), null, 2));
}
