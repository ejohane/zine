import type { CardItem, ItemKind } from '@zine/next-ui';
import type { HomeCard } from './live-api';

const https = (value?: string) => (value?.startsWith('https://') ? value : undefined);

function kindOf(type: string): ItemKind | null {
  if (type === 'video') return 'video';
  if (type === 'podcast_episode') return 'podcast';
  if (type === 'post' || type === 'thread') return 'post';
  if (type === 'article' || type === 'book' || type === 'unknown') return 'article';
  return null;
}

const handleOf = (url: string) =>
  /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\//.exec(url)?.[1];

function fraction({ position, unit, completedAt }: HomeCard['progress'], seconds?: number) {
  if (completedAt || position === null || position <= 0) return undefined;
  // Reading progress arrives as a fraction labelled "seconds"; with no length to divide by, a
  // position under one can only be that fraction.
  const value =
    unit === 'fraction'
      ? position
      : unit === 'seconds' && seconds
        ? position / seconds
        : unit === 'seconds' && position < 1
          ? position
          : undefined;
  return value === undefined ? undefined : Math.min(1, Math.max(0, value));
}

/**
 * A Home card or library item as a card item. The API does not say how big a picture is, so
 * every picture starts with the usual shape for its kind (square for podcasts, 16:9 otherwise);
 * the page corrects post pictures once they load. Unsupported types return null.
 */
export function toCardItem({ id, savedAt, progress, content }: HomeCard): CardItem | null {
  const kind = kindOf(content.type);
  if (!kind) return null;
  let host: string;
  try {
    host = new URL(content.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  const name =
    (typeof content.creator === 'string' ? content.creator : content.creator?.name)?.trim() || host;
  const handle = kind === 'post' ? handleOf(content.url) : undefined;
  const title = content.title?.trim();
  const thumbnail = https(content.thumbnail);
  const seconds = content.durationSeconds || undefined;
  const minutes = kind === 'article' ? content.readMinutes : seconds ? seconds / 60 : undefined;
  const summary = content.summary?.trim() || content.description?.trim() || undefined;
  return {
    id,
    kind,
    url: content.url,
    // A post's title is only its first words again, so the card shows the words themselves.
    title: kind === 'post' ? undefined : title || host,
    creator: {
      name,
      handle: handle ? '@' + handle : undefined,
      avatarUrl: https(content.creatorImageUrl),
    },
    description: kind === 'post' ? undefined : summary,
    body: kind === 'post' ? content.preview || title || summary : content.preview,
    picture: thumbnail
      ? { url: thumbnail, width: 16, height: kind === 'podcast' ? 16 : 9 }
      : undefined,
    durationMinutes: minutes,
    savedAt: savedAt ?? undefined,
    progress: fraction(progress, seconds),
  };
}
