import type { NormalizedArticleBody } from './normalization';

const BOILERPLATE_PHRASES = [
  'accept cookies',
  'cookie policy',
  'all rights reserved',
  'sign up for',
  'subscribe to',
  'advertisement',
  'already a subscriber',
  'log in to continue',
];

export type ArticleBodyQualityDisposition = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';

export interface ArticleBodyQualityAssessment {
  disposition: ArticleBodyQualityDisposition;
  score: number;
  warnings: string[];
}

export interface ArticleBodyQualityContext {
  expectedTitle?: string | null;
  extractedTitle?: string | null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function titleTokens(value: string | null | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length >= 4)
  );
}

function titlesConflict(expected: string | null | undefined, extracted: string | null | undefined) {
  const expectedTokens = titleTokens(expected);
  const extractedTokens = titleTokens(extracted);
  if (expectedTokens.size < 2 || extractedTokens.size < 2) return false;
  return ![...expectedTokens].some((token) => extractedTokens.has(token));
}

export function assessArticleBodyQuality(
  body: NormalizedArticleBody,
  context: ArticleBodyQualityContext = {}
): ArticleBodyQualityAssessment {
  const warnings: string[] = [];
  let score = 1;

  if (body.wordCount === 0) {
    return { disposition: 'UNAVAILABLE', score: 0, warnings: ['EMPTY_BODY'] };
  }

  if (body.wordCount < 40) {
    warnings.push('BODY_VERY_SHORT');
    score -= 0.65;
  } else if (body.wordCount < 120) {
    warnings.push('BODY_TOO_SHORT');
    score -= 0.35;
  }

  const lowerText = body.plainText.toLocaleLowerCase();
  const boilerplateMatches = BOILERPLATE_PHRASES.filter((phrase) => lowerText.includes(phrase));
  if (boilerplateMatches.length >= 2) {
    warnings.push('BOILERPLATE_HIGH');
    score -= 0.3;
  }

  const tail = lowerText.slice(-180);
  if (
    body.wordCount < 500 &&
    (/\.\.\.$/.test(tail) || /…$/.test(tail) || /(?:read|continue) more\s*$/.test(tail))
  ) {
    warnings.push('LIKELY_TRUNCATED');
    score -= 0.3;
  }

  if (/continue reading(?:\.{3}|…)?\s*$/.test(tail)) {
    warnings.push('TRAILING_RELATED_CONTENT');
    score -= 0.35;
  } else if (/no posts\s*$/.test(tail)) {
    warnings.push('TRAILING_BOILERPLATE');
    score -= 0.05;
  }

  if (body.wordCount >= 150 && body.blocks.length < 2) {
    warnings.push('NO_PARAGRAPH_STRUCTURE');
    score -= 0.1;
  }

  const linkDensity =
    body.diagnostics.totalTextCharacters === 0
      ? 0
      : body.diagnostics.linkTextCharacters / body.diagnostics.totalTextCharacters;
  if (linkDensity > 0.35) {
    warnings.push('LINK_DENSITY_HIGH');
    score -= 0.25;
  }

  if (titlesConflict(context.expectedTitle, context.extractedTitle)) {
    warnings.push('TITLE_MISMATCH');
    score -= 0.25;
  }

  if (body.diagnostics.droppedElements > 0 || body.diagnostics.blockedUrls > 0) {
    warnings.push('UNSAFE_MARKUP_REMOVED');
  }

  score = Number(clamp(score).toFixed(2));
  const disposition: ArticleBodyQualityDisposition =
    body.wordCount >= 120 && score >= 0.7
      ? 'AVAILABLE'
      : body.wordCount >= 40 && score >= 0.35
        ? 'DEGRADED'
        : 'UNAVAILABLE';

  return { disposition, score, warnings };
}
