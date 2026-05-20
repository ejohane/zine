import type {
  EnrichmentModelOutput,
  EnrichmentPromptInput,
  EnrichmentSourceCreator,
  EnrichmentSourceItem,
} from './types';

const EMBEDDING_ARTICLE_EXCERPT_LIMIT = 5000;
const METADATA_LIMIT = 2500;
const EMBEDDING_TEXT_LIMIT = 6000;

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function parseMetadataExcerpt(rawMetadata: string | null): string | null {
  if (!rawMetadata) return null;

  try {
    const parsed = JSON.parse(rawMetadata);
    return truncate(JSON.stringify(parsed), METADATA_LIMIT);
  } catch {
    return truncate(rawMetadata, METADATA_LIMIT);
  }
}

function formatCreator(creator: EnrichmentSourceCreator | null): string {
  if (!creator) return 'Unknown';
  return (
    [creator.name, creator.handle, creator.description].filter(Boolean).join(' | ') || 'Unknown'
  );
}

const OUTPUT_CONTRACT = {
  summary: {
    short: 'string, 1-2 sentences',
    detail: 'string, concise paragraph',
  },
  classification: {
    primaryCategory: 'string',
    secondaryCategories: ['string'],
    intent: 'string',
    difficulty: 'string',
    evergreenScore: 'number from 0 to 1',
    timeSensitivity: 'string',
  },
  topics: [{ name: 'string', confidence: 'number from 0 to 1' }],
  entities: [
    {
      name: 'string',
      type: 'person | organization | product | technology | place | concept | other',
      relationship:
        'HOST | CO_HOST | OWNER | CREATOR | AUTHOR | GUEST | INTERVIEWER | INTERVIEWEE | PRIMARY_SUBJECT | MENTIONED',
      confidence: 'number from 0 to 1',
      evidenceText: 'short supporting phrase or null',
    },
  ],
  suggestedTags: [
    {
      name: 'string',
      kind: 'topic | entity | intent | format',
      confidence: 'number from 0 to 1',
    },
  ],
  userContext: {
    inferredSaveIntent: 'string',
    reasonToRevisit: 'string',
  },
  confidence: {
    overall: 'number from 0 to 1',
    summary: 'number from 0 to 1',
    classification: 'number from 0 to 1',
    tags: 'number from 0 to 1',
  },
};

export function buildArticleContent(content: string | null): string | null {
  return stripHtml(content ?? '') || null;
}

export function buildArticleExcerpt(content: string | null): string | null {
  return truncate(stripHtml(content ?? ''), EMBEDDING_ARTICLE_EXCERPT_LIMIT);
}

export function buildPromptInput(params: {
  item: EnrichmentSourceItem;
  creator: EnrichmentSourceCreator | null;
  articleContent: string | null;
}): EnrichmentPromptInput {
  return {
    item: params.item,
    creator: params.creator,
    articleContent: buildArticleContent(params.articleContent),
  };
}

export function buildEnrichmentMessages(input: EnrichmentPromptInput) {
  const metadataExcerpt = parseMetadataExcerpt(input.item.rawMetadata);

  const userContent = {
    task: 'Enrich this saved bookmark for a personal knowledge/recommendation app.',
    constraints: [
      'Return one JSON object with exactly these top-level keys: summary, classification, topics, entities, suggestedTags, userContext, confidence.',
      'Do not return only an entity list, a wrapper object, markdown, commentary, or prose outside JSON.',
      'Every entity must include name, type, relationship, confidence, and evidenceText.',
      'Prefer stable categories and short lowercase tag names.',
      'Do not invent facts not supported by the input.',
      'Use confidence below 0.6 when the input is thin or ambiguous.',
      'For each entity, set relationship to its role in this item: HOST, CO_HOST, OWNER, CREATOR, AUTHOR, GUEST, INTERVIEWER, INTERVIEWEE, PRIMARY_SUBJECT, or MENTIONED.',
      'For podcast, video, interview, and newsletter items, explicitly identify all supported human show hosts, co-hosts, owners, primary creators, and guests; do not collapse them into a generic person list.',
      'Use HOST or CO_HOST only for people who are explicitly framed as running/presenting the show or episode. Use OWNER/CREATOR only when the input supports ownership or primary creator status.',
      'If a show, publisher, or channel name is a brand rather than a human name, do not invent a person behind it.',
      'Set evidenceText to a short supporting phrase from the title, creator, metadata, or content when available; otherwise null.',
    ],
    item: {
      title: input.item.title,
      url: input.item.canonicalUrl,
      provider: input.item.provider,
      contentType: input.item.contentType,
      publisher: input.item.publisher,
      creator: formatCreator(input.creator),
      existingSummary: input.item.summary,
      metadataExcerpt,
      articleContent: input.articleContent,
    },
    outputContract: OUTPUT_CONTRACT,
  };

  return [
    {
      role: 'system',
      content:
        'You produce concise, valid JSON metadata for bookmarks. Keep tags useful for later recommendations.',
    },
    {
      role: 'user',
      content: JSON.stringify(userContent),
    },
  ];
}

export function buildEmbeddingText(params: {
  item: EnrichmentSourceItem;
  creator: EnrichmentSourceCreator | null;
  output: EnrichmentModelOutput;
  articleExcerpt: string | null;
}): string {
  const lines = [
    `Title: ${params.item.title}`,
    `Creator: ${formatCreator(params.creator)}`,
    `Publisher: ${params.item.publisher ?? ''}`,
    `Provider: ${params.item.provider}`,
    `Content type: ${params.item.contentType}`,
    `Summary: ${params.output.summary.short} ${params.output.summary.detail}`,
    `Primary category: ${params.output.classification.primaryCategory}`,
    `Topics: ${params.output.topics.map((topic) => topic.name).join(', ')}`,
    `Entities: ${params.output.entities
      .map((entity) => `${entity.name} (${entity.relationship})`)
      .join(', ')}`,
    params.articleExcerpt ? `Excerpt: ${params.articleExcerpt}` : '',
  ];

  return truncate(lines.filter(Boolean).join('\n'), EMBEDDING_TEXT_LIMIT) ?? '';
}
