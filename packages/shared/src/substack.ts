const TRACKING_PARAM_PREFIXES = ['utm_', 'mc_'];
const TRACKING_PARAM_NAMES = new Set(['ref', 'ref_src', 'ref_url', 's', 'source']);

function parseHttpUrl(rawUrl: string | null | undefined): URL | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function stripTrackingParams(url: URL): string {
  const cleanUrl = new URL(url.toString());

  for (const key of Array.from(cleanUrl.searchParams.keys())) {
    const normalizedKey = key.trim().toLowerCase();
    if (
      TRACKING_PARAM_NAMES.has(normalizedKey) ||
      TRACKING_PARAM_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix))
    ) {
      cleanUrl.searchParams.delete(key);
    }
  }

  cleanUrl.hash = '';
  return cleanUrl.toString();
}

function normalizeHost(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

function directUrlFromOpenSubstack(url: URL): URL | null {
  const hostname = normalizeHost(url.hostname);
  if (hostname !== 'open.substack.com') {
    return null;
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);
  if (pathSegments.length < 4 || pathSegments[0] !== 'pub' || pathSegments[2] !== 'p') {
    return null;
  }

  const publication = pathSegments[1]?.trim().toLowerCase();
  const slug = pathSegments[3];
  if (!publication || !slug) {
    return null;
  }

  return new URL(`https://${publication}.substack.com/p/${slug}`);
}

export function normalizeSubstackArticleUrl(rawUrl: string | null | undefined): string | null {
  const parsedUrl = parseHttpUrl(rawUrl);
  if (!parsedUrl) {
    return null;
  }

  const url = directUrlFromOpenSubstack(parsedUrl) ?? parsedUrl;
  const hostname = normalizeHost(url.hostname);
  if (!hostname.endsWith('.substack.com')) {
    return null;
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);
  if (pathSegments.length < 2 || pathSegments[0] !== 'p' || !pathSegments[1]) {
    return null;
  }

  return stripTrackingParams(url);
}

export function isSubstackArticleUrl(rawUrl: string | null | undefined): boolean {
  return normalizeSubstackArticleUrl(rawUrl) !== null;
}

export function getSubstackArticleProviderId(rawUrl: string | null | undefined): string | null {
  const canonicalUrl = normalizeSubstackArticleUrl(rawUrl);
  if (!canonicalUrl) {
    return null;
  }

  const url = new URL(canonicalUrl);
  const publication = normalizeHost(url.hostname).replace(/\.substack\.com$/, '');
  const slug = url.pathname.split('/').filter(Boolean)[1];
  if (!publication || !slug) {
    return null;
  }

  return `${publication}/${slug}`;
}

function valueContainsSubstackDomain(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && /(^|[<@\s./-])substack\.com([>\s/:-]|$)/i.test(normalized));
}

function hasSubstackHost(rawUrl: string | null | undefined): boolean {
  const parsedUrl = parseHttpUrl(rawUrl);
  if (!parsedUrl) {
    return false;
  }

  const hostname = normalizeHost(parsedUrl.hostname);
  return hostname === 'substack.com' || hostname.endsWith('.substack.com');
}

export function hasSubstackNewsletterIdentity(identity: {
  canonicalUrl?: string | null;
  listId?: string | null;
  fromAddress?: string | null;
  unsubscribeUrl?: string | null;
}): boolean {
  return (
    isSubstackArticleUrl(identity.canonicalUrl) ||
    valueContainsSubstackDomain(identity.listId) ||
    valueContainsSubstackDomain(identity.fromAddress) ||
    hasSubstackHost(identity.unsubscribeUrl)
  );
}
