import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import {
  processUnderstanding,
  understandingChunks,
  scheduleUnderstanding,
} from '../src/understanding';
import { save, saveSchema, getItem, deleteItem } from '../src/items';
import { contribute } from '../src/enrichment';
import { stmt } from '../src/lib';
import type { Env } from '../src/types';

describe('private resumable generated understanding', () => {
  let runtime: Awaited<ReturnType<typeof runtimeHarness>>;
  let env: Env;
  const requests: { text: string; reduction: boolean }[] = [];
  beforeAll(async () => {
    runtime = await runtimeHarness();
    env = {
      DB: runtime.db as unknown as D1Database,
      ARTIFACTS: await runtime.mf.getR2Bucket('ARTIFACTS'),
      AI: {
        run: async (_model: string, input: { messages: { content: string }[] }) => {
          requests.push({
            text: input.messages[1].content,
            reduction: input.messages[0].content.includes('Combine the supplied'),
          });
          return {
            response: JSON.stringify({
              summary: 'A fixture summary supported by the supplied material.',
              topics: ['testing'],
              entities: [],
            }),
          };
        },
      },
    } as unknown as Env;
  });
  afterAll(async () => runtime?.close());
  beforeEach(() => {
    requests.length = 0;
  });
  it('starts truthful understanding from retained metadata while an optional provider fetch is deferred', async () => {
    const owner = 'understanding-deferred',
      principal = { userId: owner, contributor: 'test' };
    const item = (
      await save(env, principal, saveSchema.parse({ url: 'https://youtu.be/deferred123' }))
    ).body.item.id;
    await contribute(env, principal, item, {
      field: 'description',
      value: 'Source supplied description remains available during a public-page cooldown.',
      category: 'source',
      provenance: { method: 'feed-ingestion', inputContributionIds: [] },
    });
    await stmt(
      env.DB,
      'UPDATE jobs SET available_at=? WHERE item_id=?',
      new Date(Date.now() + 3600000).toISOString(),
      item
    ).run();
    await scheduleUnderstanding(env, owner);
    const job = await stmt(
      env.DB,
      "SELECT payload_json FROM jobs WHERE item_id=? AND json_extract(payload_json,'$.stage')='understanding'",
      item
    ).first<{ payload_json: string }>();
    expect(job).toBeTruthy();
    await processUnderstanding(env, owner, item, JSON.parse(job!.payload_json));
    const result = await getItem(env, owner, item);
    expect(result.content).toHaveProperty('summary');
    expect(result.enrichment.fields.summary.provenance).toHaveProperty('coverage', 'metadata_only');
    await scheduleUnderstanding(env, owner);
    const jobs = await stmt(
      env.DB,
      "SELECT COUNT(*) AS n FROM jobs WHERE item_id=? AND json_extract(payload_json,'$.stage')='understanding'",
      item
    ).first<{ n: number }>();
    expect(jobs!.n).toBe(1);
  });
  it('chunks Unicode without loss and keeps every model request within its byte bound', () => {
    const text = 'one🐱界 two '.repeat(7000);
    const chunks = understandingChunks(text);
    expect(chunks.join('')).toBe(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks)
      expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(16000);
  });
  it('processes every source chunk and reduces them without exposing private material to another owner', async () => {
    const owner = 'understanding-owner',
      principal = { userId: owner, contributor: 'test' };
    const saved = await save(
      env,
      principal,
      saveSchema.parse({ url: 'https://example.com/understanding-long' })
    );
    const material =
      'Article beginning. ' + 'Source-specific facts. '.repeat(2000) + ' Unique final source fact.';
    const source = await contribute(env, principal, saved.body.item.id, {
      field: 'article',
      value: { text: material },
      category: 'source',
      provenance: { method: 'fixture', inputContributionIds: [] },
    });
    const payload = { stage: 'understanding' as const, generation: 0, requestedRevision: 1 };
    await processUnderstanding(env, owner, saved.body.item.id, payload);
    let rounds = 0;
    while (
      (await stmt(
        env.DB,
        'SELECT status FROM understanding_runs WHERE item_id=?',
        saved.body.item.id
      ).first<string>('status')) !== 'succeeded'
    ) {
      const run = (await stmt(
        env.DB,
        'SELECT id FROM understanding_runs WHERE item_id=?',
        saved.body.item.id
      ).first<{ id: string }>())!;
      await processUnderstanding(env, owner, saved.body.item.id, { ...payload, runId: run.id });
      if (++rounds > 10) throw new Error('Reduction failed to converge');
    }
    const map = requests.filter((value) => !value.reduction);
    expect(map.map((value) => value.text).join('')).toBe(material);
    expect(requests.some((value) => value.reduction)).toBe(true);
    const item = await getItem(env, owner, saved.body.item.id);
    expect(item.content).toHaveProperty('summary');
    const provenance = item.enrichment.fields.summary.provenance as {
      inputContributionIds: string[];
      description: string;
      coverage: string;
    };
    expect(provenance.inputContributionIds).toEqual([source.id]);
    expect(provenance.coverage).toBe('article');
    const other = await save(
      env,
      { userId: 'understanding-other', contributor: 'test' },
      saveSchema.parse({ url: 'https://example.com/understanding-long' })
    );
    expect(
      (await getItem(env, 'understanding-other', other.body.item.id)).content
    ).not.toHaveProperty('summary');
    const calls = requests.length;
    await processUnderstanding(env, owner, saved.body.item.id, payload);
    expect(requests).toHaveLength(calls);
    await deleteItem(env, owner, saved.body.item.id);
    await save(env, principal, saveSchema.parse({ url: 'https://example.com/understanding-long' }));
    await expect(
      processUnderstanding(env, owner, saved.body.item.id, payload)
    ).rejects.toMatchObject({ code: 'stale_generation' });
  });
  it('labels description-only understanding instead of claiming article or transcript coverage', async () => {
    const owner = 'metadata-understanding';
    const saved = await save(
      env,
      { userId: owner, contributor: 'test' },
      saveSchema.parse({ url: 'https://example.com/description-only' })
    );
    await contribute(env, { userId: owner, contributor: 'test' }, saved.body.item.id, {
      field: 'description',
      value: 'A description of a video, without any transcript.',
      category: 'source',
      provenance: { method: 'fixture', inputContributionIds: [] },
    });
    await processUnderstanding(env, owner, saved.body.item.id, {
      stage: 'understanding',
      generation: 0,
      requestedRevision: 1,
    });
    const item = await getItem(env, owner, saved.body.item.id);
    const provenance = item.enrichment.fields.summary.provenance as {
      description: string;
      coverage: string;
    };
    expect(provenance.coverage).toBe('metadata_only');
  });
  it('does not mislabel podcast show notes as the actual audio discussion', async () => {
    const principal = { userId: 'podcast-notes-owner', contributor: 'test' };
    const saved = await save(
      env,
      principal,
      saveSchema.parse({ url: 'https://example.com/podcast-notes' })
    );
    await contribute(env, principal, saved.body.item.id, {
      field: 'type',
      value: 'podcast_episode',
      category: 'source',
      provenance: { method: 'fixture', inputContributionIds: [] },
    });
    const notes = await contribute(env, principal, saved.body.item.id, {
      field: 'article',
      value: { text: 'Published show notes and promotional links.' },
      category: 'source',
      provenance: { method: 'fixture', inputContributionIds: [] },
    });
    await processUnderstanding(env, principal.userId, saved.body.item.id, {
      stage: 'understanding',
      generation: 0,
      requestedRevision: 1,
    });
    const item = await getItem(env, principal.userId, saved.body.item.id);
    const provenance = item.enrichment.fields.summary.provenance as {
      coverage: string;
      sourceCoverage: string;
      inputContributionIds: string[];
    };
    expect(provenance.coverage).toBe('metadata_only');
    expect(provenance.sourceCoverage).toBe('partial');
    expect(provenance.inputContributionIds).toEqual([notes.id]);
  });
});
