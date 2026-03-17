import { upgradeSpotifyImageUrl, upgradeYouTubeImageUrl } from './content-utils';

export interface ItemCardImageSources {
  thumbnailUrl?: string | null;
  creatorImageUrl?: string | null;
}

export function normalizeItemCardImageUrl(url: string | null | undefined): string | null {
  return upgradeSpotifyImageUrl(upgradeYouTubeImageUrl(url ?? null)) ?? null;
}

export function getItemCardImageCandidates({
  thumbnailUrl,
  creatorImageUrl,
}: ItemCardImageSources): string[] {
  const candidates = [thumbnailUrl ?? null, creatorImageUrl ?? null];

  return candidates.filter(
    (url, index): url is string =>
      typeof url === 'string' && url.length > 0 && candidates.indexOf(url) === index
  );
}
