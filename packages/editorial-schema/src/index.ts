import { z } from 'zod';

export const EDITORIAL_SCHEMA_VERSION = 1;
export const EDITORIAL_MAX_STORIES = 8;
export const EDITORIAL_MAX_RECOMMENDATIONS = 7;
export const EDITORIAL_MAX_EMERGING_SIGNALS = 4;
export const EDITORIAL_CANDIDATE_SCHEMA_VERSION = 1;

const IdSchema = z.string().trim().min(1).max(200);
const TimestampSchema = z.string().datetime();
const NullableTimestampSchema = TimestampSchema.nullable();

const EDITORIAL_FEEDBACK_TOPIC_STOP_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'how',
  'in',
  'is',
  'it',
  'its',
  'new',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'what',
  'when',
  'with',
]);

export function normalizeEditorialFeedbackTopicTokens(values: readonly string[]): string[] {
  const tokens = values
    .join(' ')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\p{Pd}_]+/gu, ' ')
    .match(/[\p{L}\p{N}][\p{L}\p{N}]{1,}/gu);
  return [
    ...new Set(
      (tokens ?? [])
        .map((token) => {
          if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
          if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) {
            return token.slice(0, -1);
          }
          return token;
        })
        .filter((token) => !EDITORIAL_FEEDBACK_TOPIC_STOP_WORDS.has(token))
    ),
  ].sort();
}

export function normalizeEditorialFeedbackCreatorKey(value: string): string | null {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/^@/, '')
    .replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

