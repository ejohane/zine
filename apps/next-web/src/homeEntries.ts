import type { Home, HomeCard, RemoteItem } from './live-api';
import type { HomeEntry, HomeKind, HomeSource } from './homeLayout';

type Card = Pick<HomeCard, 'id' | 'progress'> & { content: HomeCard['content'] };

const https = (value?: string) => (value?.startsWith('https://') ? value : undefined);

function kindOf(type: string): HomeKind | null {
  if (type === 'video') return 'video';
  if (type === 'podcast_episode') return 'podcast';
  if (type === 'post' || type === 'thread') return 'post';
  if (type === 'article' || type === 'book' || type === 'unknown') return 'article';
  return null;
}

function fraction({ position, unit, completedAt }: Card['progress'], seconds?: number) {
  if (completedAt || position === null || position <= 0) return undefined;
  const value =
    unit === 'fraction' ? position : unit === 'seconds' && seconds ? position / seconds : undefined;
  return value === undefined ? undefined : Math.min(1, Math.max(0, value));
}

const handleOf = (url: string) =>
  /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\//.exec(url)?.[1];

/** A Home entry from a Home card or a library item; unsupported types return null. */
export function toEntry({ id, progress, content }: Card): HomeEntry | null {
  const kind = kindOf(content.type);
  if (!kind) return null;
  let host = '';
  try {
    host = new URL(content.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  const creator =
    typeof content.creator === 'string' ? content.creator : content.creator?.name || undefined;
  const seconds = content.durationSeconds || undefined;
  const handle = kind === 'post' ? handleOf(content.url) : undefined;
  const title = content.title?.trim() || host;
  return {
    id,
    kind,
    title,
    url: content.url,
    creator: creator || (kind === 'article' ? host : undefined),
    avatar: https(content.creatorImageUrl),
    thumbnail: https(content.thumbnail),
    seconds,
    progress: fraction(progress, seconds),
    // Posts always have their own words; fall back to the title the API truncated from them.
    preview: content.preview || (kind === 'post' ? title : undefined),
    summary: content.summary || content.description || undefined,
    readMinutes: content.readMinutes,
    handle,
    threadPosts: content.threadPosts,
  };
}

const entries = (cards: Card[]) =>
  cards.flatMap((card) => {
    const entry = toEntry(card);
    return entry ? [entry] : [];
  });

/** Home sections plus the loaded library page; the library fills whatever Home leaves empty. */
export function homeSource(home: Home | undefined, library: RemoteItem[]): HomeSource {
  const sections = home?.sections ?? [];
  const pick = (kind: 'resume' | 'recent') =>
    entries(sections.filter((s) => s.kind === kind).flatMap((s) => s.cards));
  const open = library.filter(
    (item) => item.status === 'saved' && !item.archived && !item.progress.completedAt
  );
  return {
    resume: home
      ? pick('resume')
      : entries(open.filter((item) => (item.progress.position ?? 0) > 0).slice(0, 3)),
    recent: home ? pick('recent') : entries(open.slice(0, 5)),
    collections: sections
      .filter((s) => s.kind === 'collection')
      .map((s) => ({ id: s.id, title: s.title, entries: entries(s.cards) })),
    library: entries(open),
  };
}
