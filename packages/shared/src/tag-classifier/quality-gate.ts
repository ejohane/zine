import { scoreReview, type ReviewLabels } from './review';

export type ReviewedPrediction = {
  bookmarkId: string;
  coverage: string;
  reviewed: boolean;
  suggestions: string[];
  labels: ReviewLabels;
};

/** Human review is necessary: unknown suggestions and unreviewed cases cannot pass. */
export function qualityGate(cases: ReviewedPrediction[]) {
  if (new Set(cases.map((c) => c.bookmarkId)).size !== cases.length)
    throw new Error('Duplicate evaluation bookmarks.');
  const rows = cases.map((c) => ({ ...c, score: scoreReview(c.suggestions, c.labels) }));
  const summarize = (items: typeof rows) => {
    const total = (field: 'useful' | 'unwanted' | 'unknown') =>
      items.reduce((n, r) => n + r.score[field].length, 0);
    const expected = items.reduce((n, r) => n + r.score.expected, 0);
    const recovered = items.reduce((n, r) => n + r.score.recovered, 0);
    const useful = total('useful'),
      unwanted = total('unwanted'),
      unknown = total('unknown');
    return {
      confirmedAbstentionCases: items.filter(
        (r) =>
          r.reviewed &&
          r.labels.exhaustive &&
          r.labels.expectedGroups.length === 0 &&
          r.labels.acceptable.length === 0
      ).length,
      correctAbstentions: items.filter(
        (r) =>
          r.reviewed &&
          r.labels.exhaustive &&
          r.labels.expectedGroups.length === 0 &&
          r.labels.acceptable.length === 0 &&
          r.suggestions.length === 0
      ).length,
      cases: items.length,
      reviewedCases: items.filter((r) => r.reviewed).length,
      useful,
      unwanted,
      unknown,
      expected,
      recovered,
      precision: useful + unwanted ? useful / (useful + unwanted) : null,
      recovery: expected ? recovered / expected : null,
      unwantedPerBookmark: items.length ? unwanted / items.length : null,
    };
  };
  const overall = summarize(rows);
  const byCoverage = Object.fromEntries(
    [...new Set(rows.map((r) => r.coverage))].map((coverage) => [
      coverage,
      summarize(rows.filter((r) => r.coverage === coverage)),
    ])
  );
  const reasons = [];
  if (cases.length < 40) reasons.push('At least forty independent holdout cases required.');
  if (overall.reviewedCases !== cases.length) reasons.push('Human review is incomplete.');
  if (overall.unknown) reasons.push('All generated suggestions must be judged.');
  if (overall.precision === null || overall.precision < 0.9)
    reasons.push('Precision must reach 90%.');
  if (overall.recovery === null || overall.recovery < 0.8)
    reasons.push('Expected-tag recovery must reach 80%.');
  return { passes: reasons.length === 0, reasons, overall, byCoverage };
}
