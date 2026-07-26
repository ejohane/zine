import { z } from 'zod';

export const X_ARCHIVE_SCHEMA_VERSION = 4;
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

export const XTimelineSourceTypeSchema = z.enum(['FOLLOWING', 'FAVORITES', 'LIST']);
export type XTimelineSourceType = z.infer<typeof XTimelineSourceTypeSchema>;

export const XTimelineSourceSchema = z
  .object({
    type: XTimelineSourceTypeSchema.default('FOLLOWING'),
    id: z.string().trim().min(1).max(120).default('following'),
    name: z.string().trim().min(1).max(160).default('Following'),
    url: HttpUrlSchema.nullable().optional(),
  })
  .strict();
export type XTimelineSource = z.infer<typeof XTimelineSourceSchema>;

export const XCollectionPolicySchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('COUNT'),
    })
    .strict(),
  z
    .object({
      mode: z.literal('ROLLING_WINDOW'),
      windowHours: z.number().int().positive().max(168),
      cutoffAt: z.string().datetime(),
      boundaryEvidenceRequired: z.number().int().positive().max(20).default(3),
    })
    .strict(),
]);
export type XCollectionPolicy = z.infer<typeof XCollectionPolicySchema>;

export const XCollectionTerminationReasonSchema = z.enum([
  'COUNT_REACHED',
  'WINDOW_BOUNDARY_REACHED',
  'SAFETY_LIMIT_REACHED',
  'TIMELINE_STALLED',
  'COLLECTOR_FAILED',
]);
export type XCollectionTerminationReason = z.infer<typeof XCollectionTerminationReasonSchema>;

export const XContextCoverageSchema = z
  .object({
    budget: z.number().int().nonnegative().default(0),
    attempted: z.number().int().nonnegative().default(0),
    completed: z.number().int().nonnegative().default(0),
    truncated: z.number().int().nonnegative().default(0),
    failed: z.number().int().nonnegative().default(0),
    warnings: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  })
  .strict()
  .superRefine((coverage, ctx) => {
    if (coverage.completed + coverage.truncated + coverage.failed !== coverage.attempted) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Context outcome counts must equal attempted expansions',
      });
    }
  });
export type XContextCoverage = z.infer<typeof XContextCoverageSchema>;

export const XWindowCoverageSchema = z
  .object({
    outsideWindow: z.number().int().nonnegative().default(0),
    missingPublishedAt: z.number().int().nonnegative().default(0),
    boundaryEvidenceRequired: z.number().int().nonnegative().default(0),
    boundaryReached: z.boolean().default(false),
  })
  .strict();
export type XWindowCoverage = z.infer<typeof XWindowCoverageSchema>;

export const XStructureEvidenceSourceSchema = z.enum([
  'X_WEB_GRAPHQL_LIST',
  'X_WEB_GRAPHQL_FOLLOWING',
  'X_WEB_GRAPHQL_TWEET_DETAIL',
  'DOM_TIMELINE',
  'DOM_PERMALINK',
]);
export type XStructureEvidenceSource = z.infer<typeof XStructureEvidenceSourceSchema>;

export const XStructureEvidenceSchema = z
  .object({
    status: z.enum(['EXACT', 'PARTIAL']),
    source: XStructureEvidenceSourceSchema,
    observedAt: z.string().datetime(),
  })
  .strict();
export type XStructureEvidence = z.infer<typeof XStructureEvidenceSchema>;

export const XStructureCoverageSchema = z
  .object({
    primaryPosts: z.number().int().nonnegative().default(0),
    structuredPosts: z.number().int().nonnegative().default(0),
    replyPosts: z.number().int().nonnegative().default(0),
    replyParentsKnown: z.number().int().nonnegative().default(0),
    conversationIdsKnown: z.number().int().nonnegative().default(0),
    status: z.enum(['EXACT', 'PARTIAL']).default('PARTIAL'),
    warnings: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  })
  .strict();
export type XStructureCoverage = z.infer<typeof XStructureCoverageSchema>;

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
    evidenceSource: XStructureEvidenceSourceSchema.optional(),
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
    conversationId: z.string().min(1).max(64).nullable().optional(),
    structure: XStructureEvidenceSchema.optional(),
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
    groupId: z.string().min(1).max(200).nullable().optional(),
    groupType: z.enum(['VERTICAL_CONVERSATION']).nullable().optional(),
    groupPosition: z.number().int().nonnegative().nullable().optional(),
    groupItemPosition: z.number().int().nonnegative().nullable().optional(),
    groupSize: z.number().int().positive().nullable().optional(),
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
    source: XTimelineSourceSchema.default({
      type: 'FOLLOWING',
      id: 'following',
      name: 'Following',
    }),
    collectionPolicy: XCollectionPolicySchema.default({ mode: 'COUNT' }),
    terminationReason: XCollectionTerminationReasonSchema.default('COUNT_REACHED'),
    excludedAds: z.number().int().nonnegative().default(0),
    status: z.enum(['COMPLETE', 'PARTIAL']).default('COMPLETE'),
    failureReason: z.string().max(2_000).nullable().optional(),
    contextCoverage: XContextCoverageSchema.default({}),
    windowCoverage: XWindowCoverageSchema.default({}),
    structureCoverage: XStructureCoverageSchema.default({}),
    posts: z.array(XPostSchema),
    items: z.array(XTimelineItemSchema),
  })
  .strict()
  .superRefine((capture, ctx) => {
    if (capture.collectionPolicy.mode === 'ROLLING_WINDOW' && capture.source.type === 'FOLLOWING') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['collectionPolicy'],
        message: 'Rolling-window collection is only supported for configured X lists',
      });
    }
    if (
      capture.collectionPolicy.mode === 'ROLLING_WINDOW' &&
      capture.status === 'COMPLETE' &&
      capture.terminationReason !== 'WINDOW_BOUNDARY_REACHED'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['terminationReason'],
        message: 'A complete rolling-window run must reach the window boundary',
      });
    }
    if (
      capture.collectionPolicy.mode === 'ROLLING_WINDOW' &&
      capture.status === 'COMPLETE' &&
      (!capture.windowCoverage.boundaryReached || capture.windowCoverage.missingPublishedAt > 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windowCoverage'],
        message: 'A complete rolling-window run needs boundary evidence and no missing timestamps',
      });
    }
    if (
      capture.collectionPolicy.mode === 'COUNT' &&
      capture.status === 'COMPLETE' &&
      capture.terminationReason !== 'COUNT_REACHED'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['terminationReason'],
        message: 'A complete count-bounded run must reach its count target',
      });
    }
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
    source: XTimelineSourceSchema.default({
      type: 'FOLLOWING',
      id: 'following',
      name: 'Following',
    }),
    collectionPolicy: XCollectionPolicySchema.default({ mode: 'COUNT' }),
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
    contextCoverage: XContextCoverageSchema.default({}),
    windowCoverage: XWindowCoverageSchema.default({}),
    structureCoverage: XStructureCoverageSchema.default({}),
    terminationReason: XCollectionTerminationReasonSchema.default('COUNT_REACHED'),
  })
  .strict();
export type CompleteXTimelineRun = z.infer<typeof CompleteXTimelineRunSchema>;
