import { describe, expect, test } from 'bun:test';
import {
  capture,
  initialItems,
  inScope,
  isComplete,
  loadLibrary,
  persist,
  composeHome,
  plan,
  progress,
  search,
  setProgress,
  storageKey,
  updateItem,
  visibleItems,
} from './model';

describe('Native-parity model invariants', () => {
  test('three-column bento retains every item exactly once with no collisions', () => {
    for (const section of ['Home', 'Articles', 'Podcasts', 'Videos', 'Posts'] as const) {
      const items = visibleItems(initialItems(), section, 'saved');
      const placements = plan(items);
      const occupied = new Set<string>();
      expect(new Set(placements.map((p) => p.index))).toEqual(new Set(items.map((_, i) => i)));
      for (const p of placements) {
        expect(p.column + p.columns).toBeLessThanOrEqual(3);
        for (let r = p.row; r < p.row + p.rows; r++)
          for (let c = p.column; c < p.column + p.columns; c++) {
            const cell = `${r}:${c}`;
            expect(occupied.has(cell)).toBe(false);
            occupied.add(cell);
          }
      }
    }
    const opening = plan(initialItems());
    expect(opening.slice(0, 3).map((p) => [p.columns, p.rows])).toEqual([
      [1, 3],
      [1, 2],
      [1, 2],
    ]);
  });
  test('capture is durable, repeat capture accumulates context and reactivates one reference', () => {
    const input = {
      url: ' https://example.com/pwa ',
      title: 'My PWA reference',
      section: 'Articles' as const,
      context: 'Why I kept it',
      tags: ['web', 'web'],
      collection: 'craft',
    };
    const first = capture(initialItems(), input);
    const archived = updateItem(first.items, first.id, (i) => {
      i.api.archived = true;
      i.api.status = 'dismissed';
    });
    const again = capture(archived, { ...input, context: 'A later reason' });
    expect(again.items.length).toBe(first.items.length);
    const item = again.items.find((i) => i.id === first.id)!;
    expect(item.api.status).toBe('saved');
    expect(item.api.archived).toBe(false);
    expect(item.api.context.map((c) => c.text)).toEqual(['Why I kept it', 'A later reason']);
    expect(item.api.tags).toEqual(['web']);
    let raw = '';
    persist(
      {
        setItem: (_, value) => {
          raw = value;
        },
      },
      again.items
    );
    expect(loadLibrary({ getItem: () => raw }).items.find((i) => i.id === first.id)?.api).toEqual(
      item.api
    );
  });
  test('invalid links never become saves', () => {
    for (const url of ['', 'hello', 'https://', 'javascript:alert(1)', 'file:///secret'])
      expect(() =>
        capture(initialItems(), {
          url,
          title: '',
          section: 'Articles',
          context: '',
          tags: [],
          collection: '',
        })
      ).toThrow();
  });
  test('lifecycle, archive, position and completion are independent', () => {
    const original = initialItems();
    const received = original.find((i) => inScope(i, 'received'))!;
    const next = updateItem(original, received.id, (item) => {
      item.api.status = 'saved';
      item.api.archived = true;
      setProgress(item, 0.43);
    });
    const changed = next.find((i) => i.id === received.id)!;
    expect(inScope(changed, 'saved')).toBe(true);
    expect(inScope(changed, 'archived')).toBe(true);
    expect(progress(changed)).toBeCloseTo(0.43);
    expect(isComplete(changed)).toBe(false);
    expect(received.api.status).toBe('received');
    const finished = updateItem(next, received.id, (item) => {
      item.api.progress.completedAt = new Date().toISOString();
    });
    expect(progress(finished.find((i) => i.id === received.id)!)).toBeCloseTo(0.43);
  });
  test('local context search, scripted semantics and many-to-many membership', () => {
    const sample = initialItems()[0];
    const items = updateItem(initialItems(), sample.id, (i) => {
      i.api.context.push({ id: 'test', text: 'Memorable blue teapot', origin: 'explicit' });
      i.api.collectionIds.push('ai-design');
    });
    expect(search(items, 'blue teapot', 'keyword')[0].evidence[0].field).toBe('context');
    expect(search(items, 'designing with AI', 'semantic').length).toBeGreaterThan(0);
    expect(search(items, 'unconfigured semantic query', 'semantic')).toEqual([]);
    expect(visibleItems(items, 'Home', 'saved', 'craft').some((i) => i.id === sample.id)).toBe(
      true
    );
    expect(visibleItems(items, 'Home', 'saved', 'ai-design').some((i) => i.id === sample.id)).toBe(
      true
    );
  });
  test('unreadable storage is preserved and write failures are not hidden', () => {
    let raw = '{unreadable';
    const storage = {
      getItem: (key: string) => {
        expect(key).toBe(storageKey);
        return raw;
      },
    };
    const loaded = loadLibrary(storage);
    expect(loaded.blocked).toBe(true);
    expect(loaded.error).toContain('preserved');
    expect(raw).toBe('{unreadable');
    raw = JSON.stringify({ version: 999, items: [] });
    expect(loadLibrary(storage).blocked).toBe(true);
    expect(() =>
      persist(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        initialItems()
      )
    ).toThrow('quota');
  });
});

describe('Composed Home feed', () => {
  const items = initialItems();
  const cards = Array.from({ length: 63 }, (_, i) => ({
    ...items[i % items.length],
    id: `save-${i}`,
  }));

  test('renders every save in order and keeps previous rows stable during pagination', () => {
    const first = composeHome(cards.slice(0, 30), 30);
    const expanded = composeHome(cards, 30);
    expect(expanded.slice(0, first.length)).toEqual(first);
    expect(expanded.flatMap((row) => row.groups.flatMap((group) => group.items))).toEqual(cards);
  });

  test('assigns shapes by position even in single-format libraries', () => {
    const videos = cards.slice(0, 12).map((item) => ({ ...item, section: 'Videos' as const }));
    const rows = composeHome(videos, 30);
    expect(rows.map((row) => row.groups.map((group) => group.presentation))).toEqual([
      ['feature', 'compact'],
      ['tile', 'tall'],
      ['banner'],
      ['compact', 'feature'],
    ]);
    expect(rows[0].groups[1].items).toHaveLength(3);
    expect(rows[1].groups[0].items).toHaveLength(2);
  });

  test('renders partial rows without leaving empty slots', () => {
    expect(composeHome([], 30)).toEqual([]);
    for (let length = 1; length < 30; length++) {
      const rows = composeHome(cards.slice(0, length), 30);
      expect(rows.flatMap((row) => row.groups.flatMap((group) => group.items))).toEqual(
        cards.slice(0, length)
      );
    }
  });
});
