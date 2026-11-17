import { describe, expect, it } from 'bun:test';
import { columnsFor, composeGrid, composePhone, GAP, MIN_COLUMN, pack } from './homeLayout';
import type { HomeEntry, HomeKind, HomeSource } from './homeLayout';

let next = 0;
const entry = (kind: HomeKind, extra: Partial<HomeEntry> = {}): HomeEntry => ({
  id: `itm_${next++}`,
  kind,
  title: `${kind} ${next}`,
  url: 'https://example.com/' + next,
  creator: 'Creator',
  ...extra,
});
const article = (art = true) =>
  entry('article', { thumbnail: art ? 'https://example.com/a.jpg' : undefined, preview: 'Text.' });
const video = () => entry('video', { thumbnail: 'https://example.com/v.jpg', seconds: 600 });
const podcast = () => entry('podcast', { thumbnail: 'https://example.com/p.jpg', seconds: 3600 });
const post = (text: string, media = false) =>
  entry('post', {
    preview: text,
    handle: 'someone',
    thumbnail: media ? 'https://x.com/m.jpg' : undefined,
  });

const mixed = (): HomeSource => ({
  resume: [article(), video()],
  recent: [post('short'), podcast(), article(false)],
  collections: [
    {
      id: 'c1',
      title: 'One',
      entries: [video(), post('x'.repeat(600)), article(), podcast(), post('y', true)],
    },
    { id: 'c2', title: 'Tiny', entries: [video()] },
  ],
  library: [article(), video(), post('z'.repeat(1200)), podcast(), article(false), video()],
});
const mediaOnly = (): HomeSource => ({
  resume: [video()],
  recent: [podcast(), video()],
  collections: [],
  library: [video(), podcast(), video(), podcast(), video()],
});

function assertGapless(
  shelf: { placed: { column: number; row: number; columns: number; rows: number }[]; rows: number },
  columns: number
) {
  const grid = Array.from({ length: shelf.rows }, () => new Array(columns).fill(0));
  for (const p of shelf.placed) {
    expect(p.column + p.columns).toBeLessThanOrEqual(columns);
    expect(p.row + p.rows).toBeLessThanOrEqual(shelf.rows);
    for (let r = p.row; r < p.row + p.rows; r++)
      for (let c = p.column; c < p.column + p.columns; c++) grid[r][c]++;
  }
  // Every cell covered exactly once: no gaps and no overlaps.
  expect(grid.flat().every((cell) => cell === 1)).toBe(true);
}

describe('columns', () => {
  it('uses three columns for tablets and laptops and five on large screens', () => {
    expect(columnsFor(820)).toBe(3);
    expect(columnsFor(1120)).toBe(3);
    expect(columnsFor(1448)).toBe(5);
  });
  it('never makes a column too narrow for a card', () => {
    for (let width = 600; width <= 2600; width += 7) {
      const columns = columnsFor(width);
      expect((width - (columns - 1) * GAP) / columns).toBeGreaterThanOrEqual(MIN_COLUMN);
    }
  });
});

describe('grid edition', () => {
  for (const width of [620, 760, 820, 1024, 1120, 1300, 1448, 2000])
    for (const [name, source] of [
      ['mixed', mixed],
      ['media only', mediaOnly],
    ] as const)
      it(`packs a ${name} library with no gaps at ${width}px`, () => {
        const edition = composeGrid(source(), width);
        expect(edition.shown).toBeGreaterThan(0);
        for (const shelf of edition.shelves) assertGapless(shelf, edition.columns);
        const ids = edition.shelves.flatMap((s) => s.placed.map((p) => p.entry.id));
        expect(new Set(ids).size).toBe(ids.length);
      });

  it('is deterministic', () => {
    const source = mixed();
    expect(JSON.stringify(composeGrid(source, 1120))).toBe(
      JSON.stringify(composeGrid(source, 1120))
    );
  });

  it('folds a shelf smaller than a row into the catch-all', () => {
    const edition = composeGrid(mixed(), 1120);
    expect(edition.shelves.some((s) => s.title === 'Tiny')).toBe(false);
  });

  it('gives only the top lead entry the hero shape', () => {
    const edition = composeGrid(mixed(), 1448);
    const heroes = edition.shelves.flatMap((s) => s.placed).filter((p) => p.variant.hero);
    expect(heroes.every((p) => edition.shelves[0].placed[0].entry === p.entry)).toBe(true);
  });

  it('keeps video cards at least 250px wide', () => {
    for (const width of [620, 820, 1120, 1448]) {
      const edition = composeGrid(mediaOnly(), width);
      const colW = (width - (edition.columns - 1) * GAP) / edition.columns;
      for (const p of edition.shelves.flatMap((s) => s.placed))
        expect(p.columns * colW + (p.columns - 1) * GAP).toBeGreaterThanOrEqual(250);
    }
  });
});

describe('pack', () => {
  it('returns entries it could not place', () => {
    const entries = Array.from({ length: 30 }, () => post('short'));
    const result = pack(entries, 3, 300, 169);
    expect(result.placed.length + result.left.length).toBe(30);
  });
});

describe('phone edition', () => {
  it('leads with one entry, lists started items and shows new saves once', () => {
    const source = mixed();
    const phone = composePhone(source);
    expect(phone.lead).toBe(source.resume[0]);
    expect(phone.resume).toEqual(source.resume.slice(1));
    expect(phone.recent).toEqual(source.recent);
    const shown = [
      phone.lead,
      ...phone.resume,
      ...phone.recent,
      ...phone.shelves.flatMap((s) => [...s.tiles, ...s.list]),
    ].map((e) => e.id);
    expect(new Set(shown).size).toBe(shown.length);
  });
  it('opens a shelf with two picture tiles only when it has two pictures', () => {
    for (const shelf of composePhone(mixed()).shelves) {
      expect([0, 2]).toContain(shelf.tiles.length);
      for (const tile of shelf.tiles) expect(tile.thumbnail).toBeTruthy();
    }
  });
});
