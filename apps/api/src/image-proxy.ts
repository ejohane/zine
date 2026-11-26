import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { publicUrl } from './identity';
import { visibleContributions } from './items';
import { digest, stmt } from './lib';
import { validateDns } from './remote';
import type { AppEnv, Env } from './types';

/**
 * Record-scoped image proxy.
 *
 * Publishers may serve covers and avatars with `Cross-Origin-Resource-Policy: same-origin`
 * or hotlink protection, so a browser on our origin cannot render them directly. Clients
 * instead receive `/v1/img/items/<itemId>/<thumbnail|creator>?v=<hash>` references.
 *
 * The route takes no URL from the caller. It looks up the item's stored, currently visible
 * `thumbnail` / `creatorImageUrl` (the same selection the item JSON uses) and fetches only
 * that, so it cannot be used as an open proxy and needs no secret.
 *
 * Privacy tradeoff: the route is unauthenticated, because an `<img>` cannot send a bearer
 * token. Anyone holding an item id can therefore load that item's cover and avatar bytes.
 * Nothing else is exposed: no title, owner, URL or other metadata, and an unknown id, a
 * deleted item and an item without an image all get the same 404 (any other answer does
 * reveal that the id exists and has an image). Item ids are only handed to their owner in
 * authenticated responses and are not enumerable: 160 bits of SHA-256 over the owner's
 * account id and the content id, so guessing one needs the private account id. Aliased
 * (reconciled) ids are not followed; responses always carry the canonical id.
 *
 * Abuse: the route is outside per-account usage limits. A request for an unknown id costs
 * one indexed D1 read; a known id costs three reads plus, on a cache miss, one bounded
 * upstream fetch (10 s, 5 MB) of a URL the owner already stored. Day-long browser and Cache
 * API caching keep repeat traffic off the source.
 */
export const IMAGE_PROXY_PATH = '/v1/img';
/** Internal callers (MCP) set this so agents and exports keep the original source URLs. */
export const RAW_IMAGES_HEADER = 'x-zine-raw-images';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
/** Route segment -> the content field it serves. */
const IMAGE_KINDS = { thumbnail: 'thumbnail', creator: 'creatorImageUrl' } as const;
type ImageKind = keyof typeof IMAGE_KINDS;
/** `stableId('itm', ...)` (40 hex) or `id('itm')` (32 hex); nothing else reaches the database. */
const ITEM_ID = /^itm_(?:[a-f0-9]{32}|[a-f0-9]{40})$/;
/** Publisher-supplied blobs and retained material are returned exactly as stored. */
const OPAQUE_FIELDS = new Set(['structuredData', 'raw', 'article', 'thread', 'transcript']);

/**
 * `v` is the first 8 hex characters of SHA-256(stored URL). The route ignores it; it only
 * changes the reference when the stored image changes, so a browser's day-long HTTP cache of
 * the old reference is not reused for the new image.
 */
export async function itemImageUrl(
  origin: string,
  itemId: string,
  kind: ImageKind,
  stored: string
) {
  return `${origin}${IMAGE_PROXY_PATH}/items/${itemId}/${kind}?v=${(await digest(stored)).slice(0, 8)}`;
}

