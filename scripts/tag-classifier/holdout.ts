import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  InputSchema,
  CatalogSchema,
  RunSchema,
  POLICY_VERSION,
  selectTags,
} from '../../packages/shared/src/tag-classifier/core';
import { ReviewLabelsSchema } from '../../packages/shared/src/tag-classifier/review';
import { qualityGate } from '../../packages/shared/src/tag-classifier/quality-gate';
import { classify, hash } from './jev';

export const HoldoutSchema = z
  .object({
    version: z.literal(1),
    cases: z
      .array(
        z.object({ input: InputSchema, labels: ReviewLabelsSchema, reviewed: z.literal(true) })
      )
      .min(40),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.cases.map((c) => c.input.bookmarkId)).size !== value.cases.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate holdout bookmarks.' });
  });
const FrozenSchema = z.object({
  version: z.literal(1),
  frozenAt: z.string().datetime(),
  reviewHash: z.string(),
  catalogHash: z.string(),
  policyVersion: z.number(),
  model: z.string(),
  threshold: z.number().min(0).max(1),
  review: HoldoutSchema,
  catalog: CatalogSchema,
});

export async function freezeHoldout(reviewPath: string, catalogPath: string, out: string) {
  const review = HoldoutSchema.parse(await Bun.file(reviewPath).json());
  const catalog = CatalogSchema.parse(await Bun.file(catalogPath).json());
  const ids = new Set(catalog.tags.map((t) => t.id));
  for (const c of review.cases)
    for (const id of [
      ...c.labels.expectedGroups.flat(),
      ...c.labels.acceptable,
      ...c.labels.unwanted,
    ])
      if (!ids.has(id)) throw new Error(`Unknown reviewed tag: ${id}`);
  const frozen = {
    version: 1,
    frozenAt: new Date().toISOString(),
    reviewHash: hash(review),
    catalogHash: hash(catalog),
    policyVersion: POLICY_VERSION,
    model: 'jev-1.13.0',
    threshold: 0.8,
    review,
    catalog,
  };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(frozen, null, 2) + '\n', { flag: 'wx' });
  return frozen;
}

export async function evaluateHoldout(frozenPath: string, out: string, extraReviewPath?: string) {
  const frozen = FrozenSchema.parse(await Bun.file(frozenPath).json());
  if (
    frozen.reviewHash !== hash(frozen.review) ||
    frozen.catalogHash !== hash(frozen.catalog) ||
    frozen.policyVersion !== POLICY_VERSION
  )
    throw new Error('Frozen review/catalog/policy mismatch.');
  const extraReview = extraReviewPath
    ? z
        .object({
          reviewHash: z.string(),
          cases: z.array(
            z.object({
              bookmarkId: z.string(),
              useful: z.array(z.string()),
              unwanted: z.array(z.string()),
            })
          ),
        })
        .parse(await Bun.file(extraReviewPath).json())
    : undefined;
  if (
    extraReview &&
    (extraReview.reviewHash !== frozen.reviewHash ||
      new Set(extraReview.cases.map((c) => c.bookmarkId)).size !== extraReview.cases.length ||
      extraReview.cases.some(
        (c) => !frozen.review.cases.some((f) => f.input.bookmarkId === c.bookmarkId)
      ))
  )
    throw new Error('Supplemental review does not match frozen holdout.');
  await mkdir(out, { recursive: true });
  const rows = [];
  let cost = 0,
    latency = 0;
  for (const c of frozen.review.cases) {
    const path = join(
      out,
      hash({
        bookmark: c.input.bookmarkId,
        review: frozen.reviewHash,
        catalog: frozen.catalogHash,
        policy: frozen.policyVersion,
      }) + '.json'
    );
    const run = existsSync(path)
      ? RunSchema.parse(await Bun.file(path).json())
      : await classify(c.input, frozen.catalog, {
          apiKey: process.env.TYPESAFE_API_KEY,
          model: frozen.model,
          price: 0.042,
        });
    if (
      run.inputHash !== hash(c.input) ||
      run.inputHash !== hash(run.input) ||
      run.catalogHash !== frozen.catalogHash ||
      hash(run.catalog) !== frozen.catalogHash ||
      run.policyVersion !== frozen.policyVersion ||
      run.requestedModel !== frozen.model ||
      !Number.isFinite(Date.parse(run.createdAt)) ||
      run.model !== frozen.model ||
      Date.parse(run.createdAt) < Date.parse(frozen.frozenAt)
    )
      throw new Error('Run is incompatible or predates human-label freeze.');
    if (!existsSync(path))
      await writeFile(path, JSON.stringify(run, null, 2) + '\n', { flag: 'wx' });
    cost += run.estimatedCostUsd;
    latency += run.latencyMs;
    const suggestions = selectTags(run.probabilities, frozen.threshold);
    const extra = extraReview?.cases.find((r) => r.bookmarkId === c.input.bookmarkId);
    if (extra && [...extra.useful, ...extra.unwanted].some((id) => !suggestions.includes(id)))
      throw new Error('Supplemental judgments must describe generated suggestions.');
    const labels = ReviewLabelsSchema.parse({
      ...c.labels,
      acceptable: [...c.labels.acceptable, ...(extra?.useful ?? [])],
      unwanted: [...c.labels.unwanted, ...(extra?.unwanted ?? [])],
    });
    rows.push({
      bookmarkId: c.input.bookmarkId,
      coverage: c.input.coverage,
      reviewed: c.reviewed,
      labels,
      suggestions,
    });
  }
  const report = {
    version: 1,
    supplementalReviewHash: extraReview ? hash(extraReview) : null,
    frozenAt: frozen.frozenAt,
    reviewHash: frozen.reviewHash,
    catalogHash: frozen.catalogHash,
    policyVersion: frozen.policyVersion,
    model: frozen.model,
    threshold: frozen.threshold,
    estimatedCostUsd: cost,
    apiLatencyMs: latency,
    ...qualityGate(rows),
    rows,
  };
  await writeFile(join(out, 'quality-report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'freeze' && args.length === 3)
    console.log(
      JSON.stringify({ reviewHash: (await freezeHoldout(args[0], args[1], args[2])).reviewHash })
    );
  else if (command === 'eval' && (args.length === 2 || args.length === 3)) {
    const result = await evaluateHoldout(args[0], args[1], args[2]);
    console.log(
      JSON.stringify({ passes: result.passes, reasons: result.reasons, overall: result.overall })
    );
  } else
    throw new Error(
      'Usage: holdout.ts freeze REVIEW CATALOG OUTPUT | eval FROZEN_REVIEW RUN_DIRECTORY [EXTRA_SUGGESTION_REVIEW]'
    );
}
