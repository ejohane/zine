import { z } from 'zod';

export const EDITORIAL_SCHEMA_VERSION = 1;
export const EDITORIAL_MAX_STORIES = 8;
export const EDITORIAL_MAX_RECOMMENDATIONS = 7;
export const EDITORIAL_MAX_EMERGING_SIGNALS = 4;

const IdSchema = z.string().trim().min(1).max(200);
const TimestampSchema = z.string().datetime();
const NullableTimestampSchema = TimestampSchema.nullable();

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
  .strict();

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

export const DailyEditionSchema = z
  .object({
    schemaVersion: z.literal(EDITORIAL_SCHEMA_VERSION),
    id: IdSchema,
    userId: IdSchema,
    editionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.string().trim().min(1).max(100),
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

export const EditorialSnapshotSchema = z
  .object({
    schemaVersion: z.literal(EDITORIAL_SCHEMA_VERSION),
    id: IdSchema,
    generatedAt: TimestampSchema,
    editionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.string().trim().min(1).max(100),
    window: EditorialWindowSchema,
    provenance: EditionProvenanceSchema,
    documents: z.array(EditorialSnapshotDocumentSchema).max(10_000),
  })
  .strict();
export type EditorialSnapshot = z.infer<typeof EditorialSnapshotSchema>;

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
  })
  .strict();
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
