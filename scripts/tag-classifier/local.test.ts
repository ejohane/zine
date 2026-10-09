import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { buildArticleBodyArtifact } from '../../apps/worker/src/article-body/artifact';
import { getArticleBodyArtifactKey } from '../../apps/worker/src/article-body/storage';
import { openLocal } from './local';
import { hash } from './jev';

test('local D1 and R2 reader preserves bookmark data, verifies artifacts, and enforces owner', async () => {
  const state = await mkdtemp(join(tmpdir(), 'zine-tag-reader-'));
  let mf: Miniflare | undefined;
  try {
    const dir = join(state, 'v3/d1/miniflare-D1DatabaseObject');
    await mkdir(dir, { recursive: true });
    await Bun.write(
      join(state, 'zine-sanitized-snapshot.json'),
      JSON.stringify({ userId: 'owner', includeArticleBodies: true })
    );
    const path = join(dir, 'fixture.sqlite');
    const db = new Database(path);
    db.exec(
      `CREATE TABLE user_items(id TEXT, user_id TEXT, item_id TEXT, state TEXT, bookmarked_at TEXT); CREATE TABLE items(id TEXT,title TEXT,summary TEXT,content_type TEXT,provider TEXT,publisher TEXT,creator_id TEXT,article_content_key TEXT); CREATE TABLE creators(id TEXT,name TEXT); CREATE TABLE article_body_states(item_id TEXT,current_version_id TEXT,status TEXT); CREATE TABLE article_body_versions(id TEXT,r2_key TEXT); INSERT INTO items VALUES('item','Garden guide',NULL,'ARTICLE','WEB',NULL,NULL,NULL); INSERT INTO user_items VALUES('bookmark','owner','item','BOOKMARKED','2026-10-03'); INSERT INTO user_items VALUES('private','other','item','BOOKMARKED','2026-10-03');`
    );
    let local = await openLocal(state);
    try {
      expect(local.list()).toHaveLength(1);
      expect((await local.load('bookmark')).coverage).toBe('METADATA_ONLY');
      await expect(local.load('private')).rejects.toThrow('not found');
    } finally {
      await local.close();
    }
    const artifact = await buildArticleBodyArtifact({
      extractorVersion: 1,
      itemId: 'item',
      canonicalUrl: 'https://example.com/garden',
      title: 'Garden guide',
      sourceKind: 'PUBLIC_WEB',
      sourceUrl: 'https://example.com/garden',
      extractedAt: 1,
      wordCount: 5,
      readingTimeMinutes: 1,
      qualityScore: 1,
      sanitizedHtml: '<p>Grow tomatoes in rich soil.</p>',
      plainText: 'Grow tomatoes in rich soil.',
      blocks: [{ id: 'b1', kind: 'paragraph', text: 'Grow tomatoes in rich soil.' }],
    });
    const key = getArticleBodyArtifactKey('item', artifact.contentHash);
    db.query('INSERT INTO article_body_states VALUES(?,?,?)').run('item', 'version', 'AVAILABLE');
    db.query('INSERT INTO article_body_versions VALUES(?,?)').run('version', key);
    db.close();
    mf = new Miniflare({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      r2Buckets: { ARTICLE_CONTENT: 'zine-article-content-dev' },
      r2Persist: join(state, 'v3/r2'),
    });
    await (await mf.getR2Bucket('ARTICLE_CONTENT')).put(key, JSON.stringify(artifact));
    await mf.dispose();
    mf = undefined;
    const before = hash(new Uint8Array(await Bun.file(path).arrayBuffer()));
    local = await openLocal(state);
    try {
      const loaded = await local.load('bookmark');
      expect(loaded.coverage).toBe('FULL_CONTENT');
      expect(loaded.text).toBe(artifact.plainText);
    } finally {
      await local.close();
    }
    expect(hash(new Uint8Array(await Bun.file(path).arrayBuffer()))).toBe(before);
    await expect(openLocal(state, 'other')).rejects.toThrow('snapshot owner');
  } finally {
    await mf?.dispose();
    await rm(state, { recursive: true, force: true });
  }
}, 20000);
