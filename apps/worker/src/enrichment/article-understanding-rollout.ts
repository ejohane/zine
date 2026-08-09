import type { EnrichmentTrigger } from './types';

export type ArticleUnderstandingMode = 'off' | 'backfill_only' | 'all';

export function parseArticleUnderstandingMode(value: string | undefined): ArticleUnderstandingMode {
  switch (value?.trim().toLowerCase()) {
    case 'all':
      return 'all';
    case 'backfill_only':
      return 'backfill_only';
    default:
      return 'off';
  }
}

export function shouldUseArticleUnderstanding(
  configuredMode: string | undefined,
  trigger: EnrichmentTrigger
): boolean {
  const mode = parseArticleUnderstandingMode(configuredMode);
  return mode === 'all' || (mode === 'backfill_only' && trigger === 'backfill');
}
