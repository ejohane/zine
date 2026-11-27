import type { CardItem, ItemKind } from '@zine/next-ui';
import { toCardItem } from '../src/bentoSections';
import type { HomeCard } from '../src/live-api';

/** What `fetch-data.py` writes: real items from the local API, with their pictures embedded. */
interface RawItem extends HomeCard {
  status: string;
  createdAt?: string;
  tags?: string[];
}
interface RawData {
  fetchedAt: string;
  home: { sections: { id: string; cards: RawItem[] }[] };
  saved: RawItem[];
  posts: RawItem[];
  articles: RawItem[];
  inbox: RawItem[];
  faves: RawItem[];
  images: Record<string, { src: string; width: number; height: number }>;
  counts: {
    saved: Record<string, number>;
    inbox: Record<string, number>;
    sources: number;
    started: number;
    month: number;
    collections: Record<string, number>;
  };
}

/** A card item plus the few things the app chrome around the cards needs. */
export interface LabItem extends CardItem {
  /** When it was saved, or when it arrived for inbox items. */
  at: string;
  summary?: string;
  topics: string[];
  inbox: boolean;
  /** Minutes still to go: the whole length, less what is done. */
  minutesLeft?: number;
}

export interface Lab {
  now: Date;
  resume: LabItem[];
  recent: LabItem[];
  saved: LabItem[];
  inbox: LabItem[];
  faves: LabItem[];
  counts: {
    saved: number;
    inbox: number;
    sources: number;
    started: number;
    /** Saved so far this calendar month. */
    month: number;
    savedBy: Record<ItemKind, number>;
    collections: Record<string, number>;
  };
}

const total = (record: Record<string, number>) =>
  Object.values(record).reduce((sum, value) => sum + value, 0);

function toLabItem(raw: RawItem, images: RawData['images']): LabItem | null {
  const progress = { ...raw.progress };
  // Article progress arrives as a fraction labelled "seconds"; read it as the fraction it is.
  if (
    progress.unit === 'seconds' &&
    !raw.content.durationSeconds &&
    (progress.position ?? 0) > 0 &&
    (progress.position ?? 0) < 1
  )
    progress.unit = 'fraction';
  const card = toCardItem({ ...raw, progress });
  if (!card) return null;
  const picture = raw.content.thumbnail ? images[raw.content.thumbnail] : undefined;
  const avatar = raw.content.creatorImageUrl ? images[raw.content.creatorImageUrl] : undefined;
  const linkOnly = (text?: string) => !text || /^https?:\/\/\S+$/.test(text.trim());
  const item: LabItem = {
    ...card,
    creator: { ...card.creator, avatarUrl: avatar?.src },
    picture: picture
      ? card.kind === 'post'
        ? { url: picture.src, width: picture.width, height: picture.height }
        : { ...card.picture!, url: picture.src }
      : undefined,
    at: raw.savedAt ?? raw.createdAt ?? '',
    summary: raw.content.summary?.trim() || undefined,
    topics: (raw.content.topics ?? []).slice(0, 5),
    inbox: raw.status === 'received',
  };
  if (item.kind === 'post' && linkOnly(item.body))
    item.body = raw.content.title?.trim() || raw.content.summary?.trim() || item.body;
  if (item.durationMinutes)
    item.minutesLeft = Math.max(1, Math.round(item.durationMinutes * (1 - (item.progress ?? 0))));
  return item;
}

export async function loadLab(): Promise<Lab> {
  const raw = (await (await fetch('data.json')).json()) as RawData;
  const map = (items: RawItem[]) =>
    items.map((item) => toLabItem(item, raw.images)).filter((item): item is LabItem => !!item);
  const unique = (items: LabItem[]) => [...new Map(items.map((item) => [item.id, item])).values()];
  const section = (id: string) => map(raw.home.sections.find((s) => s.id === id)?.cards ?? []);
  const recent = section('recent');
  const saved = unique([
    ...recent,
    ...map(raw.saved),
    ...map(raw.posts),
    ...map(raw.articles),
  ]).sort((a, b) => b.at.localeCompare(a.at));
  const started = (item: LabItem) => (item.progress ?? 0) > 0 && (item.progress ?? 0) < 1;
  const resume = unique([...section('resume'), ...saved.filter(started)]);
  const by = raw.counts.saved;
  return {
    now: new Date(raw.fetchedAt),
    resume,
    recent,
    saved,
    inbox: map(raw.inbox),
    faves: map(raw.faves),
    counts: {
      saved: total(by),
      inbox: total(raw.counts.inbox),
      sources: raw.counts.sources,
      started: raw.counts.started,
      month: raw.counts.month,
      savedBy: {
        video: by.video ?? 0,
        article: by.article ?? 0,
        podcast: by.podcast_episode ?? 0,
        post: by.post ?? 0,
      },
      collections: raw.counts.collections,
    },
  };
}

export const count = (value: number) => value.toLocaleString('en-US');

const DAY = 86_400_000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** "Today", "Yesterday", "Tuesday" within the week, otherwise "Nov 12". */
export function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Items in their existing order, grouped under consecutive day labels. */
export function byDay(items: LabItem[], now: Date) {
  const groups: { label: string; date: Date; items: LabItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.at, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, date: new Date(item.at), items: [item] });
  }
  return groups;
}

/** Items grouped by creator, biggest groups first. */
export function byCreator(items: LabItem[]) {
  const groups = new Map<string, LabItem[]>();
  for (const item of items)
    groups.set(item.creator.name, [...(groups.get(item.creator.name) ?? []), item]);
  return [...groups.entries()]
    .map(([name, list]) => ({
      name,
      avatarUrl: list.find((i) => i.creator.avatarUrl)?.creator.avatarUrl,
      items: list,
    }))
    .sort((a, b) => b.items.length - a.items.length);
}
