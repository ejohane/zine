import { describe, expect, test } from 'bun:test';
import {
  CatalogSchema,
  DatasetSchema,
  InputSchema,
  evaluateCase,
  questionsFor,
  selectTags,
} from '../../packages/shared/src/tag-classifier/core';
import catalogJson from '../../packages/shared/src/tag-classifier/catalog.json';
import { classify } from './jev';
import { boundText, cleanText, openLocal } from './local';
const catalog = CatalogSchema.parse(catalogJson);
const input = InputSchema.parse({
  bookmarkId: 'bookmark',
  itemId: 'item',
  title: 'A bicycle repair guide',
  description: null,
  text: 'Adjust the brakes and lubricate the chain.',
  contentType: 'ARTICLE',
  provider: 'WEB',
  publisher: null,
  creator: null,
  coverage: 'FULL_CONTENT',
  warnings: [],
});
const response = () => ({
  model: 'jev-1.13.0',
  answers: Object.fromEntries(
    catalog.tags.map((t) => [t.id, { type: 'noul', noul: t.id === 'cycling' ? 0.95 : 0.05 }])
  ),
  usage: { input_tokens: 20000, output_tokens: 900 },
});
const fetcher = (data: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(data), { status })) as (
    url: string,
    init?: RequestInit
  ) => Promise<Response>;
describe('topic classification', () => {
  test('catalog is large, unique, and fits conservative question byte budget', () => {
    expect(catalog.tags.length).toBeGreaterThanOrEqual(200);
    expect(Buffer.byteLength(JSON.stringify(questionsFor(catalog)))).toBeLessThan(180000);
    expect(() =>
      CatalogSchema.parse({ ...catalog, tags: [...catalog.tags, catalog.tags[0]] })
    ).toThrow();
  });
  test('questions include definitions rather than relying on hidden IDs', () => {
    const q = questionsFor(catalog);
    expect(q.cycling.instructions).toContain('Cycling');
    expect(q.cycling.instructions).toContain(
      catalog.tags.find((t) => t.id === 'cycling')!.definition
    );
    expect(q.cycling.criteria.false).toContain('merely mentioned');
  });
  test('revised policy accepts short evidence while excluding incidental mentions', () => {
    const q = questionsFor(catalog);
    expect(catalog.version).toBe(2);
    for (const id of ['postgresql', 'playwright', 'agent-harnesses', 'strength-training'])
      expect(q[id]).toBeDefined();
    expect(q.rust.criteria.true).toContain('Short evidence is sufficient');
    expect(q.rust.criteria.false).toContain('Do not infer unseen content');
  });
  test('selection permits none and many, rejects invalid thresholds', () => {
    expect(selectTags({ a: 0.1 }, 0.8)).toEqual([]);
    expect(selectTags({ a: 0.9, b: 0.95, c: 0.1 }, 0.8)).toEqual(['b', 'a']);
    expect(() => selectTags({}, NaN)).toThrow();
  });
  test('validates complete real-client response and measures cost', async () => {
    const run = await classify(input, catalog, {
      apiKey: 'test',
      model: 'jev-1.13.0',
      price: 0.042,
      fetcher: fetcher(response()),
    });
    expect(selectTags(run.probabilities, 0.8)).toEqual(['cycling']);
    expect(run.estimatedCostUsd).toBeCloseTo(0.00084);
    expect(run.input).toEqual(input);
  });
  test('only sends allowlisted state fields to the fixed API', async () => {
    await classify(input, catalog, {
      apiKey: 'test',
      model: 'jev-1.13.0',
      price: 0.042,
      fetcher: (async (url, init) => {
        expect(url).toBe('https://api.typesafe.ai/v1/systemone');
        const body = JSON.parse(String(init?.body));
        expect(body.state.bookmarkId).toBeUndefined();
        expect(body.state.provider).toBeUndefined();
        expect(body.state.text).toBe(input.text);
        return new Response(JSON.stringify(response()));
      }) as (url: string, init?: RequestInit) => Promise<Response>,
    });
  });
  test('rejects missing, unexpected, and invalid probabilities', async () => {
    for (const change of ['missing', 'extra', 'invalid']) {
      const data = response();
      if (change === 'missing') delete data.answers.cycling;
      if (change === 'extra') data.answers.unknown = { type: 'noul', noul: 0.5 };
      if (change === 'invalid') data.answers.cycling.noul = 2;
      await expect(
        classify(input, catalog, {
          apiKey: 'test',
          model: 'jev',
          price: 0.042,
          fetcher: fetcher(data),
        })
      ).rejects.toThrow();
    }
  });
  test('credential and service failures are actionable and never echo bodies', async () => {
    await expect(classify(input, catalog, { model: 'jev', price: 0.042 })).rejects.toThrow(
      'TYPESAFE_API_KEY'
    );
    for (const status of [401, 422, 429, 529, 500])
      await expect(
        classify(input, catalog, {
          apiKey: 'test',
          model: 'jev',
          price: 0.042,
          fetcher: fetcher('secret must not appear', status),
        })
      ).rejects.toThrow(`HTTP ${status}`);
    await expect(
      classify(input, catalog, {
        apiKey: 'test',
        model: 'jev',
        price: 0.042,
        fetcher: (async () => {
          throw new Error('sensitive transport data');
        }) as (url: string, init?: RequestInit) => Promise<Response>,
      })
    ).rejects.toThrow('timed out');
  });
  test('evaluation distinguishes acceptable, wrong, and missing topics', () => {
    expect(evaluateCase(['a', 'b', 'd'], ['a', 'c'], ['b'])).toEqual({
      suggested: 3,
      useful: 2,
      expected: 2,
      recovered: 1,
      wrong: ['d'],
      missed: ['c'],
    });
  });
  test('strips unsafe boilerplate and bounds Unicode without broken characters', () => {
    expect(cleanText('<p>Hello</p><script>evil()</script><nav>menu</nav>')).toBe('Hello');
    const bounded = boundText('🚲'.repeat(20000));
    expect(Buffer.byteLength(bounded.text)).toBeLessThan(24000);
    expect(bounded.truncated).toBe(true);
    expect(bounded.text).not.toContain('�');
    expect(boundText('hello').truncated).toBe(false);
  });
  test('absent local snapshot fails instead of creating one', async () => {
    await expect(openLocal('/nonexistent-zine-classifier-state')).rejects.toThrow(
      'snapshot missing'
    );
  });
  test('dataset parses labels independent from generated probabilities', () => {
    expect(
      DatasetSchema.parse({ version: 1, reviewed: true, cases: [{ input, expected: ['cycling'] }] })
        .cases[0].acceptable
    ).toEqual([]);
  });
});
