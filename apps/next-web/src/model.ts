import nativeData from './data/DevSamples.json';
import apiData from './data/APIPreview.json';

export const sections = ['Home', 'Podcasts', 'Articles', 'Videos', 'Posts'] as const;
export type Section = (typeof sections)[number];
export type Scope = 'saved' | 'received' | 'archived' | 'dismissed';
export type SearchMode = 'keyword' | 'semantic' | 'hybrid';
export type ContextEntry = { id: string; text: string; origin: string; contributor?: string };
export type APIItem = {
  id: string;
  status: 'saved' | 'received' | 'dismissed';
  archived: boolean;
  content: {
    id: string;
    url: string;
    platform: string;
    type: string;
    title?: string;
    description?: string;
    summary?: string;
    topics?: string[];
    durationSeconds?: number;
  };
  context: ContextEntry[];
  tags: string[];
  collectionIds: string[];
  progress: { position: number | null; unit: string | null; completedAt: string | null };
  enrichment: {
    fields: Record<
      string,
      {
        contributionId: string;
        category: string;
        provenance: { coverage?: string; description?: string };
      }
    >;
    components: { component: string; status: string; reasonCode: string | null }[];
  };
};
export type Item = {
  id: string;
  section: Exclude<Section, 'Home'>;
  title: string;
  author: string;
  note: string;
  duration: string;
  image?: string;
  creatorImage?: string;
  url: string;
  isSample: boolean;
  api: APIItem;
};
export type Placement = {
  index: number;
  column: number;
  row: number;
  columns: number;
  rows: number;
};
export const fixtures = apiData;
export const headlines: Record<Section, string> = {
  Home: 'Follow your curiosity',
  Podcasts: 'Let a conversation unfold',
  Articles: 'Stay with a good story',
  Videos: 'See something differently',
  Posts: 'A thought worth keeping',
};
export const storageKey = 'zine-next-web-library-v1';
export const initialItems = (): Item[] =>
  nativeData.map((sample) => ({
    ...sample,
    id: sample.id.toUpperCase(),
    section: sample.section as Item['section'],
    image: 'image' in sample ? sample.image : undefined,
    api: structuredClone(
      apiData.itemList.items.find((i) => i.content.url === sample.url)
    ) as APIItem,
  }));
export function inScope(item: Item, scope: Scope) {
  if (scope === 'archived') return item.api.status === 'saved' && item.api.archived;
  return item.api.status === scope;
}
export function visibleItems(items: Item[], section: Section, scope: Scope, collection?: string) {
  const result = items.filter(
    (item) =>
      inScope(item, scope) &&
      (section === 'Home' || item.section === section) &&
      (!collection || item.api.collectionIds.includes(collection))
  );
  if (collection) {
    const ordered =
      fixtures.orderedCollections[collection as keyof typeof fixtures.orderedCollections]?.items ??
      [];
    const order = new Map(ordered.map((i) => [i.item.id, i.position]));
    result.sort((a, b) => (order.get(a.api.id) ?? Infinity) - (order.get(b.api.id) ?? Infinity));
  }
  return result;
}
export function plan(items: Item[]): Placement[] {
  const occupied = new Set<number>();
  const placements = items.map((item, index) => {
    const columns = item.section === 'Videos' ? 2 : 1;
    const rows = item.section === 'Articles' ? 3 : item.section === 'Posts' ? 1 : 2;
    for (let row = 0; ; row++) {
      for (let column = 0; column <= 3 - columns; column++) {
        const cells = Array.from({ length: rows }, (_, r) =>
          Array.from({ length: columns }, (_, c) => (row + r) * 3 + column + c)
        ).flat();
        if (cells.every((c) => !occupied.has(c))) {
          cells.forEach((c) => occupied.add(c));
          return { index, row, column, columns, rows };
        }
      }
    }
  });
  return placements.sort((a, b) => a.row - b.row || a.column - b.column);
}
export type HomePresentation = 'feature' | 'compact' | 'tile' | 'tall' | 'banner';

