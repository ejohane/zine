import { ulid } from 'ulid';
import type { Bindings } from '../types';
import { PublicationError, requireFound } from './errors';
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
/** The encoder can retain copyright/credentials. Remove all JPEG application metadata. */
export function stripCoverMetadata(bytes: Uint8Array): Uint8Array {
  const invalid = () => new PublicationError('UNSUPPORTED_MEDIA', 415);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw invalid();
  const chunks: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 0xff) throw invalid();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(bytes.subarray(start));
      const result = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
      let position = 0;
      for (const chunk of chunks) {
        result.set(chunk, position);
        position += chunk.length;
      }
      return result;
    }
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw invalid();
    offset += length;
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe)
      chunks.push(bytes.subarray(start, offset));
  }
  throw invalid();
}
/** Retired asset rows remain discoverable so a failed byte deletion can be retried. */
export async function purgeRetiredCovers(env: Bindings, owner: string) {
  const assets = await env.DB.prepare(
    'SELECT storage_key FROM personal_publication_assets WHERE owner_id=? AND unavailable_at IS NOT NULL'
  )
    .bind(owner)
    .all<{ storage_key: string }>();
  if (!assets.results.length) return;
  if (!env.PUBLICATION_MEDIA) throw new PublicationError('COVER_CAPABILITY_UNAVAILABLE', 503);
  await env.PUBLICATION_MEDIA.delete(assets.results.map((a) => a.storage_key));
}
async function bounded(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > limit) throw new PublicationError('PAYLOAD_TOO_LARGE', 413);
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function uploadCover(env: Bindings, owner: string, request: Request) {
  if (!env.PUBLICATION_MEDIA || !env.PUBLICATION_IMAGES)
    throw new PublicationError('COVER_CAPABILITY_UNAVAILABLE', 503);
  if (Number(request.headers.get('content-length')) > MAX_COVER_BYTES)
    throw new PublicationError('PAYLOAD_TOO_LARGE', 413);
  // Raw bounded image bytes avoid multipart overhead and unbounded formData buffering.
  const type = request.headers.get('content-type')?.split(';')[0];
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type || ''))
    throw new PublicationError('UNSUPPORTED_MEDIA', 415);
  const bytes = await bounded(requireFound(request.body), MAX_COVER_BYTES);
  const stream = () => new Blob([bytes.slice().buffer as ArrayBuffer]).stream();
  let output: ImageTransformationResult;
  try {
    const info = await env.PUBLICATION_IMAGES.info(stream());
    if (
      !('width' in info) ||
      !('height' in info) ||
      !['jpeg', 'png', 'webp', 'image/jpeg', 'image/png', 'image/webp'].includes(info.format) ||
      info.width * info.height > 20_000_000
    )
      throw new PublicationError('UNSUPPORTED_MEDIA', 415);
    output = await env.PUBLICATION_IMAGES.input(stream())
      .transform({ width: 1200, height: 630, fit: 'cover' })
      .output({ format: 'image/jpeg', quality: 85 });
  } catch (e) {
    if (e instanceof PublicationError) throw e;
    throw new PublicationError('UNSUPPORTED_MEDIA', 415);
  }
  const sanitized = stripCoverMetadata(await bounded(output.image(), MAX_COVER_BYTES)),
    id = ulid(),
    key = `covers/${id}.jpg`;
  await env.PUBLICATION_MEDIA.put(key, sanitized, { httpMetadata: { contentType: 'image/jpeg' } });
  try {
    await env.DB.prepare(
      'INSERT INTO personal_publication_assets(id,owner_id,storage_key,content_type,byte_size,created_at) VALUES(?,?,?,?,?,?)'
    )
      .bind(id, owner, key, 'image/jpeg', sanitized.length, Date.now())
      .run();
  } catch (e) {
    await env.PUBLICATION_MEDIA.delete(key);
    throw e;
  }
  return { asset: { id, contentType: 'image/jpeg', byteSize: sanitized.length } };
}
export async function publicCover(env: Bindings, id: string): Promise<Response> {
  const asset = requireFound(
    await env.DB.prepare(
      `SELECT storage_key,content_type FROM personal_publication_assets a WHERE a.id=? AND a.unavailable_at IS NULL AND (EXISTS(SELECT 1 FROM personal_publications p WHERE p.cover_asset_id=a.id AND p.unavailable_at IS NULL) OR EXISTS(SELECT 1 FROM personal_issues i JOIN personal_publications p ON p.id=i.publication_id WHERE i.cover_asset_id=a.id AND i.status='PUBLISHED' AND i.unavailable_at IS NULL AND p.unavailable_at IS NULL))`
    )
      .bind(id)
      .first<{ storage_key: string; content_type: string }>()
  );
  if (!env.PUBLICATION_MEDIA) throw new PublicationError('COVER_CAPABILITY_UNAVAILABLE', 503);
  const object = requireFound(await env.PUBLICATION_MEDIA.get(asset.storage_key));
  return new Response(object.body, {
    headers: {
      'Content-Type': asset.content_type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Owner-only draft preview; never broadens the anonymous asset projection. */
export async function privateCover(env: Bindings, owner: string, id: string): Promise<Response> {
  const asset = requireFound(
    await env.DB.prepare(
      'SELECT storage_key,content_type FROM personal_publication_assets WHERE id=? AND owner_id=? AND unavailable_at IS NULL'
    )
      .bind(id, owner)
      .first<{ storage_key: string; content_type: string }>()
  );
  if (!env.PUBLICATION_MEDIA) throw new PublicationError('COVER_CAPABILITY_UNAVAILABLE', 503);
  const object = requireFound(await env.PUBLICATION_MEDIA.get(asset.storage_key));
  return new Response(object.body, {
    headers: {
      'Content-Type': asset.content_type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
