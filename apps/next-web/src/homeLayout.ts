// Home layout: picks a card shape for each entry from what its data supports, then packs each
// shelf row by row with no gaps. Pure functions so the layout is testable and deterministic.

export type HomeKind = 'article' | 'video' | 'podcast' | 'post';

export type HomeEntry = {
  id: string;
  kind: HomeKind;
  title: string;
  url: string;
  creator?: string;
  avatar?: string;
  thumbnail?: string;
  /** Media length in seconds. */
  seconds?: number;
  /** Fraction consumed, 0–1, when started. */
  progress?: number;
  /** Opening text: article opening or post text. Paragraphs separated by blank lines. */
  preview?: string;
  summary?: string;
  readMinutes?: number;
  /** X handle without "@", posts only. */
  handle?: string;
  threadPosts?: number;
};

export type Size = 's11' | 's12' | 's13' | 's22' | 's23' | 's33';
export type Variant = {
  size: Size;
  /** Extra presentation flag, e.g. a portrait media poster. */
  flag?: 'poster';
  minW: number;
  maxW?: number;
  /** Allowed height range in px, or follow 16:9 of the width. */
  h?: [number, number];
  aspect?: boolean;
  score: number;
  hero?: boolean;
};
export type Placed = {
  entry: HomeEntry;
  variant: Variant;
  column: number;
  row: number;
  columns: number;
  rows: number;
};
export type Shelf = { id: string; title?: string; placed: Placed[]; rows: number };

export const GAP = 12;
/** Narrowest column every card kind can fill alone (video titles need about 250px). */
export const MIN_COLUMN = 252;
const MAX_COLUMN = 440;
/**
 * Three columns for tablets and laptops, five on large screens, but never so narrow that a single
 * column can't hold a card (or so wide that none fits), so every shelf can always be packed.
 */
export function columnsFor(width: number) {
  const fit = (size: number) => Math.floor((width + GAP) / (size + GAP));
  const cap = width >= 1300 ? Math.max(5, Math.ceil((width + GAP) / (MAX_COLUMN + GAP))) : 3;
  return Math.max(2, Math.min(fit(MIN_COLUMN), cap));
}
export const isPhone = (width: number) => width < 600;
export const isMedia = (entry: HomeEntry) => entry.kind === 'video' || entry.kind === 'podcast';
const textLength = (entry: HomeEntry) => (entry.preview ?? entry.title).length;

/** Card shapes an entry can take, in pixels, so the same rules work at every width. */
export function variants(entry: HomeEntry): Variant[] {
  if (entry.kind === 'article')
    return entry.thumbnail
      ? [
          { size: 's33', minW: 760, h: [430, 640], score: 7, hero: true },
          { size: 's23', minW: 500, maxW: 620, h: [300, 600], score: 7 },
          { size: 's13', minW: 230, maxW: 440, h: [440, 640], score: 8 },
          { size: 's12', minW: 230, maxW: 440, h: [290, 400], score: 6 },
          { size: 's11', minW: 200, maxW: 440, h: [130, 220], score: 3 },
        ]
      : [
          { size: 's13', minW: 230, maxW: 440, h: [290, 640], score: 7 },
          { size: 's22', minW: 500, maxW: 900, h: [290, 440], score: 6 },
          { size: 's11', minW: 200, maxW: 440, h: [130, 220], score: 4 },
        ];
  if (isMedia(entry))
    // Never narrower than 250px: smaller tiles make titles unreadable.
    return [
      { size: 's11', minW: 250, maxW: 480, aspect: true, score: 8 },
      { size: 's22', minW: 480, maxW: 620, aspect: true, score: 6 },
      { size: 's11', flag: 'poster', minW: 250, maxW: 480, h: [290, 400], score: 2 },
    ];
  if (entry.thumbnail)
    return [
      { size: 's13', minW: 230, maxW: 440, h: [440, 640], score: 8 },
      { size: 's12', minW: 230, maxW: 440, h: [290, 400], score: 7 },
    ];
  const n = textLength(entry);
  return [
    { size: 's11', minW: 220, maxW: 440, h: [130, 220], score: n < 160 ? 8 : n < 280 ? 5 : 1 },
    { size: 's12', minW: 230, maxW: 440, h: [290, 400], score: n < 700 ? 8 : 5 },
    { size: 's13', minW: 230, maxW: 440, h: [440, 640], score: n > 450 ? 8 : 3 },
    { size: 's22', minW: 500, maxW: 900, h: [290, 440], score: n > 900 ? 8 : 2 },
  ];
}

