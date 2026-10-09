import { z } from 'zod';

export const PublicationIdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const text = (max: number) =>
  z
    .string()
    .transform((s) => s.normalize('NFC').trim())
    .refine((s) => [...s].length <= max);
const optionalText = (max: number) =>
  text(max)
    .nullable()
    .transform((s) => s || null);
const revision = z.number().int().positive();
const id = PublicationIdSchema;
const asset = id.nullable();
export const PublicationPresentationSchema = z
  .object({
    editorName: text(80).refine((s) => s.length > 0),
    displayName: optionalText(80),
    description: optionalText(500),
    coverAssetId: asset,
  })
  .strict();
export const CreatePublicationSchema = PublicationPresentationSchema;
export const PatchPublicationSchema = PublicationPresentationSchema.extend({
  expectedRevision: revision,
}).strict();
export const CreateIssueSchema = z
  .object({ kind: z.literal('INDEPENDENT'), title: text(160).default('') })
  .strict();
export const IssueOperationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('setPresentation'),
      title: text(160).optional(),
      introduction: optionalText(5000).optional(),
      coverAssetId: asset.optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('addSection'), sectionId: id, heading: optionalText(120).optional() })
    .strict(),
  z
    .object({ type: z.literal('setSectionHeading'), sectionId: id, heading: optionalText(120) })
    .strict(),
  z.object({ type: z.literal('removeSection'), sectionId: id }).strict(),
  z
    .object({
      type: z.literal('addSelection'),
      selectionId: id,
      sectionId: id,
      bookmarkId: z.string().min(1),
      commentary: optionalText(2000).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('setCommentary'), selectionId: id, commentary: optionalText(2000) })
    .strict(),
  z.object({ type: z.literal('removeSelection'), selectionId: id }).strict(),
  z
    .object({
      type: z.literal('setOrder'),
      sections: z
        .array(z.object({ sectionId: id, selectionIds: z.array(id).max(100) }).strict())
        .min(1)
        .max(20),
    })
    .strict(),
]);
export const PatchIssueSchema = z
  .object({ expectedRevision: revision, operations: z.array(IssueOperationSchema).min(1).max(100) })
  .strict();
export const PublishIssueSchema = z.object({ expectedRevision: revision }).strict();
export const SubscriptionPreferenceSchema = z.object({ muted: z.boolean() }).strict();
export const PublicationPageInputSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(200).optional(),
  })
  .strict();
export const IdempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7e]+$/);
export const PublicPublicationSchema = z
  .object({
    id,
    handle: z.string(),
    displayName: z.string(),
    description: z.string().nullable(),
    coverUrl: z.string().nullable(),
    editor: z.object({ displayName: z.string() }).strict(),
  })
  .strict();
export const OwnerPublicationSchema = PublicPublicationSchema.extend({
  revision,
  coverAssetId: asset,
}).strict();
export const PublicSelectionSchema = z
  .object({
    id,
    contentType: z.enum(['ARTICLE', 'VIDEO', 'PODCAST', 'POST']),
    title: z.string(),
    creatorName: z.string(),
    sourceName: z.string(),
    originalUrl: z.string().url(),
    artworkUrl: z.string().nullable(),
    commentary: z.string().nullable(),
    firstPublishedRevision: revision.nullable(),
    originalAvailability: z.enum(['UNKNOWN', 'AVAILABLE', 'UNAVAILABLE']),
  })
  .strict();
export const PublicSectionSchema = z
  .object({ id, heading: z.string().nullable(), selections: z.array(PublicSelectionSchema) })
  .strict();
export const PublicIssueSchema = z
  .object({
    id,
    publication: PublicPublicationSchema,
    kind: z.enum(['WEEKLY', 'INDEPENDENT']),
    title: z.string(),
    coverUrl: z.string().nullable(),
    introduction: z.string().nullable(),
    revision,
    publishedAt: z.string().datetime().nullable(),
    sections: z.array(PublicSectionSchema),
  })
  .strict();
export const OwnerSelectionSchema = PublicSelectionSchema.extend({
  itemId: z.string(),
  bookmarkId: z.string().nullable(),
}).strict();
export const OwnerIssueSchema = PublicIssueSchema.extend({
  status: z.enum(['DRAFT', 'PUBLISHED']),
  coverAssetId: asset,
  weeklyWindowId: z.string().nullable(),
  sections: z.array(
    PublicSectionSchema.extend({ selections: z.array(OwnerSelectionSchema) }).strict()
  ),
}).strict();
export const PublicationSubscriptionSchema = z
  .object({
    publicationId: id,
    subscribed: z.boolean(),
    muted: z.boolean(),
    generation: z.number().int().nonnegative(),
    subscribedAt: z.string().datetime().nullable(),
  })
  .strict();
export const PublicationEventKindSchema = z.enum([
  'ISSUE_PUBLISHED',
  'SELECTIONS_ADDED',
  'ISSUE_CORRECTED',
  'SELECTIONS_REMOVED',
  'ISSUE_UNAVAILABLE',
]);
export const PublicationEventSchema = z
  .object({
    id,
    cursor: z.number().int().positive(),
    publicationId: id,
    issueId: id,
    revision,
    kind: PublicationEventKindSchema,
    selectionIds: z.array(id),
    occurredAt: z.string().datetime(),
  })
  .strict();
export const PublicationErrorSchema = z
  .object({
    error: z.string(),
    code: z.string(),
    requestId: z.string().optional(),
    traceId: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  })
  .strict();
/** Internal availability result used when retained reader attribution resolves a removed source. */
export const PublicationAvailabilitySchema = z
  .object({
    publicationId: id,
    issueId: id.optional(),
    available: z.boolean(),
  })
  .strict();
export type IssueOperation = z.infer<typeof IssueOperationSchema>;
export type PublicIssue = z.infer<typeof PublicIssueSchema>;
export type PublicPublication = z.infer<typeof PublicPublicationSchema>;
export type OwnerIssue = z.infer<typeof OwnerIssueSchema>;
export type PublicationEvent = z.infer<typeof PublicationEventSchema>;
