import { parseHTML } from 'linkedom';
import { XMLParser } from 'fast-xml-parser';
import { fetchPublic, ProviderError } from '../remote';
import type { FeedEntry } from './feed';
interface Segment {
  text: string;
  speaker?: string;
  startSeconds?: number;
  endSeconds?: number;
}
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const arr = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const literal = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const plain = (value: unknown) => {
  const { document } = parseHTML(`<html><body>${String(value ?? '')}</body></html>`);
  for (const node of document.querySelectorAll('script,style')) node.remove();
  return document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
};
function time(value: string) {
  const parts = value.replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3) return undefined;
  if (!parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))) return undefined;
  const numbers = parts.map(Number);
  if (numbers.at(-1)! >= 60 || (parts.length === 3 && numbers[1] >= 60)) return undefined;
  return numbers.reduce((total, number) => total * 60 + number, 0);
}
export function parsePublishedTranscript(input: string, mime: string) {
  const value = input.replace(/^\uFEFF/, '').trim();
  let segments: Segment[] = [];
  if (mime.includes('json') || value.startsWith('{')) {
    let data;
    try {
      data = JSON.parse(value);
    } catch {
      throw new ProviderError('transcript_invalid_json', false);
    }
    segments = arr(obj(data).segments).map((raw) => {
      const segment = obj(raw),
        start = segment.startTime ?? segment.startSeconds,
        end = segment.endTime ?? segment.endSeconds;
      return {
        text: literal(segment.body ?? segment.text),
        ...(typeof segment.speaker === 'string' ? { speaker: segment.speaker.slice(0, 300) } : {}),
        ...(typeof start === 'number' && Number.isFinite(start) && start >= 0
          ? { startSeconds: start }
          : {}),
        ...(typeof end === 'number' && Number.isFinite(end) && end >= 0 ? { endSeconds: end } : {}),
      };
    });
  } else if (value.includes('-->')) {
    const lines = value.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const match = /^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)/.exec(lines[i]);
      if (!match) continue;
      const start = time(match[1]),
        end = time(match[2]);
      if (start === undefined || end === undefined || end < start) continue;
      const text = [];
      for (i++; i < lines.length && lines[i].trim(); i++) text.push(lines[i]);
      segments.push({ text: plain(text.join(' ')), startSeconds: start, endSeconds: end });
    }
  } else if (
    mime.includes('xml') ||
    value.startsWith('<transcript') ||
    value.startsWith('<timedtext')
  ) {
    if (/<!DOCTYPE|<!ENTITY/i.test(value))
      throw new ProviderError('transcript_entities_forbidden', false);
    let parsed: Record<string, unknown>;
    try {
      parsed = new XMLParser({ ignoreAttributes: false, processEntities: true }).parse(value);
    } catch {
      throw new ProviderError('transcript_invalid_xml', false);
    }
    const legacy = arr(obj(parsed.transcript).text);
    if (legacy.length)
      segments = legacy.map((raw) => {
        const node = obj(raw),
          start = Number(node['@_start']),
          duration = Number(node['@_dur'] ?? 0);
        return { text: plain(node['#text']), startSeconds: start, endSeconds: start + duration };
      });
    else
      segments = arr(obj(obj(parsed.timedtext).body).p).map((raw) => {
        const node = obj(raw),
          start = Number(node['@_t'] ?? 0) / 1000,
          duration = Number(node['@_d'] ?? 0) / 1000;
        return {
          text: plain(
            node['#text'] ??
              arr(node.s)
                .map((part) => (typeof part === 'string' ? part : obj(part)['#text']))
                .join('')
          ),
          startSeconds: start,
          endSeconds: start + duration,
        };
      });
  } else if (mime.includes('text/html')) {
    const { document } = parseHTML(value);
    for (const node of document.querySelectorAll('script,style,nav,header,footer,form'))
      node.remove();
    segments = [...document.querySelectorAll('p')].flatMap((node) => {
      const text = literal(node.textContent);
      if (!text) return [];
      const previous = node.previousElementSibling;
      const speaker =
        previous?.tagName === 'CITE' ? literal(previous.textContent).replace(/:$/, '') : undefined;
      const pieces: Segment[] = [];
      for (let offset = 0; offset < text.length; offset += 25000)
        pieces.push({ text: text.slice(offset, offset + 25000), ...(speaker ? { speaker } : {}) });
      return pieces;
    });
    if (!segments.length) {
      const text = literal(document.body.textContent);
      for (let offset = 0; offset < text.length; offset += 25000)
        segments.push({ text: text.slice(offset, offset + 25000) });
    }
  } else if (mime.startsWith('text/plain')) {
    const words = literal(value);
    for (let offset = 0; offset < words.length; offset += 25000)
      segments.push({ text: words.slice(offset, offset + 25000) });
  } else throw new ProviderError('transcript_format_unsupported', false);
  segments = segments.filter((segment) => segment.text);
  if (!segments.length) throw new ProviderError('transcript_empty', false);
  if (
    segments.reduce((sum, segment) => sum + segment.text.length, 0) > 900000 ||
    segments.length > 30000 ||
    segments.some(
      (segment) =>
        segment.text.length > 30000 ||
        (segment.startSeconds !== undefined &&
          (!Number.isFinite(segment.startSeconds) || segment.startSeconds < 0)) ||
        (segment.endSeconds !== undefined &&
          (!Number.isFinite(segment.endSeconds) ||
            segment.endSeconds < (segment.startSeconds ?? 0)))
    )
  )
    throw new ProviderError('transcript_limits_exceeded', false);
  return { segments };
}
export async function publishedTranscript(references: FeedEntry['transcripts']) {
  let last = 'transcript_reference_unavailable';
  const ordered = [...references].sort(
    (a, b) => Number(b.language?.startsWith('en')) - Number(a.language?.startsWith('en'))
  );
  for (const reference of ordered.slice(0, 5)) {
    try {
      const response = await fetchPublic(reference.url, {
        accept: 'text/vtt,application/json,application/x-subrip,text/plain,text/xml',
        maxBytes: 4 * 1024 * 1024,
      });
      const value = parsePublishedTranscript(
        response.text,
        reference.type ?? response.headers.get('content-type') ?? ''
      );
      return {
        value: { ...value, ...(reference.language ? { language: reference.language } : {}) },
        url: response.url,
      };
    } catch (error) {
      if (error instanceof ProviderError) {
        if (error.retryable) throw error;
        last = error.code;
      } else throw error;
    }
  }
  throw new ProviderError(last, false);
}