function proxyable(value: unknown, origin: string): value is string {
  if (typeof value !== 'string') return false;
  // Never wrap a reference that already points at this proxy.
  if (value.startsWith(`${origin}${IMAGE_PROXY_PATH}/`)) return false;
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/**
 * Returns a copy of `body` in which every item or Home card (an object with an item `id` and
 * a `content` object) has its `content.thumbnail` and `content.creatorImageUrl` pointing at
 * the proxy route for that item. Image fields that do not belong to an identifiable item
 * (for example entries of `content.members`) are left as stored.
 */
export async function rewriteImages<T>(body: T, origin: string): Promise<T> {
  const walk = async (value: unknown): Promise<unknown> => {
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (!plain(value)) return value;
    if (typeof value.id === 'string' && ITEM_ID.test(value.id) && plain(value.content)) {
      const content = { ...value.content };
      for (const [kind, field] of Object.entries(IMAGE_KINDS) as [ImageKind, string][])
        if (proxyable(content[field], origin))
          content[field] = await itemImageUrl(origin, value.id, kind, content[field]);
      return { ...value, content };
    }
    const entries = await Promise.all(
      Object.entries(value).map(
        async ([key, child]) => [key, OPAQUE_FIELDS.has(key) ? child : await walk(child)] as const
      )
    );
    return Object.fromEntries(entries);
  };
  return (await walk(body)) as T;
}
/**
 * HTTP response boundary only: stored contributions, idempotency records, exports and MCP
 * output keep the original URLs.
 *
 * Bodies are also left untouched when the request did not arrive over https (local
 * `wrangler dev`): clients only render `https:` images, so a reference to an
 * `http://localhost` API would show nothing, while the original URLs keep working.
 */
export async function clientImages<T>(c: Context<AppEnv>, body: T): Promise<T> {
  const url = new URL(c.req.url);
  if (url.protocol !== 'https:' || c.req.header(RAW_IMAGES_HEADER) === '1') return body;
  return rewriteImages(body, url.origin);
}

/** The image URL the item JSON would show its owner for this field, if any. */
async function storedImage(env: Env, itemId: string, kind: ImageKind) {
  const item = await stmt(
    env.DB,
    'SELECT owner_id,content_id,status FROM personal_items WHERE id=?',
    itemId
  ).first<{ owner_id: string; content_id: string; status: string }>();
  if (!item || item.status === 'deleted') return undefined;
  // Same ordering as getItem: the first visible contribution for a field is the shown one.
  const shown = (await visibleContributions(env, item.owner_id, item.content_id)).find(
    (contribution) => contribution.field === IMAGE_KINDS[kind]
  );
  if (!shown?.value_json) return undefined;
  const value: unknown = JSON.parse(shown.value_json);
  return typeof value === 'string' && value ? value : undefined;
}

class ImageFailure extends Error {
  constructor(
    public status: 404 | 502,
    public code: string
  ) {
    super(code);
  }
}
async function fetchImage(input: string) {
  let url: URL;
  try {
    url = publicUrl(input);
  } catch {
    throw new ImageFailure(502, 'image_source_not_public');
  }
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    // Every hop is re-validated: a public host must not redirect into a private network.
    try {
      await validateDns(url.hostname);
    } catch {
      throw new ImageFailure(502, 'image_source_not_public');
    }
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        redirect: 'manual',
        headers: { 'user-agent': 'Zine/1.0 (+https://myzine.app)', accept: 'image/*' },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ImageFailure(502, 'image_source_unreachable');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      try {
        url = publicUrl(new URL(location ?? '', url).toString());
      } catch {
        throw new ImageFailure(502, 'image_source_not_public');
      }
      if (!location) throw new ImageFailure(502, 'image_source_unreachable');
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw response.status === 404 || response.status === 410
        ? new ImageFailure(404, 'image_not_found')
        : new ImageFailure(502, 'image_source_unreachable');
    }
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/.test(type)) {
      await response.body?.cancel();
      throw new ImageFailure(502, 'image_type_unsupported');
    }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body?.cancel();
      throw new ImageFailure(502, 'image_too_large');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ImageFailure(502, 'image_source_unreachable');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        // Content-Length can be absent or wrong, so the cap is also enforced on the stream.
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new ImageFailure(502, 'image_too_large');
        }
        chunks.push(chunk.value);
      }
    } catch (error) {
      if (error instanceof ImageFailure) throw error;
      throw new ImageFailure(502, 'image_source_unreachable');
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { type, bytes };
  }
  throw new ImageFailure(502, 'image_source_unreachable');
}

const NOT_RETRIEVED = 'The image could not be retrieved';
function failure(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  cacheControl: string
) {
  c.header('Cache-Control', cacheControl);
  return c.json({ error: { code, message, requestId: c.get('requestId') } }, status);
}

/**
 * `GET /v1/img/items/:itemId/:kind`; registered before the bearer-token middleware.
 * Query parameters (the `v` cache-buster) are ignored.
 */
export async function imageProxy(c: Context<AppEnv>) {
  const itemId = c.req.param('itemId') ?? '';
  const kind = c.req.param('kind') ?? '';
  const source =
    ITEM_ID.test(itemId) && Object.hasOwn(IMAGE_KINDS, kind)
      ? await storedImage(c.env, itemId, kind as ImageKind)
      : undefined;
  // One answer for a malformed id, an unknown or deleted item and an item with no image.
  if (!source) return failure(c, 404, 'image_not_found', NOT_RETRIEVED, 'public, max-age=60');

  // Keyed on the upstream URL, not the route: when the stored image changes the next request
  // misses and fetches the new one, and items sharing an image share one cached copy.
  // Headers go through c.header so they replace the API-wide `no-store` default.
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(
    `${new URL(c.req.url).origin}${IMAGE_PROXY_PATH}/source/${await digest(source)}`,
    { method: 'GET' }
  );
  const hit = await cache.match(cacheKey);
  if (hit) {
    for (const [name, value] of hit.headers) c.header(name, value);
    c.header('X-Zine-Image-Cache', 'HIT');
    return c.body(await hit.arrayBuffer());
  }

  let image: Awaited<ReturnType<typeof fetchImage>>;
  try {
    image = await fetchImage(source);
  } catch (error) {
    if (!(error instanceof ImageFailure)) throw error;
    // Briefly cacheable by the browser, never stored in the shared cache.
    return failure(c, error.status, error.code, NOT_RETRIEVED, 'public, max-age=60');
  }
  const headers: Record<string, string> = {
    'Content-Type': image.type,
    'Content-Length': String(image.bytes.byteLength),
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  if (image.type === 'image/svg+xml') {
    // SVG is served because many site icons and logos only exist as SVG. It is only ever
    // referenced from <img>, where scripts never run; the sandboxing policy also disarms
    // scripts, external loads and same-origin access if the proxy URL is opened directly.
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    headers['Content-Disposition'] = 'inline';
  }
  c.executionCtx.waitUntil(cache.put(cacheKey, new Response(image.bytes, { headers })));
  for (const [name, value] of Object.entries(headers)) c.header(name, value);
  c.header('X-Zine-Image-Cache', 'MISS');
  return c.body(image.bytes);
}
