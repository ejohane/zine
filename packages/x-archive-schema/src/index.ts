import { z } from 'zod';

export const X_ARCHIVE_SCHEMA_VERSION = 2;
export const X_ARCHIVE_MAX_TIMELINE_ITEMS_PER_CHUNK = 25;
export const X_ARCHIVE_MAX_POSTS_PER_CHUNK = 75;

const OptionalUrlSchema = z.string().url().nullable().optional();
const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), {
    message: 'Expected an HTTP(S) URL',
  });
const OptionalHttpUrlSchema = HttpUrlSchema.nullable().optional();

export const XPostKindSchema = z.enum(['POST', 'REPLY', 'REPOST', 'QUOTE']);
export type XPostKind = z.infer<typeof XPostKindSchema>;

export const XPostRelationshipTypeSchema = z.enum(['REPLY_TO', 'REPOST_OF', 'QUOTE_OF']);
export type XPostRelationshipType = z.infer<typeof XPostRelationshipTypeSchema>;

export const XAuthorSchema = z
  .object({
    id: z.string().min(1).nullable().optional(),
    username: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    profileUrl: OptionalUrlSchema,
    profileImageUrl: OptionalUrlSchema,
    verified: z.boolean().nullable().optional(),
  })
  .strict();
export type XAuthor = z.infer<typeof XAuthorSchema>;

