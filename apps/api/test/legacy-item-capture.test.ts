import { describe, expect, it } from 'vitest';
import {
  createLegacyItemsSql,
  legacyIdentity,
  reconcileLegacyStateSql,
} from '../scripts/legacy-item-capture';
import type { LegacyItem } from '../scripts/legacy-item-capture';
import { runtimeHarness } from '../scripts/runtime-harness';
import { deleteItem, getItem } from '../src/items';
import { eraseAccountData, exportSection } from '../src/portability';
import { listItems } from '../src/query';
import type { Env } from '../src/types';

const owner = 'legacy-owner';
const original = '2025-02-01T13:00:00.123Z';
const earlier = '2025-02-01T12:00:00.000Z';
const later = '2025-02-01T14:00:00.000Z';

function item(overrides: Partial<LegacyItem>): LegacyItem {
  return {
    id: 'saved-source',
    item_id: 'legacy-content',
    canonical_url: 'https://example.com/read',
    title: 'Legacy retained title',
    summary: 'Previously retained metadata',
    creator_name: null,
    creator_image_url: null,
    thumbnail_url: null,
    published_at: null,
    duration: 120,
    content_created_at: earlier,
    content_updated_at: earlier,
    content_type: 'VIDEO',
    state: 'BOOKMARKED',
    created_at: earlier,
    updated_at: original,
    ingested_at: earlier,
    bookmarked_at: original,
    archived_at: null,
    progress_position: 31,
    progress_duration: 120,
    progress_updated_at: original,
    is_finished: 1,
    finished_at: original,
    ...overrides,
  };
}

describe('legacy item capture', () => {
  it('projects one item per work, preserves source records and fences deletion and erasure', async () => {
    const runtime = await runtimeHarness();
    try {
      const env = { DB: runtime.db } as unknown as Env;
      const saved = item({});
      const dismissed = item({
        id: 'archived-other-route',
        state: 'ARCHIVED',
        archived_at: later,
        bookmarked_at: null,
      });
      const inbox = item({
        id: 'inbox-source',
        canonical_url: 'https://example.com/received',
        state: 'INBOX',
        ingested_at: later,
        bookmarked_at: null,
      });
      const inboxTwo = {
        ...inbox,
        id: 'another-inbox',
        canonical_url: 'https://example.com/another',
        created_at: later,
        ingested_at: earlier,
      };
      const identity = await legacyIdentity(owner, saved);
      const inboxIdentity = await legacyIdentity(owner, inbox);
      const groups = [[dismissed, saved], [inbox], [inboxTwo]];
      const apply = async () =>
        runtime.db.batch(
          (await createLegacyItemsSql(owner, 0, groups, 'migration-test')).map((sql) =>
            runtime.db.prepare(sql)
          )
        );
      await apply();
      expect(await getItem(env, owner, identity.itemId)).toMatchObject({
        status: 'saved',
        savedAt: original,
        createdAt: earlier,
        ingestedAt: earlier,
        progress: { position: 31, unit: 'seconds', completedAt: original },
        content: { title: 'Legacy retained title' },
      });
      expect(
        (await listItems(env, owner, { status: 'received', tagMatch: 'any' }, 1)).items[0].id
      ).toBe(inboxIdentity.itemId);
      expect((await exportSection(env, owner, 'legacyImport', '', 10)).records).toHaveLength(4);
      expect((await exportSection(env, 'other-owner', 'legacyImport', '', 10)).records).toEqual([]);
      await expect(apply()).rejects.toThrow();
      expect((await exportSection(env, owner, 'legacyImport', '', 10)).records).toHaveLength(4);
      await runtime.db.batch([
        runtime.db
          .prepare("UPDATE progress SET position=90, contributor='next-edit' WHERE item_id=?")
          .bind(identity.itemId),
      ]);
      const originalRows = await runtime.db
        .prepare(
          'SELECT legacy_id,payload_json,applied_json FROM legacy_import_records WHERE owner_id=? AND item_id=?'
        )
        .bind(owner, identity.itemId)
        .all<{ legacy_id: string; payload_json: string; applied_json: string | null }>();
      const edit = {
        ...saved,
        bookmarked_at: later,
        progress_position: 40,
        progress_updated_at: later,
        updated_at: later,
      };
      const updates = reconcileLegacyStateSql(
        owner,
        0,
        identity.itemId,
        originalRows.results.map((row) => ({
          original: row.legacy_id === saved.id ? edit : dismissed,
          previousPayload: row.payload_json,
          previousApplied: row.applied_json,
        })),
        'migration-catch-up'
      );
      await runtime.db.batch(updates.map((sql) => runtime.db.prepare(sql)));
      expect(await getItem(env, owner, identity.itemId)).toMatchObject({
        savedAt: later,
        progress: { position: 90 },
      });
      const equalDateSource = item({
        id: 'zz-later-source-id',
        canonical_url: 'https://example.com/equal-date',
        bookmarked_at: later,
        updated_at: later,
      });
      await runtime.db.batch(
        (await createLegacyItemsSql(owner, 0, [[equalDateSource]], 'migration-equal-date')).map(
          (sql) => runtime.db.prepare(sql)
        )
      );
      const tieWinner = await legacyIdentity(owner, equalDateSource);
      const first = await listItems(env, owner, { status: 'saved', tagMatch: 'any' }, 1);
      expect(first.items[0].id).toBe(tieWinner.itemId);
      expect(first.nextCursor).toBeTruthy();
      const second = await listItems(
        env,
        owner,
        { status: 'saved', tagMatch: 'any' },
        1,
        first.nextCursor!
      );
      expect(second.items[0].id).toBe(identity.itemId);
      await deleteItem(env, owner, tieWinner.itemId);
      await deleteItem(env, owner, identity.itemId);
      expect((await exportSection(env, owner, 'legacyImport', '', 10)).records).toHaveLength(2);
      await eraseAccountData(env, owner);
      expect((await exportSection(env, owner, 'legacyImport', '', 10)).records).toEqual([]);
      await expect(apply()).rejects.toThrow();
    } finally {
      await runtime.close();
    }
  });
});
