import { z } from 'zod';
import { PublicationIdSchema } from './publications';

export const DeliveryTimezoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid IANA timezone');
export const DeliveryPreferencesSchema = z
  .object({ timezone: DeliveryTimezoneSchema, initializeOnly: z.boolean().optional() })
  .strict();
export const PushInstallationInputSchema = z
  .object({
    token: z.string().regex(/^[a-fA-F0-9]{64,200}$/),
    environment: z.enum(['sandbox', 'production']),
  })
  .strict();
export const PushInstallationSchema = z
  .object({ id: PublicationIdSchema, enabled: z.boolean() })
  .strict();
export const IssueVisitInputSchema = z
  .object({ observedRevision: z.number().int().positive() })
  .strict();
export const IssueVisitSchema = z
  .object({ lastSeenRevision: z.number().int().positive().nullable() })
  .strict();
export const PublicationActivitySchema = z
  .object({
    id: PublicationIdSchema,
    publicationId: PublicationIdSchema,
    type: z.enum(['ISSUE_PUBLISHED', 'DAILY_ADDITIONS']),
    publicationName: z.string(),
    issueIds: z.array(PublicationIdSchema),
    selectionIds: z.array(PublicationIdSchema),
    createdAt: z.string().datetime(),
    readAt: z.string().datetime().nullable(),
    available: z.boolean(),
  })
  .strict();
export const DiscoveryReferenceSchema = z
  .object({
    id: PublicationIdSchema,
    publicationId: PublicationIdSchema,
    issueId: PublicationIdSchema,
    selectionId: PublicationIdSchema,
    publicationName: z.string(),
    issueTitle: z.string(),
    editorName: z.string(),
    commentary: z.string().nullable(),
    savedAt: z.string().datetime(),
    available: z.boolean(),
  })
  .strict();
export const SelectionSaveResultSchema = z
  .object({
    itemId: z.string(),
    userItemId: z.string(),
    status: z.enum(['created', 'already_bookmarked', 'rebookmarked']),
    discoveryReferences: z.array(DiscoveryReferenceSchema),
  })
  .strict();
export type PublicationActivity = z.infer<typeof PublicationActivitySchema>;
export type DiscoveryReference = z.infer<typeof DiscoveryReferenceSchema>;
export type SelectionSaveResult = z.infer<typeof SelectionSaveResultSchema>;

export const DeliveryPreferencesResourceSchema = z
  .object({ timezone: DeliveryTimezoneSchema, configured: z.boolean() })
  .strict();
