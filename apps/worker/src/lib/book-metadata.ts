/** Publisher book metadata. Keep recognition narrow until each provider is verified. */
export interface BookMetadata {
  title: string;
  author: string;
  coverUrl: string | null;
  description: string | null;
  publisher: string | null;
  isbn: string | null;
}

export function isSupportedBookPage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['penguinrandomhouse.com', 'www.penguinrandomhouse.com'].includes(url.hostname) &&
      /^\/books\/\d+\/[^/]+(?:\/\d{13})?\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function names(value: unknown): string | null {
  if (Array.isArray(value)) return value.map(names).filter(Boolean).join(', ') || null;
  if (value && typeof value === 'object') return text((value as Record<string, unknown>).name);
  return text(value);
}

function image(value: unknown, base: string): string | null {
  if (Array.isArray(value)) return image(value[0], base);
  const raw =
    value && typeof value === 'object' ? text((value as Record<string, unknown>).url) : text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Handles direct Book, WebPage.mainEntity, arrays and @graph, without choosing another edition. */
export function extractBookMetadata(chunks: string[], base: string): BookMetadata | null {
  function visit(value: unknown): BookMetadata | null {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = visit(entry);
        if (found) return found;
      }
      return null;
    }
    if (!value || typeof value !== 'object') return null;
    const node = value as Record<string, unknown>;
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.some((type) => typeof type === 'string' && /(?:^|[/#])Book$/.test(type))) {
      const title = text(node.name);
      const author = names(node.author);
      if (title && author) {
        return {
          title,
          author,
          coverUrl: image(node.image, base),
          description: text(node.description) ?? text(node.about),
          publisher: names(node.publisher),
          isbn: text(node.isbn) ?? (typeof node.isbn === 'number' ? String(node.isbn) : null),
        };
      }
    }
    return visit(node.mainEntity) ?? visit(node['@graph']);
  }
  for (const chunk of chunks) {
    try {
      const found = visit(JSON.parse(chunk));
      if (found) return found;
    } catch {
      // One malformed JSON-LD block must not prevent ordinary link saving.
    }
  }
  return null;
}
