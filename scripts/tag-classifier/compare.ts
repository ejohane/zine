import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  InputSchema,
  RunSchema,
  selectTags,
  type ClassificationRun,
} from '../../packages/shared/src/tag-classifier/core';
import { ReviewLabelsSchema, scoreReview } from '../../packages/shared/src/tag-classifier/review';
import { hash } from './jev';

export const DevelopmentReviewSchema = z.object({
  version: z.literal(1),
  cases: z
    .array(z.object({ input: InputSchema, labels: ReviewLabelsSchema, reviewed: z.literal(true) }))
    .min(1),
});
export function compareReviewedCase(
  input: z.infer<typeof InputSchema>,
  labels: z.infer<typeof ReviewLabelsSchema>,
  baseline: ClassificationRun,
  candidate: ClassificationRun,
  threshold = 0.8
) {
  for (const run of [baseline, candidate])
    if (
      run.inputHash !== hash(input) ||
      run.inputHash !== hash(run.input) ||
      run.catalogHash !== hash(run.catalog)
    )
      throw new Error('Comparison input/catalog hash mismatch.');
  const ids = (run: ClassificationRun) => new Set(run.catalog.tags.map((t) => t.id));
  const a = ids(baseline),
    b = ids(candidate);
  const commonGroups = labels.expectedGroups.filter(
    (group) => group.some((id) => a.has(id)) && group.some((id) => b.has(id))
  );
  const score = (run: ClassificationRun) => {
    const selected = selectTags(run.probabilities, threshold);
    return {
      suggestions: selected,
      ...scoreReview(selected, labels),
      commonVocabulary: scoreReview(selected, { ...labels, expectedGroups: commonGroups }),
      unavailableExpectedGroups: labels.expectedGroups.filter(
        (group) => !group.some((id) => ids(run).has(id))
      ),
    };
  };
  return {
    bookmarkId: input.bookmarkId,
    title: input.title,
    coverage: input.coverage,
    baseline: score(baseline),
    candidate: score(candidate),
  };
}
async function readRuns(directory: string) {
  const runs: ClassificationRun[] = [];
  for (const name of (await readdir(directory)).filter((n) => n.endsWith('.json'))) {
    const raw = await Bun.file(join(directory, name)).json();
    if (raw.probabilities !== undefined) runs.push(RunSchema.parse(raw));
  }
  if (!runs.length) throw new Error('No classification runs in comparison directory.');
  if (
    new Set(runs.map((r) => `${r.catalogHash}:${r.policyVersion}:${r.model}:${r.requestedModel}`))
      .size !== 1
  )
    throw new Error('Comparison directory mixes catalog, policy, or model versions.');
  return runs;
}
export async function compareDevelopment(
  reviewPath: string,
  baselineDirectory: string,
  candidateDirectory: string,
  out: string
) {
  const review = DevelopmentReviewSchema.parse(await Bun.file(reviewPath).json());
  if (new Set(review.cases.map((c) => c.input.bookmarkId)).size !== review.cases.length)
    throw new Error('Duplicate reviewed bookmarks.');
  const [a, b] = await Promise.all([readRuns(baselineDirectory), readRuns(candidateDirectory)]);
  const match = (runs: ClassificationRun[], id: string) => {
    const matches = runs.filter((r) => r.input.bookmarkId === id);
    if (matches.length !== 1)
      throw new Error('Each reviewed bookmark needs exactly one run per variant.');
    return matches[0];
  };
  const rows = review.cases.map((c) =>
    compareReviewedCase(
      c.input,
      c.labels,
      match(a, c.input.bookmarkId),
      match(b, c.input.bookmarkId)
    )
  );
  const summary = (side: 'baseline' | 'candidate', subset = rows) => {
    const scores = subset.map((r) => r[side]);
    const useful = scores.reduce((n, s) => n + s.useful.length, 0),
      unwanted = scores.reduce((n, s) => n + s.unwanted.length, 0),
      unknown = scores.reduce((n, s) => n + s.unknown.length, 0),
      expected = scores.reduce((n, s) => n + s.expected, 0),
      recovered = scores.reduce((n, s) => n + s.recovered, 0),
      commonExpected = scores.reduce((n, s) => n + s.commonVocabulary.expected, 0),
      commonRecovered = scores.reduce((n, s) => n + s.commonVocabulary.recovered, 0);
    const runs = subset.map((c) => match(side === 'baseline' ? a : b, c.bookmarkId));
    const latency = runs.map((r) => r.latencyMs).sort((x, y) => x - y);
    return {
      suggestions: useful + unwanted + unknown,
      useful,
      unwanted,
      unknown,
      reviewedPrecision: useful + unwanted ? useful / (useful + unwanted) : null,
      reviewCoverage:
        useful + unwanted + unknown ? (useful + unwanted) / (useful + unwanted + unknown) : null,
      expected,
      recovered,
      recovery: expected ? recovered / expected : null,
      commonExpected,
      commonRecovered,
      commonVocabularyRecovery: commonExpected ? commonRecovered / commonExpected : null,
      estimatedCostUsd: runs.reduce((n, r) => n + r.estimatedCostUsd, 0),
      medianLatencyMs:
        (latency[Math.floor((latency.length - 1) / 2)] + latency[Math.floor(latency.length / 2)]) /
        2,
      catalogHash: runs[0].catalogHash,
      policyVersion: runs[0].policyVersion,
      model: runs[0].model,
    };
  };
  const report = {
    version: 1,
    evaluationRole: 'DEVELOPMENT_ONLY',
    reviewHash: hash(review),
    threshold: 0.8,
    baseline: summary('baseline'),
    candidate: summary('candidate'),
    byCoverage: Object.fromEntries(
      [...new Set(rows.map((r) => r.coverage))].map((coverage) => [
        coverage,
        {
          baseline: summary(
            'baseline',
            rows.filter((r) => r.coverage === coverage)
          ),
          candidate: summary(
            'candidate',
            rows.filter((r) => r.coverage === coverage)
          ),
        },
      ])
    ),
    rows,
  };
  await Bun.write(out, JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (import.meta.main) {
  const [review, baseline, candidate, out] = process.argv.slice(2);
  if (!review || !baseline || !candidate || !out)
    throw new Error('Usage: compare.ts REVIEW BASELINE_RUNS CANDIDATE_RUNS REPORT');
  const report = await compareDevelopment(review, baseline, candidate, out);
  console.log(JSON.stringify({ baseline: report.baseline, candidate: report.candidate }));
}
