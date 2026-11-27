import type { CardItem } from '@zine/next-ui';
import { toCardItem } from './bentoSections';
import type { Home, RemoteItem } from './live-api';
import type { Section } from './model';

/** One block of Home: a big card and the short list beside it. */
export interface Spread {
  hero: CardItem;
  rows: CardItem[];
}

const cards = (items: Parameters<typeof toCardItem>[0][]) =>
  items.map(toCardItem).filter((item): item is CardItem => item !== null);

const isOpen = (item: RemoteItem) =>
  item.status === 'saved' && !item.archived && !item.progress.completedAt;

/**
 * What Home shows, in order. Under "All", up to four things you have started lead (those with a
 * picture first), then the open saves of the loaded library as the API ordered them. A format
 * filter shows only the library, which the API has already narrowed.
 */
export function spotlightItems(
  home: Home | undefined,
  library: RemoteItem[],
  section: Section
): CardItem[] {
  const open = cards(library.filter(isOpen));
  if (section !== 'Home') return open;
  const resume = cards(home?.sections.find((s) => s.kind === 'resume')?.cards ?? []).slice(0, 4);
  const opening = [...resume.filter((item) => item.picture), ...resume.filter((i) => !i.picture)];
  const used = new Set(opening.map((item) => item.id));
  return [...opening, ...open.filter((item) => !used.has(item.id))];
}

/** Inbox items as cards for the sideways rail. */
export const inboxCards = (items: RemoteItem[]) =>
  cards(items.filter((item) => item.status === 'received' && !item.archived));

/**
 * Groups of `size`, in order (four by default: a big card and three rows). The first item with
 * a picture in each group is its big card; the rest are its rows. A last, shorter group still
 * gets a big card.
 */
export function toSpreads(items: readonly CardItem[], size = 4): Spread[] {
  const spreads: Spread[] = [];
  for (let start = 0; start < items.length; start += size) {
    const group = items.slice(start, start + size);
    const hero = group.find((item) => item.picture) ?? group[0]!;
    spreads.push({ hero, rows: group.filter((item) => item !== hero) });
  }
  return spreads;
}

/**
 * An upright tablet (an iPad mini and its like): wider than a phone, taller than it is wide.
 * Home puts the rows two-up under the big card there, so a block takes five.
 */
export const uprightTablet =
  '(orientation: portrait) and (min-width: 600px) and (max-width: 900px)';

/** The number beside each filter, when Home has told us. Posts include threads. */
export function sectionCount(counts: Home['counts'], section: Section): number | undefined {
  if (!counts) return undefined;
  const by = counts.savedByType;
  if (section === 'Home') return counts.saved;
  if (section === 'Articles') return by.article ?? 0;
  if (section === 'Videos') return by.video ?? 0;
  if (section === 'Podcasts') return by.podcast_episode ?? 0;
  return (by.post ?? 0) + (by.thread ?? 0);
}
