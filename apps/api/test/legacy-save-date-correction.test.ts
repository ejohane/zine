import { Miniflare } from 'miniflare';
import { describe, expect, it } from 'vitest';
import { insertLegacyProgressSql } from '../scripts/legacy-progress-correction';
import { correctLegacySaveDatesSql } from '../scripts/legacy-save-date-correction';

describe('historical save date correction', () => {
  it('is owner scoped, guards later edits and converges without rewriting other fields', async () => {
    const runtime = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response() } }',
      d1Databases: ['DB'],
    });
    const db = await runtime.getD1Database('DB');
    try {
      const schema = `
        CREATE TABLE personal_items (
          id TEXT, owner_id TEXT, status TEXT, archived INTEGER, saved_at TEXT,
          decision_at TEXT, updated_at TEXT, revision INTEGER
        );
        CREATE TABLE idempotency (
          owner_id TEXT, operation TEXT, key TEXT, response_json TEXT, created_at TEXT
        );
        CREATE TABLE progress (
          item_id TEXT PRIMARY KEY, position REAL, unit TEXT, completed_at TEXT,
          updated_at TEXT, contributor TEXT
        );
        INSERT INTO progress VALUES ('resaved', 60, 'seconds', NULL, 'later', 'owner');
        CREATE TABLE item_aliases (owner_id TEXT, alias_item_id TEXT);
        INSERT INTO personal_items VALUES
          ('imported', 'owner', 'saved', 0, 'synthetic', 'synthetic', 'later-metadata-update', 8),
          ('resaved', 'owner', 'saved', 0, 'later-save', 'later-save', 'later-save', 3),
          ('other', 'other-owner', 'saved', 0, 'synthetic', 'synthetic', 'synthetic', 0),
          ('already-existing', 'owner', 'saved', 0, 'synthetic', 'synthetic', 'synthetic', 0),
          ('alias', 'owner', 'saved', 0, 'synthetic', 'synthetic', 'synthetic', 0);
        INSERT INTO item_aliases VALUES ('owner', 'alias');
      `;
      await db.batch(
        schema
          .split(';')
          .map((sql) => sql.trim())
          .filter(Boolean)
          .map((sql) => db.prepare(sql))
      );
      const receipt = db.prepare('INSERT INTO idempotency VALUES (?, ?, ?, ?, ?)');
      const corrections = ['imported', 'resaved', 'other', 'already-existing', 'alias'].map(
        (itemId) => ({
          legacyId: 'source-' + itemId,
          itemId,
          importedAt: 'synthetic',
          sourceSavedAt: 'original',
        })
      );
      await db.batch(
        corrections.map(({ itemId, legacyId }) =>
          receipt.bind(
            itemId === 'other' ? 'other-owner' : 'owner',
            'save',
            'real-library-' + legacyId,
            JSON.stringify({
              item: { id: itemId },
              save: { outcome: itemId === 'already-existing' ? 'already_saved' : 'created' },
            }),
            'synthetic'
          )
        )
      );
      const correction = db.prepare(correctLegacySaveDatesSql);
      expect((await correction.bind('owner', JSON.stringify(corrections)).all()).results).toEqual([
        { id: 'imported', saved_at: 'original', decision_at: 'original' },
      ]);
      expect((await correction.bind('owner', JSON.stringify(corrections)).all()).results).toEqual(
        []
      );
      expect(
        await db
          .prepare("SELECT updated_at, revision FROM personal_items WHERE id = 'imported'")
          .first()
      ).toEqual({ updated_at: 'later-metadata-update', revision: 9 });
      const progress = db.prepare(insertLegacyProgressSql).bind(
        JSON.stringify(
          corrections.map((entry) => ({
            ...entry,
            position: 15,
            unit: 'seconds',
            completedAt: 'original',
            updatedAt: 'original',
          }))
        ),
        'owner'
      );
      const written = (await progress.all<{ item_id: string }>()).results
        .map((row) => row.item_id)
        .sort();
      expect(written).toEqual(['already-existing', 'imported']);
      expect((await progress.all()).results).toEqual([]);
      expect(
        await db.prepare("SELECT position FROM progress WHERE item_id = 'resaved'").first()
      ).toEqual({ position: 60 });
    } finally {
      await runtime.dispose();
    }
  });
});
