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
 * Groups of four, in order. The first item with a picture in each group is its big card; the
 * rest are its rows. A last, shorter group still gets a big card.
 */
export function toSpreads(items: readonly CardItem[]): Spread[] {
  const spreads: Spread[] = [];
  for (let start = 0; start < items.length; start += 4) {
    const group = items.slice(start, start + 4);
    const hero = group.find((item) => item.picture) ?? group[0]!;
    spreads.push({ hero, rows: group.filter((item) => item !== hero) });
  }
  return spreads;
}
