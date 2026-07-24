import { extractArticleFromHtml } from '../lib/article-extractor';
import { buildArticleBodyArtifact } from './artifact';
import { normalizeArticleBodyHtml, type NormalizedArticleBody } from './normalization';
import {
  assessArticleBodyQuality,
  type ArticleBodyQualityAssessment,
  type ArticleBodyQualityDisposition,
} from './quality';
import {
  ARTICLE_BODY_EXTRACTOR_VERSION,
  type ArticleBodyArtifact,
  type ArticleBodyEmbeddedCandidate,
  type ArticleBodySourceKind,
} from './types';
import { isSafePublicArticleUrl } from './url-safety';

export { isSafePublicArticleUrl } from './url-safety';

const ARTICLE_FETCH_TIMEOUT_MS = 12_000;
const MAX_ARTICLE_HTML_BYTES = 5 * 1024 * 1024;
const MAX_ARTICLE_REDIRECTS = 5;

function resolvePublicArticleFetchUrl(canonicalUrl: string): string {
  const url = new URL(canonicalUrl);
  if (url.hostname.toLowerCase() !== 'open.substack.com') return canonicalUrl;

  const match = /^\/pub\/([a-z0-9-]+)\/p\/([a-z0-9-]+)\/?$/i.exec(url.pathname);
  if (!match) return canonicalUrl;
  return `https://${match[1]}.substack.com/p/${match[2]}`;
}

function resolveSubstackPostApiUrl(articleUrl: string): string | null {
  const url = new URL(articleUrl);
  const match = /^\/p\/([a-z0-9-]+)\/?$/i.exec(url.pathname);
  if (!match) return null;
  return new URL(`/api/v1/posts/${match[1]}`, url.origin).href;
}

export interface ArticleBodyAcquisitionInput {
  itemId: string;
  canonicalUrl: string;
  title: string;
  byline?: string | null;
  publisher?: string | null;
  publishedAt?: string | null;
  language?: string | null;
  embeddedCandidates?: ArticleBodyEmbeddedCandidate[];
}

export interface ArticleBodyAcquisitionAttempt {
  sourceKind: ArticleBodySourceKind;
  sourceUrl: string;
  disposition: ArticleBodyQualityDisposition;
  qualityScore: number;
  qualityWarnings: string[];
  wordCount: number;
  httpStatus: number | null;
  errorCode: string | null;
}

export interface ArticleBodyAcquisitionResult {
  status: ArticleBodyQualityDisposition;
  artifact: ArticleBodyArtifact | null;
  attempts: ArticleBodyAcquisitionAttempt[];
  errorCode: string | null;
  lastHttpStatus: number | null;
}

export interface ArticleBodyAcquisitionDependencies {
  fetch?: typeof fetch;
  now?: () => number;
  extractorVersion?: number;
}

interface EvaluatedCandidate {
  artifact: ArticleBodyArtifact | null;
  assessment: ArticleBodyQualityAssessment;
  normalized: NormalizedArticleBody;
  attempt: ArticleBodyAcquisitionAttempt;
}

async function evaluateCandidate(
  input: ArticleBodyAcquisitionInput,
  candidate: {
    html: string;
    sourceKind: ArticleBodySourceKind;
    sourceUrl: string;
    extractedTitle?: string | null;
    byline?: string | null;
    publisher?: string | null;
    publishedAt?: string | null;
    httpStatus?: number | null;
  },
  extractedAt: number,
  extractorVersion: number
): Promise<EvaluatedCandidate> {
  const normalized = normalizeArticleBodyHtml(candidate.html, input.canonicalUrl);
  const assessment = assessArticleBodyQuality(normalized, {
    expectedTitle: input.title,
    extractedTitle: candidate.extractedTitle ?? input.title,
  });
  const attempt: ArticleBodyAcquisitionAttempt = {
    sourceKind: candidate.sourceKind,
    sourceUrl: candidate.sourceUrl,
    disposition: assessment.disposition,
    qualityScore: assessment.score,
    qualityWarnings: assessment.warnings,
    wordCount: normalized.wordCount,
    httpStatus: candidate.httpStatus ?? null,
    errorCode: assessment.disposition === 'UNAVAILABLE' ? 'QUALITY_REJECTED' : null,
  };

  const artifact =
    assessment.disposition === 'UNAVAILABLE'
      ? null
      : await buildArticleBodyArtifact({
          extractorVersion,
          itemId: input.itemId,
          canonicalUrl: input.canonicalUrl,
          title: input.title,
          byline: candidate.byline ?? input.byline ?? null,
          publisher: candidate.publisher ?? input.publisher ?? null,
          publishedAt: candidate.publishedAt ?? input.publishedAt ?? null,
          language: input.language ?? null,
          sourceKind: candidate.sourceKind,
          sourceUrl: candidate.sourceUrl,
          extractedAt,
          wordCount: normalized.wordCount,
          readingTimeMinutes: normalized.readingTimeMinutes,
          qualityScore: assessment.score,
          qualityWarnings: assessment.warnings,
          sanitizedHtml: normalized.sanitizedHtml,
          plainText: normalized.plainText,
          blocks: normalized.blocks,
        });

  return { artifact, assessment, normalized, attempt };
}