export const XMediaSchema = z
  .object({
    type: z.enum(['IMAGE', 'VIDEO', 'GIF', 'UNKNOWN']),
    url: z.string().url(),
    previewUrl: OptionalUrlSchema,
    altText: z.string().max(10_000).nullable().optional(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();
export type XMedia = z.infer<typeof XMediaSchema>;

export const XPostLinkSourceSchema = z.enum(['TEXT', 'CARD']);
export type XPostLinkSource = z.infer<typeof XPostLinkSourceSchema>;

export const XPostLinkCardSchema = z
  .object({
    title: z.string().trim().min(1).max(500).nullable().optional(),
    description: z.string().trim().min(1).max(2_000).nullable().optional(),
    domain: z.string().trim().min(1).max(253).nullable().optional(),
    imageUrl: OptionalUrlSchema,
  })
  .strict();
export type XPostLinkCard = z.infer<typeof XPostLinkCardSchema>;

export const XPostLinkSchema = z
  .object({
    /** Best destination exposed by the rendered post DOM. May still be a t.co URL. */
    url: HttpUrlSchema,
    /** Stable comparison form with fragments and known tracking parameters removed. */
    normalizedUrl: HttpUrlSchema,
    /** Human-readable URL text rendered by X, when present. */
    displayUrl: z.string().trim().min(1).max(1_000).nullable().optional(),
    /** Redirect URL observed in the DOM when `url` could be expanded to a destination. */
    redirectUrl: OptionalHttpUrlSchema,
    source: XPostLinkSourceSchema.default('TEXT'),
    card: XPostLinkCardSchema.nullable().optional(),
  })
  .strict();
export type XPostLink = z.infer<typeof XPostLinkSchema>;

export const XPostRelationshipSchema = z
  .object({
    type: XPostRelationshipTypeSchema,
    tweetId: z.string().min(1).max(64),
    url: OptionalUrlSchema,
  })
  .strict();
export type XPostRelationship = z.infer<typeof XPostRelationshipSchema>;

export const XPostMetricsSchema = z
  .object({
    replies: z.number().int().nonnegative().nullable().optional(),
    reposts: z.number().int().nonnegative().nullable().optional(),
    likes: z.number().int().nonnegative().nullable().optional(),
    views: z.number().int().nonnegative().nullable().optional(),
    bookmarks: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export const XPostSchema = z
  .object({
    tweetId: z.string().min(1).max(64),
    url: z.string().url(),
    text: z.string().max(100_000),
    publishedAt: z.string().datetime().nullable().optional(),
    lang: z.string().max(32).nullable().optional(),
    kind: XPostKindSchema,
    author: XAuthorSchema,
    media: z.array(XMediaSchema).max(20).default([]),
    links: z.array(XPostLinkSchema).max(50).default([]),
    relationships: z.array(XPostRelationshipSchema).max(20).default([]),
    metrics: XPostMetricsSchema.default({}),
    capturedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((post, ctx) => {
    const normalizedUrls = new Set<string>();
    for (const [index, link] of post.links.entries()) {
      if (normalizedUrls.has(link.normalizedUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['links', index, 'normalizedUrl'],
          message: `Duplicate normalized outbound URL ${link.normalizedUrl}`,
        });
      }
      normalizedUrls.add(link.normalizedUrl);
    }
  });
export type XPost = z.infer<typeof XPostSchema>;

export const XTimelineItemSchema = z
  .object({
    tweetId: z.string().min(1).max(64),
    position: z.number().int().nonnegative(),
    observedAt: z.string().datetime(),
    presentation: z.enum(['POST', 'REPOST']).default('POST'),
    repostedBy: XAuthorSchema.nullable().optional(),
  })
  .strict();
export type XTimelineItem = z.infer<typeof XTimelineItemSchema>;

export const XTimelineCaptureSchema = z
  .object({
    runId: z.string().min(8).max(80),
    requestedCount: z.number().int().positive().max(100_000),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable().optional(),
    collectorVersion: z.string().min(1).max(80),
    excludedAds: z.number().int().nonnegative().default(0),
    status: z.enum(['COMPLETE', 'PARTIAL']).default('COMPLETE'),
    failureReason: z.string().max(2_000).nullable().optional(),
    posts: z.array(XPostSchema),
    items: z.array(XTimelineItemSchema),
  })
  .strict()
  .superRefine((capture, ctx) => {
    const postIds = new Set(capture.posts.map((post) => post.tweetId));
    const itemIds = new Set<string>();
    const positions = new Set<number>();
    for (const item of capture.items) {
      if (!postIds.has(item.tweetId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Timeline item ${item.tweetId} has no canonical post payload`,
        });
      }
      if (itemIds.has(item.tweetId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate timeline tweet ${item.tweetId}`,
        });
      }
      if (positions.has(item.position)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate timeline position ${item.position}`,
        });
      }
      itemIds.add(item.tweetId);
      positions.add(item.position);
    }
  });
export type XTimelineCapture = z.infer<typeof XTimelineCaptureSchema>;

export const CreateXTimelineRunSchema = z
  .object({
    runId: z.string().min(8).max(80),
    requestedCount: z.number().int().positive().max(100_000),
    startedAt: z.string().datetime(),
    collectorVersion: z.string().min(1).max(80),
  })
  .strict();
export type CreateXTimelineRun = z.infer<typeof CreateXTimelineRunSchema>;

export const UploadXTimelineChunkSchema = z
  .object({
    chunkIndex: z.number().int().nonnegative(),
    posts: z.array(XPostSchema).max(X_ARCHIVE_MAX_POSTS_PER_CHUNK),
    items: z.array(XTimelineItemSchema).max(X_ARCHIVE_MAX_TIMELINE_ITEMS_PER_CHUNK),
  })
  .strict()
  .superRefine((chunk, ctx) => {
    const postIds = new Set(chunk.posts.map((post) => post.tweetId));
    for (const item of chunk.items) {
      if (!postIds.has(item.tweetId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Timeline item ${item.tweetId} is missing from this chunk's post payloads`,
        });
      }
    }
  });
export type UploadXTimelineChunk = z.infer<typeof UploadXTimelineChunkSchema>;

export const CompleteXTimelineRunSchema = z
  .object({
    completedAt: z.string().datetime().nullable().optional(),
    excludedAds: z.number().int().nonnegative(),
    status: z.enum(['COMPLETE', 'PARTIAL']),
    failureReason: z.string().max(2_000).nullable().optional(),
    collectedCount: z.number().int().nonnegative(),
  })
  .strict();
export type CompleteXTimelineRun = z.infer<typeof CompleteXTimelineRunSchema>;
