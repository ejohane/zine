import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { publicUrl } from './identity';
import { validateDns } from './remote';
import type { AppEnv } from './types';

/**
 * Signed image proxy.
 *
 * Publishers may serve covers and avatars with `Cross-Origin-Resource-Policy: same-origin`
 * or hotlink protection, so a browser on our origin cannot render them directly. Clients
 * instead receive `/v1/img?u=<url>&s=<signature>` references. The HMAC signature is the
 * authorization: only URLs this API itself placed in a response can be fetched, so the route
 * is not an open proxy and needs no bearer token (an `<img>` cannot send one).
 *
 * Without `IMAGE_PROXY_SECRET` the route answers 503 and no response is rewritten.
 */
export const IMAGE_PROXY_PATH = '/v1/img';
/** Internal callers (MCP) set this so agents and exports keep the original source URLs. */
export const RAW_IMAGES_HEADER = 'x-zine-raw-images';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const IMAGE_FIELDS = new Set(['thumbnail', 'creatorImageUrl']);
/** Publisher-supplied blobs and retained material are returned exactly as stored. */
const OPAQUE_FIELDS = new Set(['structuredData', 'raw', 'article', 'thread', 'transcript']);

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string) {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    keys.set(secret, key);
  }
  return key;
}
function base64url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64url(value: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}

/** HMAC-SHA256 over the exact URL string, base64url encoded. */
export async function signImageUrl(secret: string, url: string) {
  return base64url(
    new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(url)))
  );
}
/** Constant-time verification through WebCrypto. */
export async function verifyImageSignature(secret: string, url: string, signature: string) {
  const bytes = fromBase64url(signature);
  if (!bytes) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, encoder.encode(url));
}
export async function proxiedImageUrl(secret: string, origin: string, url: string) {
  return `${origin}${IMAGE_PROXY_PATH}?u=${encodeURIComponent(url)}&s=${await signImageUrl(secret, url)}`;
}

function proxyable(value: string, origin: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    // Never wrap a reference that already points at this proxy.
    return !(url.origin === origin && url.pathname === IMAGE_PROXY_PATH);
  } catch {
    return false;
  }
}
/** Returns a copy of `body` whose image references go through the proxy at `origin`. */
export async function rewriteImages<T>(body: T, secret: string, origin: string): Promise<T> {
  const walk = async (value: unknown): Promise<unknown> => {
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (!value || typeof value !== 'object') return value;
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, child]) => {
        if (OPAQUE_FIELDS.has(key)) return [key, child] as const;
        if (IMAGE_FIELDS.has(key) && typeof child === 'string')
          return [
            key,
            proxyable(child, origin) ? await proxiedImageUrl(secret, origin, child) : child,
          ] as const;
        return [key, await walk(child)] as const;
      })
    );
    return Object.fromEntries(entries);
  };
  return (await walk(body)) as T;
}
/**
 * HTTP response boundary only: stored contributions, idempotency records, exports and MCP
 * output keep the original URLs. A deployment without the secret returns bodies untouched.
 */
export async function clientImages<T>(c: Context<AppEnv>, body: T): Promise<T> {
  const secret = c.env.IMAGE_PROXY_SECRET;
  if (!secret || c.req.header(RAW_IMAGES_HEADER) === '1') return body;
  return rewriteImages(body, secret, new URL(c.req.url).origin);
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

function failure(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  cacheControl?: string
) {
  if (cacheControl) c.header('Cache-Control', cacheControl);
  return c.json({ error: { code, message, requestId: c.get('requestId') } }, status);
}

/** `GET /v1/img?u=<url>&s=<signature>`; registered before the bearer-token middleware. */
export async function imageProxy(c: Context<AppEnv>) {
  const secret = c.env.IMAGE_PROXY_SECRET;
  if (!secret)
    return failure(c, 503, 'image_proxy_unavailable', 'The image proxy is not configured');
  const source = c.req.query('u');
  const signature = c.req.query('s');
  if (!source || !signature || !(await verifyImageSignature(secret, source, signature)))
    return failure(c, 403, 'invalid_image_signature', 'A valid image signature is required');

  // Headers go through c.header so they replace the API-wide `no-store` default.
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(c.req.url, { method: 'GET' });
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
    return failure(
      c,
      error.status,
      error.code,
      'The image could not be retrieved',
      'public, max-age=60'
    );
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
