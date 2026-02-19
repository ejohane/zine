import { createHash } from 'crypto';

const TRACKING_PARAM_PATTERN =
  /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|source$|igshid$)/i;

function stripTrackingParams(url: URL): void {
  const keysToDelete: string[] = [];

  for (const key of url.searchParams.keys()) {
    if (TRACKING_PARAM_PATTERN.test(key)) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    url.searchParams.delete(key);
  }
}

function isIPv4Address(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function isPrivateIPv4(hostname: string): boolean {
  const octets = hostname.split('.').map((octet) => Number.parseInt(octet, 10));
  if (
    octets.length !== 4 ||
    octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [a, b] = octets;

  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function isPrivateIPv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function isUnsafeHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) {
    return true;
  }

  if (isIPv4Address(lower)) {
    return isPrivateIPv4(lower);
  }

  if (lower.includes(':')) {
    return isPrivateIPv6(lower);
  }

  return false;
}

export function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function normalizeUrlCommon(url: URL): URL {
  // Normalize hostname/port/path and strip fragments.
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';

  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = '';
  }

  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }

  stripTrackingParams(url);

  return url;
}

export function normalizeFeedUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid feed URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Feed URL must use http or https');
  }

  if (isUnsafeHost(url.hostname)) {
    throw new Error('Feed URL points to an unsafe or private host');
  }

  return normalizeUrlCommon(url).toString();
}

export function normalizeContentUrl(
  rawUrl: string | null | undefined,
  baseUrl: string
): string | null {
  if (!rawUrl || rawUrl.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(rawUrl.trim(), baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return normalizeUrlCommon(url).toString();
  } catch {
    return null;
  }
}

export function deriveIdentityHash(params: {
  feedUrl: string;
  title: string;
  summary: string;
  publishedAt: number | null;
}): string {
  return hashString(
    `${params.feedUrl}|${params.title}|${params.summary}|${params.publishedAt ?? 'unknown'}`
  ).slice(0, 40);
}
