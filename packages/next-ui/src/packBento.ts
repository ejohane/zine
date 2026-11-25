import type { CardItem } from './types';

/**
 * A bento is a stack of bands. Every band is a full rectangle: one cell per column, and every
 * cell in a band has the same height, so a section never has a hole in the middle.
 *
 * Heights come from the card sizes: a row is one large card (368), a double is two tiles (532),
 * a tower is one tall card or two large ones (752).
 */
export type BandHeight = 'row' | 'double' | 'tower';

/**
 * What one column of a band holds:
 * - `large`: one large card
 * - `list`: four compact cards
 * - `tiles`: four tiles, two by two
 * - `pair`: two narrow tall cards side by side
 * - `mixed`: one narrow tall card beside two tiles
 * - `tall`: one tall card
 * - `stack`: two large cards
 * - `feature`: one large card over four compact cards
 */
export type CellKind = 'large' | 'list' | 'tiles' | 'pair' | 'mixed' | 'tall' | 'stack' | 'feature';

export interface BentoCell<T = CardItem> {
  kind: CellKind;
  items: T[];
}

export interface BentoBand<T = CardItem> {
  height: BandHeight;
  cells: BentoCell<T>[];
}

interface CellRule {
  height: BandHeight;
  count: number;
  /** How much the cell is worth before variety is considered. */
  worth: number;
  /** Positions in the cell that are tall cards, which only suit things you read. */
  reads: number[];
  /** Whether the cell opens with a big card, fit for the first item of a section. */
  leads: boolean;
}

const RULES: Record<CellKind, CellRule> = {
  large: { height: 'row', count: 1, worth: 3, reads: [], leads: true },
  list: { height: 'row', count: 4, worth: 1, reads: [], leads: false },
  tiles: { height: 'double', count: 4, worth: 2, reads: [], leads: false },
  pair: { height: 'double', count: 2, worth: 3, reads: [0, 1], leads: false },
  mixed: { height: 'double', count: 3, worth: 3, reads: [0], leads: false },
  tall: { height: 'tower', count: 1, worth: 4, reads: [0], leads: true },
  stack: { height: 'tower', count: 2, worth: 2, reads: [], leads: true },
  feature: { height: 'tower', count: 5, worth: 2, reads: [], leads: true },
};

const KINDS = Object.keys(RULES) as CellKind[];
const HEIGHTS: BandHeight[] = ['row', 'double', 'tower'];

/** A tall card is mostly words, so it needs an article or post with enough of them. */
export function readsTall(item: CardItem): boolean {
  if (item.kind !== 'article' && item.kind !== 'post') return false;
  return (item.body ?? item.description ?? '').length >= 240;
}

/** Every way to fill `columns` cells of one height, as lists of cell kinds. */
function combinations(height: BandHeight, columns: number): CellKind[][] {
  const kinds = KINDS.filter((kind) => RULES[kind].height === height);
  let found: CellKind[][] = [[]];
  for (let column = 0; column < columns; column++)
    found = found.flatMap((sofar) => kinds.map((kind) => [...sofar, kind]));
  return found;
}

/**
 * Packs items, in order, into bands of `columns` cells.
 *
 * Each band is the best-scoring one that the rest of the items can still follow with full bands.
 * Scoring favours big cards, a big first card, variety within a band, and not repeating the
 * band before. When no arrangement comes out even (always the case with fewer items than
 * columns), the leftovers sit as large cards in a short last row.
 */
export function packBento<T>(
  items: readonly T[],
  columns: number,
  canBeTall: (item: T) => boolean
): BentoBand<T>[] {
  const options = HEIGHTS.flatMap((height) => combinations(height, columns));
  const size = (kinds: CellKind[]) => kinds.reduce((sum, kind) => sum + RULES[kind].count, 0);
  const fits = (kinds: CellKind[], start: number) => {
    if (start + size(kinds) > items.length) return false;
    let offset = start;
    for (const kind of kinds) {
      if (RULES[kind].reads.some((position) => !canBeTall(items[offset + position]!))) return false;
      offset += RULES[kind].count;
    }
    return true;
  };
  // even[i]: the items from i on can be packed into full bands with nothing left over.
  const even: boolean[] = Array(items.length + 1).fill(false);
  even[items.length] = true;
  for (let start = items.length - 1; start >= 0; start--)
    even[start] = options.some((kinds) => fits(kinds, start) && even[start + size(kinds)]);

  const bands: BentoBand<T>[] = [];
  const used = new Map<CellKind, number>();
  let start = 0;
  let previous: BandHeight | undefined;

  while (start < items.length) {
    let best: { kinds: CellKind[]; score: number } | undefined;
    for (const kinds of options) {
      if (!fits(kinds, start)) continue;
      if (even[start] && !even[start + size(kinds)]) continue;
      let score = 0;
      const seen = new Map(used);
      for (const kind of kinds) {
        const times = seen.get(kind) ?? 0;
        score += RULES[kind].worth - 2 * times;
        seen.set(kind, times + 1);
      }
      score += 2 * (new Set(kinds).size - 1);
      if (RULES[kinds[0]!].height === previous) score -= 3;
      if (start === 0 && RULES[kinds[0]!].leads) score += 3;
      if (!best || score > best.score) best = { kinds, score };
    }
    if (!best) {
      bands.push({
        height: 'row',
        cells: items.slice(start).map((item) => ({ kind: 'large' as const, items: [item] })),
      });
      break;
    }
    const cells = best.kinds.map((kind) => {
      const cell = { kind, items: items.slice(start, start + RULES[kind].count) };
      start += RULES[kind].count;
      used.set(kind, (used.get(kind) ?? 0) + 1);
      return cell;
    });
    previous = RULES[best.kinds[0]!].height;
    bands.push({ height: previous, cells });
  }
  return bands;
}

/**
 * Wide columns for a bento of this width: one on a phone, two on a tablet, three on a desktop.
 * The steps keep a wide card between about 270 and 415 across; it is designed at 392.
 */
export function bentoColumns(width: number): number {
  if (width >= 848) return 3;
  if (width >= 560) return 2;
  return 1;
}
