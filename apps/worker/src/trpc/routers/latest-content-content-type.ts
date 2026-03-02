import { ContentType } from '@zine/shared';

/**
 * Maps creator latest-content providers to canonical content types when
 * materializing user items from creator-page taps.
 */
export function getLatestContentItemContentType(provider: string): ContentType | null {
  switch (provider) {
    case 'YOUTUBE':
      return ContentType.VIDEO;
    case 'SPOTIFY':
      return ContentType.PODCAST;
    case 'RSS':
    case 'WEB':
    case 'SUBSTACK':
      return ContentType.ARTICLE;
    case 'X':
      return ContentType.POST;
    default:
      return null;
  }
}
