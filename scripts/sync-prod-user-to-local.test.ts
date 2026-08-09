import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';

import { collectArticleBodyObjects, parseSyncOptions } from './sync-prod-user-to-local.mjs';

const databases: Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe('parseSyncOptions', () => {
  test('enables production article body transfer explicitly', () => {
    expect(parseSyncOptions(['--yes', '--include-article-bodies'])).toEqual({
      assumeYes: true,
      skipExport: false,
      skipRestore: false,
      keepRaw: false,
      includeArticleBodies: true,
    });
  });

  test('rejects unknown arguments instead of silently ignoring them', () => {
    expect(() => parseSyncOptions(['--include-article-body'])).toThrow(
      'Unknown argument: --include-article-body'
    );
  });

  test('rejects article body transfer when local restore is disabled', () => {
    expect(() => parseSyncOptions(['--include-article-bodies', '--skip-restore'])).toThrow(
      '--include-article-bodies cannot be combined with --skip-restore.'
    );
  });
});

describe('collectArticleBodyObjects', () => {
  test('returns current v2 artifacts and legacy HTML without stale versions or duplicates', () => {
    const database = new Database(':memory:');
    databases.push(database);
    database.exec(`
      CREATE TABLE items (
        id TEXT PRIMARY KEY NOT NULL,
        article_content_key TEXT
      );
      CREATE TABLE article_body_states (
        item_id TEXT PRIMARY KEY NOT NULL,
        current_version_id TEXT
      );
      CREATE TABLE article_body_versions (
        id TEXT PRIMARY KEY NOT NULL,
        r2_key TEXT NOT NULL
      );

      INSERT INTO items (id, article_content_key) VALUES
        ('item-current', 'articles/item-current.html'),
        ('item-v2-only', NULL);
      INSERT INTO article_body_versions (id, r2_key) VALUES
        ('version-current', 'articles/v2/item-current/current.json'),
        ('version-stale', 'articles/v2/item-current/stale.json'),
        ('version-other', 'articles/v2/item-v2-only/current.json');
      INSERT INTO article_body_states (item_id, current_version_id) VALUES
        ('item-current', 'version-current'),
        ('item-v2-only', 'version-other');
    `);

    expect(collectArticleBodyObjects(database)).toEqual([
      {
        objectKey: 'articles/item-current.html',
        contentType: 'text/html; charset=utf-8',
      },
      {
        objectKey: 'articles/v2/item-current/current.json',
        contentType: 'application/json; charset=utf-8',
      },
      {
        objectKey: 'articles/v2/item-v2-only/current.json',
        contentType: 'application/json; charset=utf-8',
      },
    ]);
  });
});