function failedAttempt(
  input: ArticleBodyAcquisitionInput,
  errorCode: string,
  options: { httpStatus?: number | null; sourceUrl?: string } = {}
): ArticleBodyAcquisitionAttempt {
  return {
    sourceKind: 'PUBLIC_WEB',
    sourceUrl: options.sourceUrl ?? input.canonicalUrl,
    disposition: 'UNAVAILABLE',
    qualityScore: 0,
    qualityWarnings: [],
    wordCount: 0,
    httpStatus: options.httpStatus ?? null,
    errorCode,
  };
}

async function fetchSubstackApiCandidate(
  input: ArticleBodyAcquisitionInput,
  articleUrl: string,
  fetchImplementation: typeof fetch,
  extractedAt: number,
  extractorVersion: number,
  signal: AbortSignal
): Promise<EvaluatedCandidate | null> {
  const apiUrl = resolveSubstackPostApiUrl(articleUrl);
  if (!apiUrl || !isSafePublicArticleUrl(apiUrl)) return null;

  let responseUrl = apiUrl;
  let response: Response | null = null;
  for (let redirects = 0; redirects <= MAX_ARTICLE_REDIRECTS; redirects += 1) {
    response = await fetchImplementation(responseUrl, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': 'ZineBot/2.0 (+https://zine.app/bot)',
        Accept: 'application/json',
      },
    });
    if (response.status < 300 || response.status >= 400) break;

    const location = response.headers.get('location');
    if (!location || redirects === MAX_ARTICLE_REDIRECTS) return null;
    const nextUrl = new URL(location, responseUrl).href;
    if (!isSafePublicArticleUrl(nextUrl)) return null;
    responseUrl = nextUrl;
  }

  if (!response?.ok) return null;
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_ARTICLE_HTML_BYTES) return null;
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_ARTICLE_HTML_BYTES) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const post = payload as Record<string, unknown>;
  if (typeof post.body_html !== 'string' || post.body_html.trim().length === 0) return null;

  return evaluateCandidate(
    input,
    {
      html: post.body_html,
      sourceKind: 'PUBLIC_NEWSLETTER',
      sourceUrl: responseUrl,
      extractedTitle: typeof post.title === 'string' ? post.title : null,
      publishedAt: typeof post.post_date === 'string' ? post.post_date : null,
      httpStatus: response.status,
    },
    extractedAt,
    extractorVersion
  );
}

async function fetchPublicCandidate(
  input: ArticleBodyAcquisitionInput,
  fetchImplementation: typeof fetch,
  extractedAt: number,
  extractorVersion: number
): Promise<{ evaluated: EvaluatedCandidate | null; attempt: ArticleBodyAcquisitionAttempt }> {
  if (!isSafePublicArticleUrl(input.canonicalUrl)) {
    return { evaluated: null, attempt: failedAttempt(input, 'UNSAFE_URL') };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
  try {
    let response: Response | null = null;
    let responseUrl = resolvePublicArticleFetchUrl(input.canonicalUrl);
    for (let redirects = 0; redirects <= MAX_ARTICLE_REDIRECTS; redirects += 1) {
      response = await fetchImplementation(responseUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'ZineBot/2.0 (+https://zine.app/bot)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get('location');
      if (!location) {
        return {
          evaluated: null,
          attempt: failedAttempt(input, 'REDIRECT_WITHOUT_LOCATION', {
            httpStatus: response.status,
            sourceUrl: responseUrl,
          }),
        };
      }
      const nextUrl = new URL(location, responseUrl).href;
      if (!isSafePublicArticleUrl(nextUrl)) {
        return {
          evaluated: null,
          attempt: failedAttempt(input, 'UNSAFE_REDIRECT', {
            httpStatus: response.status,
            sourceUrl: nextUrl,
          }),
        };
      }
      if (redirects === MAX_ARTICLE_REDIRECTS) {
        return {
          evaluated: null,
          attempt: failedAttempt(input, 'TOO_MANY_REDIRECTS', {
            httpStatus: response.status,
            sourceUrl: responseUrl,
          }),
        };
      }
      responseUrl = nextUrl;
    }
    if (!response) throw new Error('Article fetch returned no response');
    if (!response.ok) {
      const substackCandidate = await fetchSubstackApiCandidate(
        input,
        responseUrl,
        fetchImplementation,
        extractedAt,
        extractorVersion,
        controller.signal
      );
      if (substackCandidate) {
        return { evaluated: substackCandidate, attempt: substackCandidate.attempt };
      }
      return {
        evaluated: null,
        attempt: failedAttempt(input, `HTTP_${response.status}`, {
          httpStatus: response.status,
          sourceUrl: responseUrl,
        }),
      };
    }

    const contentType = response.headers.get('content-type')?.toLocaleLowerCase() ?? '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('xhtml')) {
      return {
        evaluated: null,
        attempt: failedAttempt(input, 'UNSUPPORTED_CONTENT_TYPE', {
          httpStatus: response.status,
          sourceUrl: responseUrl,
        }),
      };
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_ARTICLE_HTML_BYTES) {
      return {
        evaluated: null,
        attempt: failedAttempt(input, 'BODY_TOO_LARGE', {
          httpStatus: response.status,
          sourceUrl: responseUrl,
        }),
      };
    }

    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_ARTICLE_HTML_BYTES) {
      return {
        evaluated: null,
        attempt: failedAttempt(input, 'BODY_TOO_LARGE', {
          httpStatus: response.status,
          sourceUrl: responseUrl,
        }),
      };
    }
    const extracted = extractArticleFromHtml(html, responseUrl);
    if (!extracted?.isArticle || !extracted.content) {
      return {
        evaluated: null,
        attempt: failedAttempt(input, 'NOT_READERABLE', {
          httpStatus: response.status,
          sourceUrl: responseUrl,
        }),
      };
    }

    const evaluated = await evaluateCandidate(
      input,
      {
        html: extracted.content,
        sourceKind: 'PUBLIC_WEB',
        sourceUrl: responseUrl,
        extractedTitle: extracted.title,
        byline: extracted.author,
        publisher: extracted.siteName,
        publishedAt: extracted.publishedAt,
        httpStatus: response.status,
      },
      extractedAt,
      extractorVersion
    );
    return { evaluated, attempt: evaluated.attempt };
  } catch {
    const errorCode = controller.signal.aborted ? 'FETCH_TIMEOUT' : 'FETCH_FAILED';
    return { evaluated: null, attempt: failedAttempt(input, errorCode) };
  } finally {
    clearTimeout(timeout);
  }
}

