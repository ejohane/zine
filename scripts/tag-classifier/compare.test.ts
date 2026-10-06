import { expect, test } from 'bun:test';
import {
  CatalogSchema,
  InputSchema,
  RunSchema,
} from '../../packages/shared/src/tag-classifier/core';
import baseline from '../../packages/shared/src/tag-classifier/catalog-v1.json';
import candidate from '../../packages/shared/src/tag-classifier/catalog.json';
import { hash } from './jev';
import { compareReviewedCase } from './compare';
const input = InputSchema.parse({
  bookmarkId: 'x',
  itemId: 'y',
  title: 'Postgres',
  description: null,
  text: 'SQL query',
  contentType: 'ARTICLE',
  provider: 'WEB',
  publisher: null,
  creator: null,
  coverage: 'FULL_CONTENT',
  warnings: [],
});
function run(raw: unknown, selected: string[]) {
  const catalog = CatalogSchema.parse(raw);
  return RunSchema.parse({
    version: 1,
    policyVersion: catalog.version,
    catalog,
    input,
    inputHash: hash(input),
    catalogHash: hash(catalog),
    model: 'jev-1.13.0',
    requestedModel: 'jev-1.13.0',
    createdAt: '2026-10-05T00:00:00Z',
    latencyMs: 100,
    usage: { input_tokens: 100, output_tokens: 0 },
    pricePerMillionInputTokens: 0.042,
    estimatedCostUsd: 0.0000042,
    probabilities: Object.fromEntries(
      catalog.tags.map((t) => [t.id, selected.includes(t.id) ? 0.9 : 0.1])
    ),
  });
}
test('comparison separates catalog gaps and common vocabulary improvement', () => {
  const labels = {
    expectedGroups: [['sql'], ['postgresql']],
    acceptable: [],
    unwanted: [],
    exhaustive: false,
  };
  const result = compareReviewedCase(
    input,
    labels,
    run(baseline, ['sql']),
    run(candidate, ['sql', 'postgresql', 'strategy'])
  );
  expect(result.baseline.recovered).toBe(1);
  expect(result.candidate.recovered).toBe(2);
  expect(result.baseline.unavailableExpectedGroups).toEqual([['postgresql']]);
  expect(result.baseline.commonVocabulary.recovered).toBe(1);
  expect(result.candidate.commonVocabulary.recovered).toBe(1);
  expect(result.candidate.unknown).toEqual(['strategy']);
  expect(result.candidate.unwanted).toEqual([]);
});
test('comparison rejects source mismatch instead of attributing content changes to policy', () => {
  const a = run(baseline, ['sql']);
  a.inputHash = 'bad';
  expect(() =>
    compareReviewedCase(
      input,
      { expectedGroups: [], acceptable: [], unwanted: [], exhaustive: false },
      a,
      run(candidate, [])
    )
  ).toThrow('hash mismatch');
});
