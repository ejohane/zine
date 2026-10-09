import { Database } from 'bun:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { parseHTML } from 'linkedom';
import { InputSchema, type ClassifierInput } from '../../packages/shared/src/tag-classifier/core';
import { getArticleBodyArtifact } from '../../apps/worker/src/article-body/storage';

export function cleanText(html: string): string {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  document.querySelectorAll('script,style,nav,footer,header').forEach((node) => node.remove());
  return document.body.textContent.replace(/\s+/g, ' ').trim();
}
export function boundText(text: string) {
  // Conservative byte budget: even byte-level tokenization fits below the 32k state limit.
  const maxBytes = 24_000;
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return { text, truncated: false };
  const chars = [...text];
  let front = '',
    back = '',
    bytes = 0;
  for (let i = 0; i < chars.length / 2; i++) {
    const a = chars[i],
      b = chars[chars.length - 1 - i];
    if (bytes + Buffer.byteLength(a + b) > maxBytes - 100) break;
    front += a;
    back = b + back;
    bytes += Buffer.byteLength(a + b);
  }
  return { text: `${front}\n[Middle omitted for request budget]\n${back}`, truncated: true };
}
export async function openLocal(stateDirectory: string, userId?: string) {
  const state = resolve(stateDirectory);
  if (!existsSync(join(state, 'zine-sanitized-snapshot.json')))
    throw new Error(
      'Local sanitized snapshot missing. Run bun run data:prod:local -- --yes --include-article-bodies before using the CLI.'
    );
  const manifest = await Bun.file(join(state, 'zine-sanitized-snapshot.json')).json();
  const owner = userId ?? manifest.userId;
  if (!owner || owner !== manifest.userId)
    throw new Error('Requested user does not match this local snapshot owner.');
  const directory = join(state, 'v3/d1/miniflare-D1DatabaseObject');
  const candidates = readdirSync(directory).filter((name) => name.endsWith('.sqlite'));
  let db: Database | undefined;
  for (const name of candidates) {
    const candidate = new Database(join(directory, name), { readonly: true, create: false });
    if (
      candidate
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='user_items'")
        .get()
    ) {
      db = candidate;
      break;
    }
    candidate.close();
  }
  if (!db) throw new Error('No local bookmark database found. Refresh the sanitized snapshot.');
  let mf: Miniflare | undefined;
  const database = db;
  return {
    list: () =>
      database
        .query(
          `SELECT ui.id AS bookmarkId, i.title, i.content_type AS contentType, i.provider FROM user_items ui JOIN items i ON i.id=ui.item_id WHERE ui.user_id=? AND ui.state='BOOKMARKED' ORDER BY ui.bookmarked_at DESC`
        )
        .all(owner),
    load: async (id: string): Promise<ClassifierInput> => {
      const row = database
        .query(
          `SELECT ui.id AS bookmarkId, i.id AS itemId, i.title, i.summary AS description, i.content_type AS contentType, i.provider, i.publisher, c.name AS creator, i.article_content_key AS legacyKey, v.r2_key AS r2Key, s.status AS bodyStatus FROM user_items ui JOIN items i ON i.id=ui.item_id LEFT JOIN creators c ON c.id=i.creator_id LEFT JOIN article_body_states s ON s.item_id=i.id LEFT JOIN article_body_versions v ON v.id=s.current_version_id WHERE ui.id=? AND ui.user_id=? AND ui.state='BOOKMARKED'`
        )
        .get(id, owner) as
        | (ClassifierInput & {
            r2Key: string | null;
            legacyKey: string | null;
            bodyStatus: string | null;
          })
        | null;
      if (!row)
        throw new Error(
          'Bookmark not found for the local snapshot owner. Use list to find a bookmark ID.'
        );
      let text = '',
        coverage: ClassifierInput['coverage'] = row.description
          ? 'DESCRIPTION_ONLY'
          : 'METADATA_ONLY';
      const warnings: string[] = [];
      if (row.r2Key || row.legacyKey) {
        if (!existsSync(join(state, 'v3/r2')))
          throw new Error('Local R2 content missing. Refresh with --include-article-bodies.');
        mf ??= new Miniflare({
          modules: true,
          script: 'export default { fetch() { return new Response("read-only classifier"); } }',
          r2Buckets: { ARTICLE_CONTENT: 'zine-article-content-dev' },
          r2Persist: join(state, 'v3/r2'),
        });
        const bucket = await mf.getR2Bucket('ARTICLE_CONTENT');
        if (row.r2Key) {
          const artifact = await getArticleBodyArtifact(bucket as unknown as R2Bucket, row.r2Key);
          if (!artifact)
            throw new Error(
              'Referenced article artifact is missing in local R2. Refresh the snapshot.'
            );
          text = artifact.blocks.map((b) => b.text).join('\n\n');
          coverage = row.bodyStatus === 'AVAILABLE' ? 'FULL_CONTENT' : 'PARTIAL_CONTENT';
          warnings.push(...artifact.qualityWarnings);
        } else {
          const object = await bucket.get(`articles/${row.itemId}.html`);
          if (!object)
            throw new Error('Referenced legacy body is missing in local R2. Refresh the snapshot.');
          text = cleanText(await object.text());
          coverage = 'PARTIAL_CONTENT';
          warnings.push('LEGACY_UNNORMALIZED');
        }
      }
      const cleanedDescription = row.description ? cleanText(row.description) : null;
      if (cleanedDescription && cleanedDescription.length > 2000)
        warnings.push('DESCRIPTION_TRUNCATED');
      if (row.title.length > 1000) warnings.push('TITLE_TRUNCATED');
      const bounded = boundText(text);
      if (bounded.truncated) {
        coverage = 'PARTIAL_CONTENT';
        warnings.push('MIDDLE_OMITTED');
      }
      return InputSchema.parse({
        ...row,
        description: cleanedDescription ? cleanedDescription.slice(0, 2000) : null,
        title: row.title.slice(0, 1000),
        text: bounded.text,
        coverage,
        warnings,
      });
    },
    close: async () => {
      database.close();
      await mf?.dispose();
    },
  };
}