type Footprint = { variant: Variant; w: number; h: number; score: number };

function footprints(
  entry: HomeEntry,
  position: number,
  columns: number,
  colW: number,
  rowH: number,
  lead: boolean
): Footprint[] {
  const out: Footprint[] = [];
  for (const variant of variants(entry)) {
    if (variant.hero && !(lead && position === 0)) continue;
    for (let w = 1; w <= columns; w++) {
      const width = w * colW + (w - 1) * GAP;
      if (width < variant.minW || width > (variant.maxW ?? Infinity)) continue;
      if (variant.aspect) {
        const h = Math.max(1, Math.round(((width * 9) / 16 + GAP) / (rowH + GAP)));
        out.push({ variant, w, h, score: 0 });
        continue;
      }
      for (let h = 1; h <= 9; h++) {
        const height = h * rowH + (h - 1) * GAP;
        if (height >= variant.h![0] && height <= variant.h![1])
          out.push({ variant, w, h, score: 0 });
      }
    }
  }
  // Bigger shapes are worth more for the entries that matter most.
  const weight = lead ? (position === 0 ? 2.2 : 0.3) : 0.2;
  return out
    .map((f) => ({ ...f, score: f.variant.score + 10 + weight * f.w * f.h }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Exact packing: fill the shelf row by row, always at the first empty cell, choosing among the
 * next few entries and their shapes. Entries that don't fit are returned in `left`.
 */
export function pack(
  entries: HomeEntry[],
  columns: number,
  colW: number,
  rowH: number,
  lead = false
): { placed: Placed[]; rows: number; left: HomeEntry[] } {
  const fps = entries.map((entry, i) => footprints(entry, i, columns, colW, rowH, lead));
  const maxArea = fps.reduce(
    (sum, f) => sum + (f.length ? Math.max(...f.map((x) => x.w * x.h)) : 0),
    0
  );
  let best: {
    score: number;
    rows: number;
    solution: { k: number; r: number; c: number; f: Footprint }[];
  } | null = null;
  for (let H = 1; H <= 14 && columns * H <= maxArea; H++) {
    const grid = Array.from({ length: H }, () => new Array<boolean>(columns).fill(false));
    const used = new Array<boolean>(entries.length).fill(false);
    const placed: { k: number; r: number; c: number; f: Footprint }[] = [];
    let nodes = 0;
    let big = 0;
    let solution: typeof placed | null = null;
    let solutionScore = -Infinity;
    const fits = (r: number, c: number, f: Footprint) => {
      if (c + f.w > columns || r + f.h > H) return false;
      for (let i = r; i < r + f.h; i++)
        for (let j = c; j < c + f.w; j++) if (grid[i][j]) return false;
      return true;
    };
    const mark = (r: number, c: number, f: Footprint, value: boolean) => {
      for (let i = r; i < r + f.h; i++) for (let j = c; j < c + f.w; j++) grid[i][j] = value;
    };
    const search = (score: number) => {
      if (++nodes > 25000) return;
      let r = -1;
      let c = -1;
      for (let i = 0; i < H && r < 0; i++)
        for (let j = 0; j < columns; j++)
          if (!grid[i][j]) {
            r = i;
            c = j;
            break;
          }
      if (r < 0) {
        if (score > solutionScore) {
          solutionScore = score;
          solution = placed.slice();
        }
        return;
      }
      let tried = 0;
      for (let k = 0; k < entries.length && tried < 4; k++) {
        if (used[k]) continue;
        tried++;
        for (const f of fps[k]) {
          if (!fits(r, c, f)) continue;
          const isBig = f.w >= 2 && f.h >= 2;
          // One big card per shelf, and in the lead only the top entry may be big.
          const penalty = isBig && (big >= 1 || (lead && k !== 0)) ? 9 : 0;
          mark(r, c, f, true);
          used[k] = true;
          placed.push({ k, r, c, f });
          if (isBig) big++;
          search(score + f.score - (tried - 1) * 3 - penalty);
          placed.pop();
          used[k] = false;
          mark(r, c, f, false);
          if (isBig) big--;
        }
      }
    };
    search(0);
    if (solution && (!best || solutionScore > best.score))
      best = { score: solutionScore, rows: H, solution };
  }
  if (!best) return { placed: [], rows: 0, left: entries };
  const usedIndexes = new Set(best.solution.map((p) => p.k));
  return {
    placed: best.solution
      .map(({ k, r, c, f }) => ({
        entry: entries[k],
        variant: f.variant,
        column: c,
        row: r,
        columns: f.w,
        rows: f.h,
      }))
      .sort((a, b) => a.row - b.row || a.column - b.column),
    rows: best.rows,
    left: entries.filter((_, i) => !usedIndexes.has(i)),
  };
}

export type HomeSource = {
  /** Started items, most recent first. */
  resume: HomeEntry[];
  /** Newest saves. */
  recent: HomeEntry[];
  /** Editorial shelves. */
  collections: { id: string; title: string; entries: HomeEntry[] }[];
  /** The rest of the library, in library order. */
  library: HomeEntry[];
};

const unique = (source: HomeSource) => {
  const seen = new Set<string>();
  const take = (entries: HomeEntry[]) =>
    entries.filter((entry) => !seen.has(entry.id) && (seen.add(entry.id), true));
  return {
    resume: take(source.resume),
    recent: take(source.recent),
    collections: source.collections.map((c) => ({ ...c, entries: take(c.entries) })),
    library: take(source.library),
  };
};

export const CATCH_ALL = 'Also in your queue';

/** Grid edition for tablet and wider: an untitled lead, editorial shelves, then a catch-all. */
export function composeGrid(source: HomeSource, width: number) {
  const columns = columnsFor(width);
  const colW = (width - (columns - 1) * GAP) / columns;
  const rowH = Math.round((colW * 9) / 16);
  const { resume, recent, collections, library } = unique(source);
  const shelves: Shelf[] = [];
  const leadEntries = [...resume, ...recent].slice(0, 5);
  const carry: HomeEntry[] = [...resume, ...recent].slice(5);
  const lead = pack(leadEntries, columns, colW, rowH, true);
  if (lead.placed.length) shelves.push({ id: 'lead', placed: lead.placed, rows: lead.rows });
  carry.push(...lead.left);
  for (const collection of collections) {
    // Shelves narrower than a row would leave gaps; their entries join the catch-all instead.
    if (collection.entries.length < columns) {
      carry.push(...collection.entries);
      continue;
    }
    const result = pack(collection.entries.slice(0, 10), columns, colW, rowH);
    if (result.placed.length)
      shelves.push({ id: collection.id, title: collection.title, ...result });
    carry.push(...result.left, ...collection.entries.slice(10));
  }
  carry.push(...library);
  const rest = pack(carry.slice(0, 12), columns, colW, rowH);
  if (rest.placed.length) shelves.push({ id: 'queue', title: CATCH_ALL, ...rest });
  const shown = shelves.reduce((sum, shelf) => sum + shelf.placed.length, 0);
  return { columns, rowH, shelves, shown };
}

export type PhoneShelf = { id: string; title: string; tiles: HomeEntry[]; list: HomeEntry[] };

/**
 * Phone edition: one full-width lead, started items as a list card, new saves as the one
 * sideways rail, then shelves that open with two picture tiles and stack the rest into a list.
 */
export function composePhone(source: HomeSource) {
  const { resume, recent, collections, library } = unique(source);
  const all = [...resume, ...recent];
  const lead = all[0] ?? collections[0]?.entries[0] ?? library[0];
  const not = (entry: HomeEntry) => entry !== lead;
  const shelf = (id: string, title: string, entries: HomeEntry[]): PhoneShelf => {
    const pictures = entries.filter((entry) => entry.thumbnail);
    const tiles = pictures.length >= 2 ? pictures.slice(0, 2) : [];
    return { id, title, tiles, list: entries.filter((entry) => !tiles.includes(entry)) };
  };
  const shelves = collections
    .map((c) => shelf(c.id, c.title, c.entries.filter(not).slice(0, 6)))
    .filter((s) => s.tiles.length + s.list.length > 0);
  const queue = library.filter(not).slice(0, 6);
  if (queue.length) shelves.push(shelf('queue', CATCH_ALL, queue));
  return {
    lead,
    resume: resume.filter(not),
    recent: recent.filter(not).slice(0, 8),
    shelves,
  };
}
