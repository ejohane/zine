import { API_URL } from './env';

export type ArticleContentResponse = {
  content: string | null;
  articleBody: {
    availability: 'PENDING' | 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';
  };
};

const ALLOWED_ELEMENTS = new Set([
  'a',
  'article',
  'aside',
  'blockquote',
  'br',
  'code',
  'del',
  'div',
  'em',
  'figcaption',
  'figure',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'ul',
]);

function safeUrl(value: string, baseUrl: string, allowMailto = false) {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
    if (allowMailto && url.protocol === 'mailto:') {
      return url.href;
    }
  } catch {
    // Invalid source URLs are removed below.
  }

  return null;
}

export function sanitizeArticleHtml(html: string, baseUrl: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');

  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    const tagName = element.tagName.toLowerCase();

    if (!ALLOWED_ELEMENTS.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    const hrefValue = element instanceof HTMLAnchorElement ? element.getAttribute('href') : null;
    const srcValue = element instanceof HTMLImageElement ? element.getAttribute('src') : null;
    const altValue = element instanceof HTMLImageElement ? element.getAttribute('alt') : null;

    for (const attribute of Array.from(element.attributes)) {
      element.removeAttribute(attribute.name);
    }

    if (element instanceof HTMLAnchorElement) {
      const href = safeUrl(hrefValue ?? '', baseUrl, true);
      if (href) {
        element.href = href;
        element.target = '_blank';
        element.rel = 'noopener noreferrer';
      }
    }

    if (element instanceof HTMLImageElement) {
      const src = safeUrl(srcValue ?? '', baseUrl);
      if (src) {
        element.src = src;
        element.alt = altValue ?? '';
        element.loading = 'lazy';
        element.decoding = 'async';
      } else {
        element.remove();
      }
    }
  }

  return document.body.innerHTML.trim();
}

export async function fetchArticleContent({
  bookmarkId,
  getToken,
  signal,
}: {
  bookmarkId: string;
  getToken: () => Promise<string | null>;
  signal: AbortSignal;
}) {
  const token = await getToken();
  const response = await fetch(
    `${API_URL}/api/v1/bookmarks/${encodeURIComponent(bookmarkId)}/article-content`,
    {
      signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }
  );

  if (!response.ok) {
    throw new Error('Could not load article content');
  }

  return (await response.json()) as ArticleContentResponse;
}
