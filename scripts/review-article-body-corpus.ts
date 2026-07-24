import path from 'node:path';

import {
  acquireArticleBody,
  type ArticleBodyAcquisitionResult,
} from '../apps/worker/src/article-body/acquisition';
import { parseRssFeedXml } from '../apps/worker/src/rss/parser';

interface CorpusCase {
  id: string;
  category: 'feed' | 'web' | 'substack';
  url: string;
  title?: string;
}

interface CorpusFile {
  version: number;
  cases: CorpusCase[];
}

interface ReviewRow {
  id: string;
  category: CorpusCase['category'];
  canonicalUrl: string;
  title: string;
  status: ArticleBodyAcquisitionResult['status'];
  sourceKind: string | null;
  qualityScore: number;
  wordCount: number;
  warnings: string[];
  attempts: ArticleBodyAcquisitionResult['attempts'];
  excerpt: string;
  middleExcerpt: string;
  endingExcerpt: string;
  errorCode: string | null;
}

const DEFAULT_CORPUS = path.resolve('scripts/fixtures/article-body-review-corpus.json');
const FETCH_TIMEOUT_MS = 20_000;

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': 'ZineBodyReview/1.0 (+https://zine.app/bot)',
      Accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml,text/html',
    },
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.text();
}

function compactExcerpt(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function excerptAt(value: string, ratio: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= 240) return compact;
  const start = Math.max(0, Math.min(compact.length - 240, Math.floor(compact.length * ratio)));
  return compact.slice(start, start + 240);
}

async function runCase(entry: CorpusCase): Promise<ReviewRow> {
  try {
    let canonicalUrl = entry.url;
    let title = entry.title ?? entry.id;
    let publisher: string | null = null;
    let publishedAt: string | null = null;
    let embeddedCandidates: Parameters<typeof acquireArticleBody>[0]['embeddedCandidates'];

    if (entry.category === 'feed') {
      const parsed = parseRssFeedXml(await fetchText(entry.url), entry.url);
      const latest = parsed.entries[0];
      if (!latest) throw new Error('FEED_EMPTY');
      canonicalUrl = latest.canonicalUrl;
      title = latest.title;
      publisher = parsed.title ?? null;
      publishedAt = latest.publishedAt ? new Date(latest.publishedAt).toISOString() : null;
      embeddedCandidates = latest.articleBodyCandidate ? [latest.articleBodyCandidate] : [];
    }

    const result = await acquireArticleBody({
      itemId: `review:${entry.id}`,
      canonicalUrl,
      title,
      publisher,
      publishedAt,
      embeddedCandidates,
    });

    return {
      id: entry.id,
      category: entry.category,
      canonicalUrl,
      title,
      status: result.status,
      sourceKind: result.artifact?.sourceKind ?? null,
      qualityScore: result.artifact?.qualityScore ?? 0,
      wordCount: result.artifact?.wordCount ?? 0,
      warnings: result.artifact?.qualityWarnings ?? [],
      attempts: result.attempts,
      excerpt: compactExcerpt(result.artifact?.plainText ?? ''),
      middleExcerpt: excerptAt(result.artifact?.plainText ?? '', 0.5),
      endingExcerpt: excerptAt(result.artifact?.plainText ?? '', 1),
      errorCode: result.errorCode,
    };
  } catch (error) {
    return {
      id: entry.id,
      category: entry.category,
      canonicalUrl: entry.url,
      title: entry.title ?? entry.id,
      status: 'UNAVAILABLE',
      sourceKind: null,
      qualityScore: 0,
      wordCount: 0,
      warnings: [],
      attempts: [],
      excerpt: '',
      middleExcerpt: '',
      endingExcerpt: '',
      errorCode: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await operation(values[index]);
      }
    })
  );
  return results;
}

function markdownReport(report: {
  generatedAt: string;
  corpusVersion: number;
  summary: Record<string, number | boolean>;
  rows: ReviewRow[];
}): string {
  const lines = [
    '# Article-body extraction review',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Corpus: ${report.summary.total} cases · available ${report.summary.available} · degraded ${report.summary.degraded} · unavailable ${report.summary.unavailable}`,
    '',
    `Availability: ${report.summary.availabilityPercent}% · high-quality among available: ${report.summary.highQualityPercent}% · automated gate: ${report.summary.meetsAutomatedGate ? 'PASS' : 'FAIL'}`,
    '',
    '| Case | Category | Result | Source | Score | Words | Warnings |',
    '| --- | --- | --- | --- | ---: | ---: | --- |',
  ];

  for (const row of report.rows) {
    lines.push(
      `| ${row.id} | ${row.category} | ${row.status} | ${row.sourceKind ?? '—'} | ${row.qualityScore.toFixed(2)} | ${row.wordCount} | ${row.warnings.join(', ') || '—'} |`
    );
  }
  lines.push('', '## Manual reading samples', '');
  for (const row of report.rows) {
    lines.push(`### ${row.id}`, '', `[Original](${row.canonicalUrl})`, '');
    if (!row.excerpt) {
      lines.push(`No body available (${row.errorCode ?? 'unknown error'}).`, '');
      continue;
    }
    lines.push(`Start: ${row.excerpt}`, '', `Middle: ${row.middleExcerpt}`, '');
    lines.push(`End: ${row.endingExcerpt}`, '');
  }
  return `${lines.join('\n')}\n`;
}

const corpusPath = path.resolve(argumentValue('--corpus') ?? DEFAULT_CORPUS);
const corpus = (await Bun.file(corpusPath).json()) as CorpusFile;
const rows = await mapWithConcurrency(corpus.cases, 4, runCase);
const available = rows.filter((row) => row.status === 'AVAILABLE').length;
const degraded = rows.filter((row) => row.status === 'DEGRADED').length;
const unavailable = rows.length - available - degraded;
const availableBodies = available + degraded;
const availabilityPercent = Number(((availableBodies / rows.length) * 100).toFixed(1));
const highQualityPercent = Number(
  ((availableBodies === 0 ? 0 : available / availableBodies) * 100).toFixed(1)
);
const report = {
  generatedAt: new Date().toISOString(),
  corpusVersion: corpus.version,
  summary: {
    total: rows.length,
    available,
    degraded,
    unavailable,
    availabilityPercent,
    highQualityPercent,
    meetsAutomatedGate: availabilityPercent >= 90 && highQualityPercent >= 95,
  },
  rows,
};

const timestamp = report.generatedAt.replace(/[:.]/g, '-');
const outputDirectory = path.resolve('.local-data/article-body/reviews');
const jsonPath = path.join(outputDirectory, `${timestamp}.json`);
const markdownPath = path.join(outputDirectory, `${timestamp}.md`);
await Bun.write(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
await Bun.write(markdownPath, markdownReport(report));

console.log(JSON.stringify({ summary: report.summary, jsonPath, markdownPath }, null, 2));

if (!report.summary.meetsAutomatedGate) process.exitCode = 1;