function betterCandidate(
  current: EvaluatedCandidate | null,
  candidate: EvaluatedCandidate
): EvaluatedCandidate {
  if (!current) return candidate;
  if (candidate.assessment.score !== current.assessment.score) {
    return candidate.assessment.score > current.assessment.score ? candidate : current;
  }
  return candidate.normalized.wordCount > current.normalized.wordCount ? candidate : current;
}

export async function acquireArticleBody(
  input: ArticleBodyAcquisitionInput,
  dependencies: ArticleBodyAcquisitionDependencies = {}
): Promise<ArticleBodyAcquisitionResult> {
  const fetchImplementation = dependencies.fetch ?? fetch;
  const extractedAt = dependencies.now?.() ?? Date.now();
  const extractorVersion = dependencies.extractorVersion ?? ARTICLE_BODY_EXTRACTOR_VERSION;
  const attempts: ArticleBodyAcquisitionAttempt[] = [];
  let bestDegraded: EvaluatedCandidate | null = null;

  for (const candidate of input.embeddedCandidates ?? []) {
    let evaluated: EvaluatedCandidate;
    try {
      evaluated = await evaluateCandidate(input, candidate, extractedAt, extractorVersion);
    } catch {
      attempts.push({
        sourceKind: candidate.sourceKind,
        sourceUrl: candidate.sourceUrl,
        disposition: 'UNAVAILABLE',
        qualityScore: 0,
        qualityWarnings: [],
        wordCount: 0,
        httpStatus: null,
        errorCode: 'NORMALIZATION_FAILED',
      });
      continue;
    }
    attempts.push(evaluated.attempt);
    if (evaluated.assessment.disposition === 'AVAILABLE') {
      return {
        status: 'AVAILABLE',
        artifact: evaluated.artifact,
        attempts,
        errorCode: null,
        lastHttpStatus: null,
      };
    }
    if (evaluated.assessment.disposition === 'DEGRADED') {
      bestDegraded = betterCandidate(bestDegraded, evaluated);
    }
  }

  const publicResult = await fetchPublicCandidate(
    input,
    fetchImplementation,
    extractedAt,
    extractorVersion
  );
  attempts.push(publicResult.attempt);
  if (publicResult.evaluated?.assessment.disposition === 'AVAILABLE') {
    return {
      status: 'AVAILABLE',
      artifact: publicResult.evaluated.artifact,
      attempts,
      errorCode: null,
      lastHttpStatus: publicResult.attempt.httpStatus,
    };
  }
  if (publicResult.evaluated?.assessment.disposition === 'DEGRADED') {
    bestDegraded = betterCandidate(bestDegraded, publicResult.evaluated);
  }
  if (bestDegraded) {
    return {
      status: 'DEGRADED',
      artifact: bestDegraded.artifact,
      attempts,
      errorCode: null,
      lastHttpStatus: publicResult.attempt.httpStatus,
    };
  }

  return {
    status: 'UNAVAILABLE',
    artifact: null,
    attempts,
    errorCode: publicResult.attempt.errorCode ?? 'NO_ACCEPTABLE_BODY',
    lastHttpStatus: publicResult.attempt.httpStatus,
  };
}

export const articleBodyAcquisitionLimits = {
  fetchTimeoutMs: ARTICLE_FETCH_TIMEOUT_MS,
  maxHtmlBytes: MAX_ARTICLE_HTML_BYTES,
  maxRedirects: MAX_ARTICLE_REDIRECTS,
};

export const articleBodyAcquisitionInternals = {
  resolvePublicArticleFetchUrl,
  resolveSubstackPostApiUrl,
};
