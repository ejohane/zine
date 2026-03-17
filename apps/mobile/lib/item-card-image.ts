import { upgradeSpotifyImageUrl, upgradeYouTubeImageUrl } from './content-utils';

export interface ItemCardImageSources {
  thumbnailUrl?: string | null;
  creatorImageUrl?: string | null;
}

export function normalizeItemCardImageUrl(url: string | null | undefined): string | null {
  const trimmedUrl = url?.trim();

  if (!trimmedUrl) {
    return null;
  }

  return upgradeSpotifyImageUrl(upgradeYouTubeImageUrl(trimmedUrl)) ?? null;
}

export function getItemCardImageCandidates({
  thumbnailUrl,
  creatorImageUrl,
}: ItemCardImageSources): string[] {
  const imageCandidates = new Set<string>();

  for (const url of [thumbnailUrl, creatorImageUrl]) {
    const normalizedUrl = normalizeItemCardImageUrl(url);

    if (normalizedUrl) {
      imageCandidates.add(normalizedUrl);
    }
  }

  return [...imageCandidates];
}
