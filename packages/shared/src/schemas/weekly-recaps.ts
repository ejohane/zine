import { z } from 'zod';
const instant = z.string().datetime();
export const WeeklyRecapWeekSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const WeeklyRecapTimezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'Expected an IANA timezone');
export const WeeklyRecapPreferencesInputSchema = z
  .object({ timezone: WeeklyRecapTimezoneSchema })
  .strict();
export const WeeklyRecapPreferencesSchema = z
  .object({
    timezone: WeeklyRecapTimezoneSchema,
    pendingTimezone: WeeklyRecapTimezoneSchema.nullable(),
    pendingEffectiveAt: instant.nullable(),
    trackingStartedAt: instant,
  })
  .strict();
export const WeeklyRecapEvidenceSchema = z
  .object({
    kind: z.enum(['SAVED', 'OPENED', 'FINISHED']),
    source: z.string(),
    observedAt: instant,
    legacy: z.boolean(),
  })
  .strict();
export const WeeklyRecapCandidateSchema = z
  .object({
    id: z.string().min(1),
    itemId: z.string().min(1),
    savedBookmarkId: z.string().nullable(),
    title: z.string(),
    creatorName: z.string().nullable(),
    contentType: z.string(),
    provider: z.string(),
    artworkUrl: z.string().nullable(),
    originalUrl: z.string().nullable().optional(),
    evidence: z.array(WeeklyRecapEvidenceSchema),
    publicationEligibility: z.enum([
      'CHECK_ON_SELECTION',
      'PRIVATE_SOURCE',
      'UNSAVED',
      'UNAVAILABLE',
    ]),
  })
  .strict();
export const WeeklyRecapCoverageSchema = z
  .object({
    state: z.enum(['COMPLETE', 'PARTIAL', 'LEGACY_SNAPSHOT']),
    reliableSince: instant,
    limitations: z.array(z.string()),
  })
  .strict();
export const WeeklyRecapSchema = z
  .object({
    id: z.string().min(1),
    weekStart: WeeklyRecapWeekSchema,
    timezone: WeeklyRecapTimezoneSchema,
    startAt: instant,
    endAt: instant,
    generatedAt: instant,
    coverage: WeeklyRecapCoverageSchema,
    candidates: z.array(WeeklyRecapCandidateSchema),
    highlights: z.array(
      z.object({ label: z.string(), count: z.number().int().nonnegative() }).strict()
    ),
    selectedCandidateIds: z.array(z.string()).length(0),
    issueId: z.string().nullable(),
  })
  .strict();
export const CreateWeeklyRecapIssueSchema = z
  .object({
    selectedCandidateIds: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate candidates'),
    title: z.string().max(160).optional(),
  })
  .strict();
export const WeeklyRecapPageInputSchema = z
  .object({
    cursor: WeeklyRecapWeekSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type WeeklyRecap = z.infer<typeof WeeklyRecapSchema>;
export type WeeklyRecapCandidate = z.infer<typeof WeeklyRecapCandidateSchema>;
export type WeeklyRecapEvidence = z.infer<typeof WeeklyRecapEvidenceSchema>;
export type WeeklyRecapPreferences = z.infer<typeof WeeklyRecapPreferencesSchema>;
