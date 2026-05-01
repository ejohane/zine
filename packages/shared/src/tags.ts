export function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeTagKey(value: string): string {
  return normalizeTagName(value).toLowerCase();
}

export function sanitizeTagNames(tags: string[], maxTags = 20): string[] {
  const deduped = new Map<string, string>();

  for (const tag of tags) {
    const normalizedName = normalizeTagName(tag);
    if (!normalizedName) continue;

    const normalizedKey = normalizeTagKey(normalizedName);
    if (!deduped.has(normalizedKey)) {
      deduped.set(normalizedKey, normalizedName);
    }
  }

  return Array.from(deduped.values()).slice(0, maxTags);
}
