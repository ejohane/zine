import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, expect, it, vi } from 'vitest';
import { ContentType, Provider } from '@zine/shared';
import type { classify } from '@zine/shared/tag-classifier';
import { hash, POLICY_VERSION, type ClassifierInput } from '@zine/shared/tag-classifier';
import { createDb } from '../db';
import { items, users, userItems } from '../db/schema';
import type { Bindings } from '../types';
import {
  buildCatalog,
  generateTagSuggestions,
  listTagSuggestions,
  decideTagSuggestion,
} from './service';
import { mergeTagsForUserItem } from '../trpc/tagging';
vi.mock('googleapis', () => ({ google: {} }));
const bindings = env as unknown as Bindings & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};
const enabled = { ...bindings, AUTO_TAGGING_ENABLED: 'true', TYPESAFE_API_KEY: 'test-only' };
const db = createDb(bindings.DB);
const input: ClassifierInput = {
  bookmarkId: 'bookmark',
  itemId: 'item',
  title: 'AI tools',
  description: null,
  text: '',
  contentType: 'ARTICLE',
  provider: 'WEB',
  publisher: null,
  creator: null,
  coverage: 'METADATA_ONLY',
  warnings: [],
};
function classifier(selected = ['ai']) {
  return vi.fn<typeof classify>(async (source, catalog) => ({
    version: 1,
    policyVersion: POLICY_VERSION,
    catalog,
    input: source,
    inputHash: hash(source),
    catalogHash: hash(catalog),
    model: 'jev-1.13.0',
    requestedModel: 'jev-1.13.0',
    createdAt: new Date().toISOString(),
    latencyMs: 1,
    usage: { input_tokens: 1, output_tokens: 1 },
    pricePerMillionInputTokens: 0.042,
    estimatedCostUsd: 0,
    probabilities: Object.fromEntries(
      catalog.tags.map((t) => [t.id, selected.includes(t.id) ? 0.95 : 0.01])
    ),
  }));
}
beforeEach(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  const now = new Date().toISOString();
  await db.insert(users).values(
    ['owner', 'other'].map((id) => ({
      id,
      email: `${id}@example.com`,
      createdAt: now,
      updatedAt: now,
    }))
  );
  await db.insert(items).values({
    id: 'item',
    title: 'AI tools',
    contentType: ContentType.ARTICLE,
    provider: Provider.WEB,
    providerId: 'test',
    canonicalUrl: 'https://example.com',
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(userItems).values({
    id: 'bookmark',
    userId: 'owner',
    itemId: 'item',
    state: 'BOOKMARKED',
    ingestedAt: now,
    createdAt: now,
    updatedAt: now,
  });
});
it('extends the catalog with private manual tags, deduplicates normalized names', async () => {
  await mergeTagsForUserItem({ db, userId: 'owner' }, 'bookmark', ['My special topic', 'AI']);
  const call = classifier();
  await generateTagSuggestions(enabled, 'owner', input, call);
  const catalog = call.mock.calls[0][1];
  expect(catalog.tags.filter((t) => t.name === 'My special topic')).toHaveLength(1);
  expect(catalog.tags.filter((t) => t.name.toLowerCase() === 'ai')).toHaveLength(1);
  expect(buildCatalog([]).tags.some((t) => t.name === 'My special topic')).toBe(false);
});
it('accept is atomic/idempotent and preserves assigned tags and dismissed decisions across reclassification', async () => {
  await mergeTagsForUserItem({ db, userId: 'owner' }, 'bookmark', ['Personal']);
  await generateTagSuggestions(enabled, 'owner', input, classifier(['ai', 'databases']));
  const suggestions = await listTagSuggestions(bindings.DB, 'owner', 'bookmark');
  expect(suggestions).toHaveLength(2);
  const ai = suggestions.find((t) => t.name === 'AI')!,
    other = suggestions.find((t) => t.id !== ai.id)!;
  await decideTagSuggestion(bindings.DB, 'owner', 'bookmark', ai.id, 'ACCEPTED');
  const result = await decideTagSuggestion(bindings.DB, 'owner', 'bookmark', ai.id, 'ACCEPTED');
  expect(result.tags.map((t) => t.name).sort()).toEqual(['AI', 'Personal']);
  await decideTagSuggestion(bindings.DB, 'owner', 'bookmark', other.id, 'DISMISSED');
  await generateTagSuggestions(
    enabled,
    'owner',
    { ...input, title: 'Updated' },
    classifier(['ai', 'databases'])
  );
  expect(await listTagSuggestions(bindings.DB, 'owner', 'bookmark')).toEqual([]);
  expect((await db.select().from(userItems))[0].state).toBe('BOOKMARKED');
});
it('enforces ownership before generation, reads, or decisions', async () => {
  const call = classifier();
  await expect(generateTagSuggestions(enabled, 'other', input, call)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await expect(listTagSuggestions(bindings.DB, 'other', 'bookmark')).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await expect(
    decideTagSuggestion(bindings.DB, 'other', 'bookmark', 'missing', 'ACCEPTED')
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(call).not.toHaveBeenCalled();
});
it('feature flag and completed fingerprint skip calls; empty output removes only pending suggestions', async () => {
  const call = classifier();
  await generateTagSuggestions(bindings, 'owner', input, call);
  expect(call).not.toHaveBeenCalled();
  await generateTagSuggestions(enabled, 'owner', input, call);
  await generateTagSuggestions(enabled, 'owner', input, call);
  expect(call).toHaveBeenCalledTimes(1);
  await generateTagSuggestions(enabled, 'owner', { ...input, title: 'Unrelated' }, classifier([]));
  expect(await listTagSuggestions(bindings.DB, 'owner', 'bookmark')).toEqual([]);
});
it('failed requests preserve previous suggestions and can retry', async () => {
  await generateTagSuggestions(enabled, 'owner', input, classifier());
  const changed = { ...input, title: 'New title' };
  const fail = vi.fn<typeof classify>().mockRejectedValue(new Error('Transient'));
  await expect(generateTagSuggestions(enabled, 'owner', changed, fail)).rejects.toThrow(
    'Transient'
  );
  expect(await listTagSuggestions(bindings.DB, 'owner', 'bookmark')).toHaveLength(1);
  await generateTagSuggestions(enabled, 'owner', changed, classifier(['databases']));
  expect((await listTagSuggestions(bindings.DB, 'owner', 'bookmark'))[0].name).toBe('Databases');
});
it('older in-flight calls cannot overwrite newer results', async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const slow: typeof classify = async (...args) => {
    started();
    await wait;
    return classifier(['ai'])(...args);
  };
  const first = generateTagSuggestions(enabled, 'owner', input, slow);
  await start;
  await generateTagSuggestions(
    enabled,
    'owner',
    { ...input, title: 'Newer' },
    classifier(['databases'])
  );
  release();
  await first;
  expect((await listTagSuggestions(bindings.DB, 'owner', 'bookmark')).map((t) => t.name)).toEqual([
    'Databases',
  ]);
});

it('retains a decision even when regeneration removes the suggestion between read and commit', async () => {
  await generateTagSuggestions(enabled, 'owner', input, classifier());
  const suggestion = (await listTagSuggestions(bindings.DB, 'owner', 'bookmark'))[0];
  const racingDB = {
    prepare(sql: string) {
      const statement = bindings.DB.prepare(sql);
      if (!sql.startsWith('SELECT name, normalized_name, confidence')) return statement;
      return {
        bind(...values: unknown[]) {
          const bound = statement.bind(...values);
          return {
            async first() {
              const row = await bound.first();
              await generateTagSuggestions(
                enabled,
                'owner',
                { ...input, title: 'Race' },
                classifier([])
              );
              return row;
            },
          };
        },
      };
    },
    batch: bindings.DB.batch.bind(bindings.DB),
  } as unknown as D1Database;
  await decideTagSuggestion(racingDB, 'owner', 'bookmark', suggestion.id, 'DISMISSED');
  await generateTagSuggestions(enabled, 'owner', { ...input, title: 'Again' }, classifier());
  expect(await listTagSuggestions(bindings.DB, 'owner', 'bookmark')).toEqual([]);
});
