import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bento, bentoColumns, footerLabel, packBento, progressLabel } from '../src/index';
import type { BentoBand } from '../src/index';
import * as f from './fixtures';

interface Thing {
  id: number;
  reads: boolean;
}
const things = (count: number, reads: (index: number) => boolean = () => false): Thing[] =>
  Array.from({ length: count }, (_, id) => ({ id, reads: reads(id) }));
const pack = (items: Thing[], columns: number) => packBento(items, columns, (item) => item.reads);
const placed = (bands: BentoBand<Thing>[]) =>
  bands.flatMap((band) => band.cells.flatMap((cell) => cell.items.map((item) => item.id)));
const HEIGHT = {
  large: 'row',
  list: 'row',
  tiles: 'double',
  pair: 'double',
  mixed: 'double',
  tall: 'tower',
  stack: 'tower',
  feature: 'tower',
} as const;

describe('bento packing', () => {
  test('places every item once, in order, at every width and count', () => {
    for (const columns of [1, 2, 3])
      for (let count = 0; count <= 30; count++)
        for (const reads of [() => false, () => true, (index: number) => index % 3 === 0]) {
          const items = things(count, reads);
          expect(placed(pack(items, columns))).toEqual(items.map((item) => item.id));
        }
  });

  test('every band is a full rectangle; only the last may be a short row', () => {
    for (const columns of [1, 2, 3])
      for (let count = 1; count <= 30; count++) {
        const bands = pack(
          things(count, (index) => index % 2 === 0),
          columns
        );
        for (const band of bands)
          for (const cell of band.cells) expect(HEIGHT[cell.kind]).toBe(band.height);
        for (const band of bands.slice(0, -1)) expect(band.cells.length).toBe(columns);
        expect(bands.at(-1)!.cells.length).toBeLessThanOrEqual(columns);
        if (count < columns) {
          expect(bands.length).toBe(1);
          expect(bands[0]!.cells.map((cell) => cell.kind)).toEqual(Array(count).fill('large'));
        }
      }
  });

  test('tall cards only hold things that read well tall', () => {
    for (const columns of [1, 2, 3])
      for (let count = 1; count <= 30; count++)
        for (const band of pack(
          things(count, (index) => index % 4 === 1),
          columns
        ))
          for (const cell of band.cells) {
            if (cell.kind === 'tall') expect(cell.items[0]!.reads).toBe(true);
            if (cell.kind === 'mixed') expect(cell.items[0]!.reads).toBe(true);
            if (cell.kind === 'pair') expect(cell.items.every((item) => item.reads)).toBe(true);
          }
  });

  test('a section opens with a big card and does not repeat the same band', () => {
    for (const columns of [1, 2, 3]) {
      const bands = pack(
        things(14, (index) => index % 2 === 0),
        columns
      );
      expect(['large', 'tall', 'stack', 'feature']).toContain(bands[0]!.cells[0]!.kind);
      expect(bands[0]!.height).not.toBe(bands[1]!.height);
    }
  });

  test('one column on a phone, two on a tablet, three on a desktop', () => {
    expect([358, 559, 560, 847, 848, 1408].map(bentoColumns)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  test('renders each item once with its link', () => {
    const items = [f.video, f.article, f.podcast, f.post];
    const html = renderToStaticMarkup(<Bento items={items} columns={2} now={f.NOW} />);
    for (const item of items) expect(html.split(`href="${item.url}"`).length).toBe(2);
    expect(html).toContain('data-columns="2"');
  });
});

describe('progress', () => {
  test('shows what is left instead of the length', () => {
    expect(progressLabel({ ...f.video, progress: 0.5 })).toBe('44 min left');
    expect(footerLabel({ ...f.video, progress: 0.5 }, f.NOW)).toBe('44 min left · Saved 2d ago');
    expect(progressLabel({ ...f.video, durationMinutes: undefined, progress: 0.5 })).toBe(
      'In progress'
    );
  });

  test('not started and finished items keep the plain footer', () => {
    for (const progress of [undefined, 0, 1])
      expect(footerLabel({ ...f.video, progress }, f.NOW)).toBe('1 h 27 min · Saved 2d ago');
  });
});