type HomeGroup = { title?: string; presentation: HomePresentation; count: number };
type HomeRecipe = { layout: string; groups: HomeGroup[] };
const homeRecipes: HomeRecipe[] = [
  {
    layout: 'lead',
    groups: [
      { title: 'Settle in', presentation: 'feature', count: 1 },
      { title: 'A quick look', presentation: 'compact', count: 3 },
    ],
  },
  {
    layout: 'gallery',
    groups: [
      { title: 'Worth exploring', presentation: 'tile', count: 2 },
      { title: 'Next up', presentation: 'tall', count: 1 },
    ],
  },
  { layout: 'banner', groups: [{ title: 'Worth your time', presentation: 'banner', count: 1 }] },
  {
    layout: 'digest',
    groups: [
      { title: 'The shortlist', presentation: 'compact', count: 3 },
      { title: 'Take a closer look', presentation: 'feature', count: 1 },
    ],
  },
];

export function composeHome(cards: Item[], pageSize: number) {
  const rows = [];
  // Compose each page independently so loading more never changes a rendered row.
  for (let start = 0; start < cards.length; start += pageSize) {
    const end = Math.min(start + pageSize, cards.length);
    let offset = start;
    for (let row = 0; offset < end; row++) {
      const recipe = homeRecipes[row % homeRecipes.length];
      const remaining = end - offset;
      const fits = recipe.groups.reduce((count, group) => count + group.count, 0) <= remaining;
      const groups: HomeGroup[] = fits
        ? recipe.groups
        : [
            {
              presentation: remaining === 1 ? 'banner' : 'tile',
              count: remaining,
            },
          ];
      rows.push({
        layout: fits ? recipe.layout : 'remainder',
        groups: groups.map(({ title, presentation, count }) => {
          const items = cards.slice(offset, offset + count);
          offset += count;
          return {
            title: start === 0 && row < homeRecipes.length ? title : undefined,
            presentation,
            items,
          };
        }),
      });
    }
  }
  return rows;
}
export function progress(item: Item): number | null {
  const { position, unit } = item.api.progress;
  if (position === null) return null;
  const fraction =
    unit === 'fraction'
      ? position
      : unit === 'seconds' && item.api.content.durationSeconds
        ? position / item.api.content.durationSeconds
        : null;
  return fraction === null ? null : Math.min(1, Math.max(0, fraction));
}
export const timestamp = (value: number) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
export function resumeLabel(item: Item) {
  return item.api.progress.unit === 'seconds'
    ? `Resume at ${timestamp(item.api.progress.position ?? 0)}`
    : `${Math.round((progress(item) ?? 0) * 100)}% read`;
}
export const isComplete = (item: Item) => item.api.progress.completedAt !== null;
export function updateItem(items: Item[], id: string, mutation: (item: Item) => void) {
  return items.map((item) => {
    if (item.id !== id) return item;
    const next = structuredClone(item);
    mutation(next);
    return next;
  });
}
export function setProgress(item: Item, fraction: number) {
  const clamped = Math.max(0, Math.min(1, fraction));
  if (item.api.progress.unit === 'seconds' && item.api.content.durationSeconds)
    item.api.progress.position = clamped * item.api.content.durationSeconds;
  else {
    item.api.progress.unit = 'fraction';
    item.api.progress.position = clamped;
  }
}
export function safeURL(text: string) {
  const url = new URL(text.trim());
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.href.length > 8192)
    throw new Error('Enter a complete http or https link.');
  return url;
}
export function capture(
  items: Item[],
  input: {
    url: string;
    title: string;
    section: Item['section'];
    context: string;
    tags: string[];
    collection: string;
  }
) {
  let url: URL;
  try {
    url = safeURL(input.url);
  } catch {
    throw new Error('Enter a complete http or https link.');
  }
  const context = input.context.trim();
  if (context.length > 20000) throw new Error('Keep your note under 20,000 characters.');
  const existing = items.find((i) => safeURL(i.url).href === url.href);
  const id = existing?.id ?? crypto.randomUUID();
  const next = existing
    ? items
    : [
        {
          id,
          section: input.section,
          title: input.title.trim() || url.hostname,
          author: url.hostname,
          note: '',
          duration: 'Saved just now',
          url: url.href,
          isSample: false,
          api: {
            id,
            status: 'saved',
            archived: false,
            content: {
              id,
              url: url.href,
              platform: 'web',
              type:
                input.section === 'Podcasts'
                  ? 'podcast_episode'
                  : input.section === 'Videos'
                    ? 'video'
                    : input.section === 'Posts'
                      ? 'post'
                      : 'article',
            },
            context: [],
            tags: [],
            collectionIds: [],
            progress: { position: null, unit: null, completedAt: null },
            enrichment: {
              fields: {},
              components: [{ component: 'metadata', status: 'pending', reasonCode: null }],
            },
          },
        } as Item,
        ...items,
      ];
  return {
    id,
    items: updateItem(next, id, (item) => {
      item.api.status = 'saved';
      item.api.archived = false;
      if (context)
        item.api.context.push({
          id: crypto.randomUUID(),
          text: context,
          origin: 'explicit',
          contributor: 'you',
        });
      item.api.tags = [
        ...new Set([...item.api.tags, ...input.tags.map((t) => t.trim()).filter(Boolean)]),
      ];
      if (input.collection && !item.api.collectionIds.includes(input.collection))
        item.api.collectionIds.push(input.collection);
    }),
  };
}
export function search(items: Item[], query: string, mode: SearchMode) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const scripted = fixtures.searches.find((s) => s.query.toLowerCase() === normalized);
  return items
    .filter((i) => inScope(i, 'saved'))
    .flatMap((item) => {
      const evidence: { field: string; excerpt: string; matchedBy: string[] }[] = [];
      if (mode !== 'semantic') {
        const fields = [
          ['title', item.title],
          ['creator', item.author],
          ['tags', item.api.tags.join(', ')],
          ...item.api.context.map((c) => ['context', c.text]),
        ];
        evidence.push(
          ...fields
            .filter(([, value]) => value.toLowerCase().includes(normalized))
            .map(([field, excerpt]) => ({ field, excerpt, matchedBy: ['keyword'] }))
        );
      }
      if (mode !== 'keyword')
        evidence.push(
          ...(scripted?.response.items.find((i) => i.id === item.api.id)?.matches ?? [])
        );
      return evidence.length ? [{ item, evidence }] : [];
    });
}
export function loadLibrary(storage: Pick<Storage, 'getItem'>): {
  items: Item[];
  blocked: boolean;
  error: string | null;
} {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return { items: initialItems(), blocked: false, error: null };
    const stored = JSON.parse(raw);
    if (stored.version !== 1 || !Array.isArray(stored.items)) throw Error('Invalid format');
    const ids = new Set<string>();
    for (const item of stored.items) {
      if (
        typeof item.id !== 'string' ||
        ids.has(item.id) ||
        typeof item.title !== 'string' ||
        !sections.includes(item.section) ||
        item.section === 'Home' ||
        !['saved', 'received', 'dismissed'].includes(item.api?.status) ||
        !Array.isArray(item.api?.context) ||
        !Array.isArray(item.api?.tags) ||
        !Array.isArray(item.api?.collectionIds) ||
        !item.api?.progress ||
        !Array.isArray(item.api?.enrichment?.components)
      )
        throw Error('Invalid item');
      safeURL(item.url);
      ids.add(item.id);
    }
    const samples = initialItems();
    const saved = stored.items as Item[];
    const refreshed = samples.map((sample) => {
      const previous = saved.find((i) => i.id === sample.id);
      return previous ? { ...sample, api: previous.api } : sample;
    });
    return {
      items: [...saved.filter((i) => !i.isSample), ...refreshed],
      blocked: false,
      error: null,
    };
  } catch {
    return {
      items: initialItems(),
      blocked: true,
      error:
        'Your local collection could not be read. The stored data is preserved; this session is showing sample content.',
    };
  }
}
export function persist(storage: Pick<Storage, 'setItem'>, items: Item[]) {
  storage.setItem(storageKey, JSON.stringify({ version: 1, items }));
}