export function normalizeEditorialFeedbackCanonicalUrl(value: string): string | null {
  try {
    const url = new URL(value.trim().replace(/[.…]+$/u, ''));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.startsWith('utm_') ||
        ['ref', 'ref_src', 's', 'si', 'feature', 'taid'].includes(key)
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    const hostname = url.hostname.toLocaleLowerCase();
    if (
      ['twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'mobile.x.com'].includes(hostname)
    ) {
      url.hostname = 'x.com';
    } else {
      url.hostname = hostname.replace(/^www\./, '');
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const EditorialDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate, 'Must be a valid calendar date');

export const EditorialTimezoneSchema = z.string().trim().min(1).max(100);

export function isValidEditorialTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const EditorialSourceOriginSchema = z.enum(['X', 'ZINE', 'EXTERNAL']);
export const EditorialContentTypeSchema = z.enum(['ARTICLE', 'VIDEO', 'PODCAST', 'POST', 'OTHER']);
export const EditorialUserStateSchema = z.enum(['INBOX', 'BOOKMARKED', 'FINISHED']).nullable();

export const SourceReferenceSchema = z
  .object({
    id: IdSchema,
    origin: EditorialSourceOriginSchema,
    role: z.enum([
      'PRIMARY',
      'REPORTING',
      'ANALYSIS',
      'COMMENTARY',
      'REACTION',
      'COUNTERPOINT',
      'VERIFICATION',
    ]),
    canonicalUrl: z.string().url(),
    title: z.string().max(1_000).nullable(),
    creator: z.string().max(500).nullable(),
    publisher: z.string().max(500).nullable(),
    publishedAt: NullableTimestampSchema,
    xTweetId: z.string().max(64).nullable(),
    zineItemId: z.string().max(200).nullable(),
    zineUserItemId: z.string().max(200).nullable(),
    contentType: EditorialContentTypeSchema,
    userState: EditorialUserStateSchema,
    provider: z.string().trim().min(1).max(100).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    excerpt: z.string().max(2_000).nullable().optional(),
  })
  .strict();
export type SourceReference = z.infer<typeof SourceReferenceSchema>;

export const ClaimSchema = z
  .object({
    id: IdSchema,
    text: z.string().trim().min(1).max(5_000),
    classification: z.enum([
      'FACT',
      'INFERENCE',
      'OPINION',
      'RUMOR',
      'PREDICTION',
      'JOKE_OR_SATIRE',
    ]),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    sourceIds: z.array(IdSchema).max(30),
    verification: z.enum([
      'PRIMARY_SOURCE',
      'MULTIPLE_SOURCES',
      'SINGLE_SOURCE',
      'SOCIAL_SIGNAL_ONLY',
    ]),
  })
  .strict();
export type Claim = z.infer<typeof ClaimSchema>;

export const CitedTextSchema = z
  .object({
    text: z.string().trim().min(1).max(10_000),
    claimIds: z.array(IdSchema).max(50),
  })
  .strict();
export type CitedText = z.infer<typeof CitedTextSchema>;

export const EntityReferenceSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    type: z.enum(['PERSON', 'ORGANIZATION', 'PRODUCT', 'PLACE', 'EVENT', 'OTHER']),
  })
  .strict();

export const RepresentativeXVoiceSchema = z
  .object({
    sourceId: IdSchema,
    name: z.string().trim().min(1).max(300),
    handle: z.string().trim().min(1).max(100).nullable(),
    contribution: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const ZineConnectionSchema = z
  .object({
    sourceId: IdSchema,
    relationship: z.enum([
      'EXACT_SOURCE',
      'SAVED_CONTEXT',
      'UNFINISHED_CONTEXT',
      'CREATOR_MATCH',
      'TOPIC_MATCH',
      'PREVIOUSLY_FINISHED',
    ]),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const StorySchema = z
  .object({
    id: IdSchema,
    rank: z.number().int().positive(),
    type: z.enum(['NEWS', 'CONVERSATION', 'TREND', 'ANALYSIS']),
    lifecycle: z.enum(['EMERGING', 'DEVELOPING', 'ESTABLISHED', 'FADING']),
    title: z.string().trim().min(1).max(500),
    lede: CitedTextSchema,
    whatHappened: CitedTextSchema,
    whyItMatters: CitedTextSchema,
    conversation: CitedTextSchema,
    editorialAnalysis: CitedTextSchema,
    importance: z.number().int().min(1).max(5),
    momentum: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    topics: z.array(z.string().trim().min(1).max(100)).max(20),
    entities: z.array(EntityReferenceSchema).max(30),
    sourceIds: z.array(IdSchema).min(1).max(100),
    claimIds: z.array(IdSchema).min(1).max(100),
    whyToday: CitedTextSchema.optional(),
    representativeXVoices: z.array(RepresentativeXVoiceSchema).max(5).optional(),
    zineConnections: z.array(ZineConnectionSchema).max(20).optional(),
  })
  .strict();
export type Story = z.infer<typeof StorySchema>;

export const RecommendationSchema = z
  .object({
    id: IdSchema,
    sourceId: IdSchema,
    relatedStoryIds: z.array(IdSchema).max(20),
    format: z.enum(['READ', 'WATCH', 'LISTEN', 'EXPLORE']),
    priority: z.enum(['MUST', 'WORTHWHILE', 'SKIM', 'CONTEXT_ONLY']),
    title: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(2_000),
    estimatedMinutes: z.number().int().positive().max(1_440).nullable(),
    isOriginalSource: z.boolean(),
    alreadyConsumed: z.boolean(),
  })
  .strict();
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const EmergingSignalSchema = z
  .object({
    id: IdSchema,
    title: z.string().trim().min(1).max(500),
    summary: CitedTextSchema,
    whyWatch: CitedTextSchema,
    momentum: z.enum(['EARLY', 'RISING', 'ACCELERATING']),
    sourceIds: z.array(IdSchema).min(1).max(100),
    claimIds: z.array(IdSchema).min(1).max(100),
  })
  .strict();
export type EmergingSignal = z.infer<typeof EmergingSignalSchema>;

export const EditorialWindowSchema = z
  .object({
    newContentAfter: TimestampSchema,
    through: TimestampSchema,
    comparisonAfter: TimestampSchema,
    previousEditionId: IdSchema.nullable(),
    fallbackWindowUsed: z.boolean(),
  })
  .strict()
  .superRefine((window, context) => {
    if (Date.parse(window.comparisonAfter) > Date.parse(window.newContentAfter)) {
      context.addIssue({
        code: 'custom',
        path: ['comparisonAfter'],
        message: 'comparisonAfter must not be later than newContentAfter',
      });
    }
    if (Date.parse(window.newContentAfter) > Date.parse(window.through)) {
      context.addIssue({
        code: 'custom',
        path: ['newContentAfter'],
        message: 'newContentAfter must not be later than through',
      });
    }
  });

export const EditionProvenanceSchema = z
  .object({
    xRunIds: z.array(IdSchema).max(100),
    inputCounts: z
      .object({
        xTimelineEntries: z.number().int().nonnegative(),
        xCanonicalPosts: z.number().int().nonnegative(),
        inboxItems: z.number().int().nonnegative(),
        recentBookmarks: z.number().int().nonnegative(),
        contextualBookmarks: z.number().int().nonnegative(),
        externalVerificationSources: z.number().int().nonnegative(),
      })
      .strict(),
    sourceStatus: z
      .object({
        xArchive: z.enum(['COMPLETE', 'PARTIAL', 'UNAVAILABLE']),
        zineInbox: z.enum(['COMPLETE', 'PARTIAL', 'UNAVAILABLE']),
        zineBookmarks: z.enum(['COMPLETE', 'PARTIAL', 'UNAVAILABLE']),
        externalVerification: z.enum(['COMPLETE', 'PARTIAL', 'NOT_RUN']),
      })
      .strict(),
    snapshotKey: z.string().trim().min(1).max(1_000),
    warnings: z.array(z.string().max(2_000)).max(100),
  })
  .strict();

export const QualityScoresSchema = z
  .object({
    groundingAndTrust: z.number().min(0).max(5),
    editorialJudgment: z.number().min(0).max(5),
    synthesis: z.number().min(0).max(5),
    personalUtility: z.number().min(0).max(5),
    noveltyAndMomentum: z.number().min(0).max(5),
    clarityAndEconomy: z.number().min(0).max(5),
  })
  .strict();

export const QualityAssessmentSchema = z
  .object({
    scores: QualityScoresSchema,
    overallScore: z.number().min(0).max(100),
    passed: z.boolean(),
    notes: z.array(z.string().max(2_000)).max(50),
  })
  .strict();

export const GenerationMetadataSchema = z
  .object({
    workflowVersion: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(200),
    generatorRunId: IdSchema,
  })
  .strict();

export const EditorialRunStatusSchema = z.enum(['PREPARING', 'PUBLISHED', 'FAILED']);

export const StartEditorialRunSchema = z
  .object({
    id: IdSchema,
    editionDate: EditorialDateSchema,
    workflowVersion: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type StartEditorialRun = z.infer<typeof StartEditorialRunSchema>;

export const EditorialRunFailureStageSchema = z.enum([
  'SNAPSHOT',
  'RANK',
  'RESEARCH',
  'DRAFT',
  'CRITIC',
  'VALIDATE',
  'RENDER',
  'PUBLISH',
]);

export const FailEditorialRunSchema = z
  .object({
    stage: EditorialRunFailureStageSchema,
    message: z.string().trim().min(1).max(5_000),
  })
  .strict();
export type FailEditorialRun = z.infer<typeof FailEditorialRunSchema>;

export const DailyEditionSchema = z
  .object({
    schemaVersion: z.literal(EDITORIAL_SCHEMA_VERSION),
    id: IdSchema,
    userId: IdSchema,
    editionDate: EditorialDateSchema,
    timezone: EditorialTimezoneSchema,
    revision: z.number().int().positive(),
    status: z.enum(['DRAFT', 'VALIDATED', 'PUBLISHED']),
    generatedAt: TimestampSchema,
    window: EditorialWindowSchema,
    provenance: EditionProvenanceSchema,
    headline: z.string().trim().min(1).max(500),
    dek: z.string().trim().min(1).max(1_000),
    briefing: z.array(CitedTextSchema).min(1).max(12),
    stories: z.array(StorySchema).min(1).max(EDITORIAL_MAX_STORIES),
    recommendations: z.array(RecommendationSchema).max(EDITORIAL_MAX_RECOMMENDATIONS),
    emergingSignals: z.array(EmergingSignalSchema).max(EDITORIAL_MAX_EMERGING_SIGNALS),
    bigPicture: CitedTextSchema,
    coverageNotes: z.array(z.string().max(2_000)).max(50),
    sources: z.array(SourceReferenceSchema).min(1).max(5_000),
    claims: z.array(ClaimSchema).min(1).max(2_000),
    generation: GenerationMetadataSchema,
    quality: QualityAssessmentSchema,
  })
  .strict();
export type DailyEdition = z.infer<typeof DailyEditionSchema>;

export const EditorialSnapshotDocumentSchema = z
  .object({
    source: SourceReferenceSchema,
    observedAt: TimestampSchema,
    firstSeenAt: TimestampSchema,
    text: z.string().max(100_000).nullable(),
    summary: z.string().max(20_000).nullable(),
    timelinePosition: z.number().int().nonnegative().nullable(),
    engagement: z
      .object({
        replies: z.number().int().nonnegative().nullable(),
        reposts: z.number().int().nonnegative().nullable(),
        likes: z.number().int().nonnegative().nullable(),
        views: z.number().int().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
    links: z
      .array(
        z
          .object({
            url: z.string().url(),
            normalizedUrl: z.string().url(),
            displayUrl: z.string().max(2_000).nullable().optional(),
            redirectUrl: z.string().url().nullable().optional(),
            source: z.enum(['TEXT', 'CARD']),
            card: z
              .object({
                title: z.string().max(1_000).nullable().optional(),
                description: z.string().max(2_000).nullable().optional(),
                domain: z.string().max(500).nullable().optional(),
                imageUrl: z.string().url().nullable().optional(),
              })
              .strict()
              .nullable()
              .optional(),
          })
          .strict()
      )
      .max(50)
      .default([]),
    signals: z
      .object({
        ingestedAt: NullableTimestampSchema,
        bookmarkedAt: NullableTimestampSchema,
        lastOpenedAt: NullableTimestampSchema,
        isFinished: z.boolean(),
        tags: z.array(z.string().max(100)).max(50),
      })
      .strict(),
  })
  .strict();
export type EditorialSnapshotDocument = z.infer<typeof EditorialSnapshotDocumentSchema>;

export const EditorialFeedbackSignalCountsSchema = z
  .object({
    moreLikeThis: z.number().int().nonnegative(),
    lessLikeThis: z.number().int().nonnegative(),
    dismissed: z.number().int().nonnegative(),
    alreadyKnew: z.number().int().nonnegative(),
  })
  .strict();

export const EditorialFeedbackPreferenceSchema = z
  .object({
    key: z.string().trim().min(1).max(2_000),
    affinity: z.number().min(-3).max(3),
    novelty: z.number().min(-3).max(0),
    signalCounts: EditorialFeedbackSignalCountsSchema,
    lastSignaledAt: TimestampSchema,
  })
  .strict();
export type EditorialFeedbackPreference = z.infer<typeof EditorialFeedbackPreferenceSchema>;

export const EditorialFeedbackProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: TimestampSchema,
    lookbackDays: z.literal(180),
    halfLifeDays: z.literal(60),
    maxEvents: z.literal(500),
    eventCount: z.number().int().min(0).max(500),
    truncated: z.boolean(),
    topics: z.array(EditorialFeedbackPreferenceSchema).max(200),
    creators: z.array(EditorialFeedbackPreferenceSchema).max(100),
    canonicalUrls: z.array(EditorialFeedbackPreferenceSchema).max(200),
    sourceIds: z.array(EditorialFeedbackPreferenceSchema).max(200),
  })
  .strict();
export type EditorialFeedbackProfile = z.infer<typeof EditorialFeedbackProfileSchema>;

export const EditorialSnapshotSchema = z
  .object({
    schemaVersion: z.literal(EDITORIAL_SCHEMA_VERSION),
    id: IdSchema,
    generatedAt: TimestampSchema,
    editionDate: EditorialDateSchema,
    timezone: EditorialTimezoneSchema,
    window: EditorialWindowSchema,
    provenance: EditionProvenanceSchema,
    documents: z.array(EditorialSnapshotDocumentSchema).max(10_000),
    feedbackProfile: EditorialFeedbackProfileSchema.optional(),
  })
  .strict();
export type EditorialSnapshot = z.infer<typeof EditorialSnapshotSchema>;

export const EditorialCandidateScoreSchema = z
  .object({
    xConversation: z.number().min(0).max(100),
    attention: z.number().min(0).max(100),
    endorsement: z.number().min(0).max(100),
    momentum: z.number().min(0).max(100),
    novelty: z.number().min(0).max(100),
    zineResonance: z.number().min(0).max(100),
    sourceQuality: z.number().min(0).max(100),
    penalties: z.number().min(0).max(100),
    feedbackAdjustment: z.number().min(-8).max(8).default(0),
    total: z.number().min(0).max(100),
  })
  .strict();
export type EditorialCandidateScore = z.infer<typeof EditorialCandidateScoreSchema>;

export const EditorialCandidateZineMatchSchema = z
  .object({
    sourceId: IdSchema,
    relationship: ZineConnectionSchema.shape.relationship,
    matchScore: z.number().min(0).max(100),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();
export type EditorialCandidateZineMatch = z.infer<typeof EditorialCandidateZineMatchSchema>;

export const EditorialStoryClusterSchema = z
  .object({
    id: IdSchema,
    key: z.string().trim().min(1).max(1_000),
    title: z.string().trim().min(1).max(500),
    firstSeenAt: TimestampSchema,
    lastSeenAt: TimestampSchema,
    topics: z.array(z.string().trim().min(1).max(100)).max(30),
    canonicalUrls: z.array(z.string().url()).max(100),
    xSourceIds: z.array(IdSchema).min(1).max(500),
    zineSourceIds: z.array(IdSchema).max(500),
  })
  .strict();
export type EditorialStoryCluster = z.infer<typeof EditorialStoryClusterSchema>;

export const EditorialCandidateFeedbackImpactSchema = z
  .object({
    baseTotal: z.number().min(0).max(100),
    affinityAdjustment: z.number().min(-8).max(8),
    noveltyAdjustment: z.number().min(-8).max(0),
    adjustment: z.number().min(-8).max(8),
    matchedTopics: z.array(z.string().trim().min(1).max(200)).max(30),
    matchedCreators: z.array(z.string().trim().min(1).max(500)).max(20),
    matchedCanonicalUrls: z.array(z.string().url()).max(30),
    matchedSourceIds: z.array(IdSchema).max(100),
    matchedSignalCount: z.number().int().nonnegative(),
  })
  .strict();
export type EditorialCandidateFeedbackImpact = z.infer<
  typeof EditorialCandidateFeedbackImpactSchema
>;

export const EditorialCandidateSchema = z
  .object({
    id: IdSchema,
    clusterId: IdSchema,
    rank: z.number().int().positive(),
    title: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(2_000),
    canonicalUrl: z.string().url().nullable(),
    xSourceIds: z.array(IdSchema).min(1).max(500),
    representativeXSourceIds: z.array(IdSchema).min(1).max(5),
    zineMatches: z.array(EditorialCandidateZineMatchSchema).max(100),
    independentVoiceCount: z.number().int().nonnegative(),
    xPostCount: z.number().int().positive(),
    xRunCount: z.number().int().nonnegative(),
    explicitRecommendationCount: z.number().int().nonnegative(),
    linkedPostCount: z.number().int().nonnegative(),
    score: EditorialCandidateScoreSchema,
    scoreReasons: z.array(z.string().trim().min(1).max(1_000)).max(30),
    feedbackImpact: EditorialCandidateFeedbackImpactSchema.optional(),
  })
  .strict();
export type EditorialCandidate = z.infer<typeof EditorialCandidateSchema>;

export const EditorialCandidateArtifactSchema = z
  .object({
    schemaVersion: z.literal(EDITORIAL_CANDIDATE_SCHEMA_VERSION),
    id: IdSchema,
    snapshotId: IdSchema,
    editionDate: EditorialDateSchema,
    generatedAt: TimestampSchema,
    strategy: z.literal('X_LED_V1'),
    weights: z
      .object({
        xConversation: z.number().min(0).max(1),
        attention: z.number().min(0).max(1),
        endorsement: z.number().min(0).max(1),
        momentum: z.number().min(0).max(1),
        novelty: z.number().min(0).max(1),
        zineResonance: z.number().min(0).max(1),
        sourceQuality: z.number().min(0).max(1),
      })
      .strict(),
    provenance: EditionProvenanceSchema,
    clusters: z.array(EditorialStoryClusterSchema).max(2_000),
    candidates: z.array(EditorialCandidateSchema).max(2_000),
    coverageNotes: z.array(z.string().max(2_000)).max(100),
  })
  .strict();
export type EditorialCandidateArtifact = z.infer<typeof EditorialCandidateArtifactSchema>;

export const EditorialFeedbackEventTypeSchema = z.enum([
  'IMPRESSION',
  'OPENED',
  'SAVED',
  'FINISHED',
  'DISMISSED',
  'MORE_LIKE_THIS',
  'LESS_LIKE_THIS',
  'ALREADY_KNEW',
]);

export const EditorialFeedbackTargetTypeSchema = z.enum([
  'EDITION',
  'STORY',
  'RECOMMENDATION',
  'SOURCE',
]);

export const CreateEditorialFeedbackSchema = z
  .object({
    clientEventId: IdSchema,
    editionId: IdSchema,
    targetType: EditorialFeedbackTargetTypeSchema,
    targetId: IdSchema,
    eventType: EditorialFeedbackEventTypeSchema,
    occurredAt: TimestampSchema.optional(),
  })
  .strict();
export type CreateEditorialFeedback = z.infer<typeof CreateEditorialFeedbackSchema>;

export const ValidationIssueSchema = z
  .object({
    code: z.string().min(1).max(100),
    path: z.string().max(1_000),
    message: z.string().min(1).max(2_000),
  })
  .strict();

export const EditorialValidationReportSchema = z
  .object({
    valid: z.boolean(),
    overallScore: z.number().min(0).max(100).nullable(),
    errors: z.array(ValidationIssueSchema),
    warnings: z.array(ValidationIssueSchema),
    validatedAt: TimestampSchema,
    validatorVersion: z.string().min(1).max(100),
  })
  .strict();
export type EditorialValidationReport = z.infer<typeof EditorialValidationReportSchema>;

export const PublishEditorialEditionSchema = z
  .object({
    edition: DailyEditionSchema,
    snapshot: EditorialSnapshotSchema,
    validation: EditorialValidationReportSchema,
    markdown: z.string().min(1).max(500_000),
    candidateArtifact: EditorialCandidateArtifactSchema.optional(),
  })
  .strict()
  .superRefine((bundle, context) => {
    if (!isValidEditorialTimezone(bundle.edition.timezone)) {
      context.addIssue({
        code: 'custom',
        path: ['edition', 'timezone'],
        message: 'Must be a valid IANA timezone',
      });
    }
    if (!isValidEditorialTimezone(bundle.snapshot.timezone)) {
      context.addIssue({
        code: 'custom',
        path: ['snapshot', 'timezone'],
        message: 'Must be a valid IANA timezone',
      });
    }
    if (bundle.edition.editionDate !== bundle.snapshot.editionDate) {
      context.addIssue({
        code: 'custom',
        path: ['snapshot', 'editionDate'],
        message: 'Snapshot editionDate must match the edition',
      });
    }
    if (bundle.edition.timezone !== bundle.snapshot.timezone) {
      context.addIssue({
        code: 'custom',
        path: ['snapshot', 'timezone'],
        message: 'Snapshot timezone must match the edition',
      });
    }

    const candidate = bundle.candidateArtifact;
    if (!candidate) return;
    if (candidate.snapshotId !== bundle.snapshot.id) {
      context.addIssue({
        code: 'custom',
        path: ['candidateArtifact', 'snapshotId'],
        message: 'Candidate artifact must reference the supplied snapshot',
      });
    }
    if (candidate.editionDate !== bundle.snapshot.editionDate) {
      context.addIssue({
        code: 'custom',
        path: ['candidateArtifact', 'editionDate'],
        message: 'Candidate artifact editionDate must match the snapshot',
      });
    }
    if (JSON.stringify(candidate.provenance) !== JSON.stringify(bundle.snapshot.provenance)) {
      context.addIssue({
        code: 'custom',
        path: ['candidateArtifact', 'provenance'],
        message: 'Candidate artifact provenance must match the snapshot',
      });
    }

    const sources = new Map(
      bundle.snapshot.documents.map((document) => [document.source.id, document.source.origin])
    );
    const clusterIds = new Set(candidate.clusters.map((cluster) => cluster.id));
    const checkSource = (
      sourceId: string,
      expectedOrigin: 'X' | 'ZINE',
      path: (string | number)[]
    ) => {
      const origin = sources.get(sourceId);
      if (origin !== expectedOrigin) {
        context.addIssue({
          code: 'custom',
          path,
          message: `Must reference a ${expectedOrigin} source in the supplied snapshot`,
        });
      }
    };

    for (const [index, cluster] of candidate.clusters.entries()) {
      for (const [sourceIndex, sourceId] of cluster.xSourceIds.entries()) {
        checkSource(sourceId, 'X', [
          'candidateArtifact',
          'clusters',
          index,
          'xSourceIds',
          sourceIndex,
        ]);
      }
      for (const [sourceIndex, sourceId] of cluster.zineSourceIds.entries()) {
        checkSource(sourceId, 'ZINE', [
          'candidateArtifact',
          'clusters',
          index,
          'zineSourceIds',
          sourceIndex,
        ]);
      }
    }

    for (const [index, value] of candidate.candidates.entries()) {
      if (!clusterIds.has(value.clusterId)) {
        context.addIssue({
          code: 'custom',
          path: ['candidateArtifact', 'candidates', index, 'clusterId'],
          message: 'Candidate must reference a cluster in the artifact',
        });
      }
      const candidateXSourceIds = new Set(value.xSourceIds);
      for (const [sourceIndex, sourceId] of value.xSourceIds.entries()) {
        checkSource(sourceId, 'X', [
          'candidateArtifact',
          'candidates',
          index,
          'xSourceIds',
          sourceIndex,
        ]);
      }
      for (const [sourceIndex, sourceId] of value.representativeXSourceIds.entries()) {
        checkSource(sourceId, 'X', [
          'candidateArtifact',
          'candidates',
          index,
          'representativeXSourceIds',
          sourceIndex,
        ]);
        if (!candidateXSourceIds.has(sourceId)) {
          context.addIssue({
            code: 'custom',
            path: [
              'candidateArtifact',
              'candidates',
              index,
              'representativeXSourceIds',
              sourceIndex,
            ],
            message: 'Representative X source must also be a candidate X source',
          });
        }
      }
      for (const [matchIndex, match] of value.zineMatches.entries()) {
        checkSource(match.sourceId, 'ZINE', [
          'candidateArtifact',
          'candidates',
          index,
          'zineMatches',
          matchIndex,
          'sourceId',
        ]);
      }
    }
  });
export type PublishEditorialEdition = z.infer<typeof PublishEditorialEditionSchema>;

export function calculateQualityScore(scores: z.infer<typeof QualityScoresSchema>): number {
  const value =
    scores.groundingAndTrust * 5 +
    scores.editorialJudgment * 4 +
    scores.synthesis * 4 +
    scores.personalUtility * 3 +
    scores.noveltyAndMomentum * 2 +
    scores.clarityAndEconomy * 2;
  return Math.round(value * 10) / 10;
}

const VALIDATOR_VERSION = '1.0.0';

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function validateDailyEdition(input: unknown, now = new Date()): EditorialValidationReport {
  const parsed = DailyEditionSchema.safeParse(input);
  const errors: EditorialValidationReport['errors'] = [];
  const warnings: EditorialValidationReport['warnings'] = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        code: 'SCHEMA_INVALID',
        path: issue.path.join('.'),
        message: issue.message,
      });
    }
    return {
      valid: false,
      overallScore: null,
      errors,
      warnings,
      validatedAt: now.toISOString(),
      validatorVersion: VALIDATOR_VERSION,
    };
  }

  const edition = parsed.data;
  const sourceIds = new Set(edition.sources.map((source) => source.id));
  const sourcesById = new Map(edition.sources.map((source) => [source.id, source]));
  const claimsById = new Map(edition.claims.map((claim) => [claim.id, claim]));
  const storyIds = new Set(edition.stories.map((story) => story.id));

  const addMissingReferences = (
    ids: string[],
    available: Set<string>,
    path: string,
    code: string
  ) => {
    for (const id of ids) {
      if (!available.has(id)) {
        errors.push({ code, path, message: `Referenced ID does not exist: ${id}` });
      }
    }
  };

  for (const [label, ids] of [
    ['sources', edition.sources.map((value) => value.id)],
    ['claims', edition.claims.map((value) => value.id)],
    ['stories', edition.stories.map((value) => value.id)],
    ['recommendations', edition.recommendations.map((value) => value.id)],
    ['emergingSignals', edition.emergingSignals.map((value) => value.id)],
  ] as const) {
    for (const duplicate of duplicateValues(ids)) {
      errors.push({
        code: 'DUPLICATE_ID',
        path: label,
        message: `Duplicate ${label} ID: ${duplicate}`,
      });
    }
  }

  const citedTexts: Array<[string, CitedText]> = [
    ...edition.briefing.map((value, index) => [`briefing.${index}`, value] as [string, CitedText]),
    ['bigPicture', edition.bigPicture],
  ];

  for (const [index, story] of edition.stories.entries()) {
    addMissingReferences(
      story.sourceIds,
      sourceIds,
      `stories.${index}.sourceIds`,
      'UNKNOWN_SOURCE'
    );
    addMissingReferences(
      story.claimIds,
      new Set(claimsById.keys()),
      `stories.${index}.claimIds`,
      'UNKNOWN_CLAIM'
    );
    for (const field of [
      'lede',
      'whatHappened',
      'whyItMatters',
      'conversation',
      'editorialAnalysis',
    ] as const) {
      citedTexts.push([`stories.${index}.${field}`, story[field]]);
    }
    if (story.whyToday) {
      citedTexts.push([`stories.${index}.whyToday`, story.whyToday]);
    }
    addMissingReferences(
      (story.representativeXVoices ?? []).map((voice) => voice.sourceId),
      sourceIds,
      `stories.${index}.representativeXVoices`,
      'UNKNOWN_SOURCE'
    );
    for (const [voiceIndex, voice] of (story.representativeXVoices ?? []).entries()) {
      const source = sourcesById.get(voice.sourceId);
      if (source && source.origin !== 'X') {
        errors.push({
          code: 'INVALID_X_VOICE_SOURCE',
          path: `stories.${index}.representativeXVoices.${voiceIndex}.sourceId`,
          message: 'Representative X voices must reference X sources',
        });
      }
    }
    addMissingReferences(
      (story.zineConnections ?? []).map((connection) => connection.sourceId),
      sourceIds,
      `stories.${index}.zineConnections`,
      'UNKNOWN_SOURCE'
    );
    for (const [connectionIndex, connection] of (story.zineConnections ?? []).entries()) {
      const source = sourcesById.get(connection.sourceId);
      if (source && source.origin !== 'ZINE') {
        errors.push({
          code: 'INVALID_ZINE_CONNECTION_SOURCE',
          path: `stories.${index}.zineConnections.${connectionIndex}.sourceId`,
          message: 'Zine connections must reference Zine sources',
        });
      }
    }
  }

  for (const [index, signal] of edition.emergingSignals.entries()) {
    addMissingReferences(
      signal.sourceIds,
      sourceIds,
      `emergingSignals.${index}.sourceIds`,
      'UNKNOWN_SOURCE'
    );
    addMissingReferences(
      signal.claimIds,
      new Set(claimsById.keys()),
      `emergingSignals.${index}.claimIds`,
      'UNKNOWN_CLAIM'
    );
    citedTexts.push([`emergingSignals.${index}.summary`, signal.summary]);
    citedTexts.push([`emergingSignals.${index}.whyWatch`, signal.whyWatch]);
  }

  for (const [path, value] of citedTexts) {
    addMissingReferences(
      value.claimIds,
      new Set(claimsById.keys()),
      `${path}.claimIds`,
      'UNKNOWN_CLAIM'
    );
  }

  for (const [index, claim] of edition.claims.entries()) {
    addMissingReferences(claim.sourceIds, sourceIds, `claims.${index}.sourceIds`, 'UNKNOWN_SOURCE');
    if (claim.classification === 'FACT' && claim.sourceIds.length === 0) {
      errors.push({
        code: 'UNGROUNDED_FACT',
        path: `claims.${index}`,
        message: 'Factual claims require at least one source',
      });
    }
    if (
      claim.classification === 'FACT' &&
      claim.confidence === 'HIGH' &&
      claim.verification === 'SOCIAL_SIGNAL_ONLY'
    ) {
      errors.push({
        code: 'SOCIAL_SIGNAL_AS_FACT',
        path: `claims.${index}`,
        message: 'High-confidence facts cannot rely only on social signals',
      });
    }
  }

  for (const duplicate of duplicateValues(
    edition.recommendations.map((recommendation) => recommendation.sourceId)
  )) {
    errors.push({
      code: 'DUPLICATE_RECOMMENDATION_SOURCE',
      path: 'recommendations',
      message: `Source is recommended more than once: ${duplicate}`,
    });
  }

  for (const [index, recommendation] of edition.recommendations.entries()) {
    addMissingReferences(
      [recommendation.sourceId],
      sourceIds,
      `recommendations.${index}.sourceId`,
      'UNKNOWN_SOURCE'
    );
    addMissingReferences(
      recommendation.relatedStoryIds,
      storyIds,
      `recommendations.${index}.relatedStoryIds`,
      'UNKNOWN_STORY'
    );
    if (recommendation.alreadyConsumed) {
      warnings.push({
        code: 'ALREADY_CONSUMED_RECOMMENDATION',
        path: `recommendations.${index}`,
        message:
          'Already-consumed content should only be recommended when revisiting is intentional',
      });
    }
  }

  const sourceUsage = new Map<string, number>();
  for (const story of edition.stories) {
    for (const sourceId of new Set(story.sourceIds)) {
      sourceUsage.set(sourceId, (sourceUsage.get(sourceId) ?? 0) + 1);
    }
  }
  for (const [sourceId, uses] of sourceUsage) {
    if (uses > 2) {
      warnings.push({
        code: 'SOURCE_OVERUSED',
        path: 'stories',
        message: `Source ${sourceId} supports ${uses} stories`,
      });
    }
  }

  const overallScore = calculateQualityScore(edition.quality.scores);
  if (edition.quality.scores.groundingAndTrust < 4) {
    errors.push({
      code: 'GROUNDING_BELOW_THRESHOLD',
      path: 'quality.scores.groundingAndTrust',
      message: 'Grounding and trust must score at least 4/5',
    });
  }
  if (overallScore < 80) {
    errors.push({
      code: 'QUALITY_BELOW_THRESHOLD',
      path: 'quality.overallScore',
      message: `Weighted quality score ${overallScore} is below the publishable threshold of 80`,
    });
  }
  if (Math.abs(edition.quality.overallScore - overallScore) > 0.01) {
    warnings.push({
      code: 'QUALITY_SCORE_NORMALIZED',
      path: 'quality.overallScore',
      message: `Declared score ${edition.quality.overallScore} will be normalized to ${overallScore}`,
    });
  }

  return {
    valid: errors.length === 0,
    overallScore,
    errors,
    warnings,
    validatedAt: now.toISOString(),
    validatorVersion: VALIDATOR_VERSION,
  };
}

export function finalizeDailyEdition(
  input: unknown,
  now = new Date()
): {
  edition: DailyEdition | null;
  report: EditorialValidationReport;
} {
  const report = validateDailyEdition(input, now);
  const parsed = DailyEditionSchema.safeParse(input);
  if (!parsed.success || !report.valid || report.overallScore === null) {
    return { edition: null, report };
  }

  return {
    edition: {
      ...parsed.data,
      status: 'VALIDATED',
      quality: {
        ...parsed.data.quality,
        overallScore: report.overallScore,
        passed: true,
      },
    },
    report,
  };
}
