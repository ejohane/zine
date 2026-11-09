import { ApiError } from './lib';
import { publicUrl } from './identity';

export class ProviderError extends Error {
  constructor(
    public code: string,
    public retryable: boolean,
    public retryAfterSeconds = 60
  ) {
    super(code);
  }
}
function publicAddress(value: string): boolean {
  if (value.includes(':')) {
    const ip = value.toLowerCase();
    // Only global-unicast IPv6. IPv4-mapped, link-local, multicast, documentation
    // and unique-local ranges are deliberately excluded.
    return /^[23][0-9a-f]{0,3}:/.test(ip) && !ip.startsWith('2001:db8:');
  }
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function validateDns(host: string) {
  const answers = await Promise.all(
    ['A', 'AAAA'].map(async (type) => {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10000) }
      );
      if (!response.ok) throw new ProviderError('dns_unavailable', true);
      const data = await response.json<{
        Status: number;
        Answer?: { type: number; data: string }[];
      }>();
      return data.Answer?.filter((a) => a.type === 1 || a.type === 28).map((a) => a.data) ?? [];
    })
  );
  const addresses = answers.flat();
  if (!addresses.length) throw new ProviderError('source_dns_not_found', false);
  if (addresses.some((address) => !publicAddress(address)))
    throw new ApiError(422, 'unsafe_url', 'Source resolves to a non-public address');
}

/** User-controlled fetches never forward bearer tokens/cookies; each redirect is revalidated. */
export async function fetchPublic(
  input: string,
  options: {
    maxBytes?: number;
    accept?: string;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST' | 'HEAD';
    body?: string;
  } = {}
) {
  let url = publicUrl(input);
  const redirectChain: { url: string; status: number; location: string }[] = [];
  for (let redirects = 0; redirects <= 5; redirects++) {
    await validateDns(url.hostname);
    const response = await fetch(url.toString(), {
      redirect: 'manual',
      method: options.method ?? 'GET',
      body: options.body,
      headers: {
        'user-agent': 'Zine/1.0 (+https://myzine.app)',
        accept:
          options.accept ??
          'text/html,application/xhtml+xml,application/xml,application/json;q=0.9',
        ...options.headers,
      },
      signal: AbortSignal.timeout(20000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      if (options.method === 'POST') throw new ProviderError('unexpected_post_redirect', false);
      const location = response.headers.get('location');
      if (!location) throw new ProviderError('invalid_redirect', false);
      redirectChain.push({
        url: url.toString(),
        status: response.status,
        location: new URL(location, url).toString(),
      });
      url = publicUrl(new URL(location, url).toString());
      continue;
    }
    if (response.status === 304)
      return {
        url: url.toString(),
        status: 304,
        headers: response.headers,
        text: '',
        redirectChain,
      };
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderError(
        response.status === 429
          ? 'rate_limited'
          : response.status === 401 || response.status === 403
            ? 'source_access_restricted'
            : response.status === 404 || response.status === 410
              ? 'source_not_found'
              : `source_http_${response.status}`,
        response.status === 429 || response.status >= 500,
        Math.min(3600, Math.max(10, Number(response.headers.get('retry-after')) || 60))
      );
    }
    if (options.method === 'HEAD')
      return {
        url: url.toString(),
        status: response.status,
        headers: response.headers,
        text: '',
        redirectChain,
      };
    const max = options.maxBytes ?? 4 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > max) {
      await response.body?.cancel();
      throw new ProviderError('source_too_large', false);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ProviderError('source_empty', false);
    let bytes = 0;
    let text = '';
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw new ProviderError('source_too_large', false);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return {
      url: url.toString(),
      status: response.status,
      headers: response.headers,
      text,
      redirectChain,
    };
  }
  throw new ProviderError('too_many_redirects', false);
}

/** Credentials are sent only to fixed provider endpoints, never caller-controlled URLs. */
export async function providerJson<T>(url: URL, authorization?: string, init: RequestInit = {}) {
  const allowed = [
    'www.googleapis.com',
    'oauth2.googleapis.com',
    'youtube.googleapis.com',
    'api.spotify.com',
    'accounts.spotify.com',
    'api.x.com',
  ];
  if (url.protocol !== 'https:' || !allowed.includes(url.hostname) || url.username || url.password)
    throw new Error('Invalid provider endpoint');
  const response = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: {
      ...Object.fromEntries(new Headers(init.headers)),
      ...(authorization ? { authorization } : {}),
      accept: 'application/json',
      'user-agent': 'ZineApi/0.1 (+https://myzine.app)',
    },
    signal: AbortSignal.timeout(20000),
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    await response.body?.cancel();
    throw new ProviderError('provider_redirect_rejected', false);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(
      response.status === 429
        ? 'rate_limited'
        : response.status === 401
          ? 'provider_credentials_expired'
          : response.status === 403
            ? 'provider_access_denied'
            : response.status === 404
              ? 'source_not_found'
              : `provider_http_${response.status}`,
      response.status === 429 || response.status >= 500,
      Math.min(3600, Math.max(10, Number(response.headers.get('retry-after')) || 60))
    );
  }
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw new ProviderError('provider_response_too_large', false);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError('provider_invalid_json', true);
  }
}
