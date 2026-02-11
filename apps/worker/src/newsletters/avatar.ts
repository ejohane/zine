const EXCLUDED_AVATAR_HOST_PATTERN =
  /(^|\.)mail\.google\.com$|(^|\.)accounts\.google\.com$|(^|\.)googleusercontent\.com$/i;
const OPEN_SUBSTACK_HOST_PATTERN = /(^|\.)open\.substack\.com$/i;
const BARE_SUBSTACK_HOST_PATTERN = /^substack\.com$/i;
const LIST_ID_DOMAIN_PATTERN = /[a-z0-9.-]+\.[a-z]{2,}/g;

type NewsletterAvatarIdentity = {
  canonicalUrl?: string | null;
  listId?: string | null;
  fromAddress?: string | null;
  unsubscribeUrl?: string | null;
  creatorHandle?: string | null;
};

function normalizeHostname(hostname: string | null | undefined): string | null {
  if (!hostname) {
    return null;
  }

  const trimmed = hostname.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^www\./, '');
}

function extractDomainFromEmail(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const raw = value.trim().toLowerCase();
  if (!raw || !raw.includes('@')) {
    return null;
  }

  const domain = raw.split('@').pop();
  return normalizeHostname(domain ?? null);
}

function extractDomainFromListId(listId: string | null | undefined): string | null {
  if (!listId) {
    return null;
  }

  const matches = listId.toLowerCase().match(LIST_ID_DOMAIN_PATTERN);
  if (!matches || matches.length === 0) {
    return null;
  }

  return normalizeHostname(matches[matches.length - 1] ?? null);
}

function extractDomainFromUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (OPEN_SUBSTACK_HOST_PATTERN.test(url.hostname)) {
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length >= 2 && segments[0] === 'pub') {
        const publication = normalizeHostname(segments[1]);
        if (publication) {
          return `${publication}.substack.com`;
        }
      }
    }
    return normalizeHostname(url.hostname);
  } catch {
    return null;
  }
}

function chooseAvatarDomain(identity: NewsletterAvatarIdentity): string | null {
  const unsubscribeDomain = extractDomainFromUrl(identity.unsubscribeUrl);
  const candidates = [
    // Prefer unsubscribe host when it carries publication branding
    // (e.g. registerspill.thorstenball.com), but skip bare substack.com.
    unsubscribeDomain && !BARE_SUBSTACK_HOST_PATTERN.test(unsubscribeDomain)
      ? unsubscribeDomain
      : null,
    extractDomainFromListId(identity.listId),
    extractDomainFromUrl(identity.canonicalUrl),
    extractDomainFromEmail(identity.fromAddress),
    extractDomainFromEmail(identity.creatorHandle),
    unsubscribeDomain,
  ];

  return (
    candidates.find((candidate) => !!candidate && !EXCLUDED_AVATAR_HOST_PATTERN.test(candidate)) ??
    null
  );
}

export function buildNewsletterAvatarUrl(identity: NewsletterAvatarIdentity): string | null {
  const domain = chooseAvatarDomain(identity);
  if (!domain) {
    return null;
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}
