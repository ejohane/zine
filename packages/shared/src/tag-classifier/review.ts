import { z } from 'zod';

/** Labels describe human judgments, not model output. Each group requires one match. */
export const ReviewLabelsSchema = z
  .object({
    expectedGroups: z.array(z.array(z.string().min(1)).min(1)),
    acceptable: z.array(z.string().min(1)),
    unwanted: z.array(z.string().min(1)),
    exhaustive: z.boolean(),
  })
  .superRefine((labels, ctx) => {
    const positives = [...labels.expectedGroups.flat(), ...labels.acceptable];
    if (labels.unwanted.some((id) => positives.includes(id)))
      ctx.addIssue({ code: 'custom', message: 'A tag cannot be both useful and unwanted.' });
    const grouped = labels.expectedGroups.flat();
    if (new Set(grouped).size !== grouped.length)
      ctx.addIssue({ code: 'custom', message: 'Expected alternatives must not overlap.' });
  });
export type ReviewLabels = z.infer<typeof ReviewLabelsSchema>;

/** Aliases map human wording to canonical IDs; they never create extra predictions. */
export function scoreReview(
  suggestions: string[],
  rawLabels: ReviewLabels,
  aliases: Record<string, string> = {}
) {
  const canonical = (id: string) => aliases[id] ?? id;
  const labels = ReviewLabelsSchema.parse({
    ...rawLabels,
    expectedGroups: rawLabels.expectedGroups.map((group) => [...new Set(group.map(canonical))]),
    acceptable: rawLabels.acceptable.map(canonical),
    unwanted: rawLabels.unwanted.map(canonical),
  });
  const selected = [...new Set(suggestions.map(canonical))];
  const usefulIds = new Set([...labels.expectedGroups.flat(), ...labels.acceptable]);
  const rejectedIds = new Set(labels.unwanted);
  const useful = selected.filter((id) => usefulIds.has(id));
  const unwanted = selected.filter(
    (id) => rejectedIds.has(id) || (labels.exhaustive && !usefulIds.has(id))
  );
  const unknown = selected.filter((id) => !useful.includes(id) && !unwanted.includes(id));
  const missedGroups = labels.expectedGroups.filter(
    (group) => !group.some((id) => selected.includes(id))
  );
  const recovered = labels.expectedGroups.length - missedGroups.length;
  const reviewed = useful.length + unwanted.length;
  return {
    useful,
    unwanted,
    unknown,
    missedGroups,
    expected: labels.expectedGroups.length,
    recovered,
    reviewedPrecision: reviewed ? useful.length / reviewed : null,
    recovery: labels.expectedGroups.length ? recovered / labels.expectedGroups.length : null,
    reviewCoverage: selected.length ? reviewed / selected.length : null,
    completeForPrecision: unknown.length === 0,
  };
}
