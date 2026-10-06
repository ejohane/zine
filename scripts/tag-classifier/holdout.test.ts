import { expect, test } from 'bun:test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import catalog from '../../packages/shared/src/tag-classifier/catalog.json';
import { freezeHoldout, evaluateHoldout } from './holdout';
import { hash } from './jev';
const input = {
  bookmarkId: 'a',
  itemId: 'b',
  title: 'Rust',
  description: 'Rust programming',
  text: '',
  contentType: 'VIDEO',
  provider: 'YOUTUBE',
  publisher: null,
  creator: null,
  coverage: 'DESCRIPTION_ONLY',
  warnings: [],
};
const review = () => ({
  version: 1,
  cases: Array.from({ length: 40 }, (_, i) => ({
    input: { ...input, bookmarkId: String(i) },
    reviewed: true,
    labels: { expectedGroups: [['rust']], acceptable: [], unwanted: [], exhaustive: false },
  })),
});
test('freeze rejects pending review and cannot overwrite an existing freeze', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zine-holdout-'));
  try {
    const path = join(dir, 'review.json'),
      cat = join(dir, 'catalog.json'),
      out = join(dir, 'frozen.json');
    await Bun.write(cat, JSON.stringify(catalog));
    const value = review();
    value.cases[0].reviewed = false;
    await Bun.write(path, JSON.stringify(value));
    await expect(freezeHoldout(path, cat, out)).rejects.toThrow();
    value.cases[0].reviewed = true;
    await Bun.write(path, JSON.stringify(value));
    await freezeHoldout(path, cat, out);
    await expect(freezeHoldout(path, cat, out)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('holdout evaluation rejects model runs predating frozen labels', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zine-holdout-'));
  try {
    const path = join(dir, 'review.json'),
      cat = join(dir, 'catalog.json'),
      out = join(dir, 'frozen.json'),
      runs = join(dir, 'runs');
    const value = review();
    await Bun.write(path, JSON.stringify(value));
    await Bun.write(cat, JSON.stringify(catalog));
    const frozen = await freezeHoldout(path, cat, out);
    await mkdir(runs);
    const c = value.cases[0];
    const run = {
      version: 1,
      policyVersion: frozen.policyVersion,
      catalog,
      input: c.input,
      inputHash: hash(c.input),
      catalogHash: hash(catalog),
      model: frozen.model,
      requestedModel: frozen.model,
      createdAt: '2000-01-01T00:00:00.000Z',
      latencyMs: 1,
      usage: { input_tokens: 1, output_tokens: 0 },
      pricePerMillionInputTokens: 0.042,
      estimatedCostUsd: 0,
      probabilities: Object.fromEntries(catalog.tags.map((t) => [t.id, 0.1])),
    };
    const file =
      hash({
        bookmark: c.input.bookmarkId,
        review: frozen.reviewHash,
        catalog: frozen.catalogHash,
        policy: frozen.policyVersion,
      }) + '.json';
    await Bun.write(join(runs, file), JSON.stringify(run));
    await expect(evaluateHoldout(out, runs)).rejects.toThrow('predates human-label freeze');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects changed frozen labels and supplemental review from another dataset', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zine-holdout-'));
  try {
    const path = join(dir, 'review.json'),
      cat = join(dir, 'catalog.json'),
      out = join(dir, 'frozen.json');
    await Bun.write(path, JSON.stringify(review()));
    await Bun.write(cat, JSON.stringify(catalog));
    const frozen = await freezeHoldout(path, cat, out);
    const extra = join(dir, 'extra.json');
    await Bun.write(extra, JSON.stringify({ reviewHash: 'wrong', cases: [] }));
    await expect(evaluateHoldout(out, join(dir, 'runs'), extra)).rejects.toThrow(
      'Supplemental review does not match'
    );
    frozen.review.cases[0].labels.expectedGroups = [['ai']];
    await Bun.write(out, JSON.stringify(frozen));
    await expect(evaluateHoldout(out, join(dir, 'runs'))).rejects.toThrow(
      'Frozen review/catalog/policy mismatch'
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
