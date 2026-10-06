import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  CatalogSchema,
  DatasetSchema,
  RunSchema,
  POLICY_VERSION,
} from '../../packages/shared/src/tag-classifier/core';
import { chunkTranscript } from './transcript';
import { classify, hash } from './jev';

/** Research-only comparison. All chunks are retained; aggregation remains an experiment. */
export async function transcriptExperiment(
  datasetPath: string,
  transcriptDirectory: string,
  out: string
) {
  const dataset = DatasetSchema.parse(await Bun.file(datasetPath).json());
  const catalog = CatalogSchema.parse(
    await Bun.file(
      resolve(import.meta.dir, '../../packages/shared/src/tag-classifier/catalog.json')
    ).json()
  );
  const manifest = (await Bun.file(join(transcriptDirectory, 'manifest.json')).json()) as Array<{
    videoId: string;
    title: string;
    status: string;
    file?: string;
  }>;
  await mkdir(out, { recursive: true });
  const rows = [];
  for (const entry of manifest.filter((e) => e.status === 'ACQUIRED')) {
    const c = dataset.cases.find((c) => c.input.title === entry.title);
    if (!c || !entry.file || !/^[A-Za-z0-9_-]{11}\.transcript\.json$/.test(entry.file))
      throw new Error('Transcript manifest does not match dataset.');
    const { transcript, chunks } = chunkTranscript(
      await Bun.file(join(transcriptDirectory, entry.file)).json()
    );
    if (transcript.videoId !== entry.videoId) throw new Error('Transcript video ID mismatch.');
    const inputs = [
      c.input,
      ...chunks.map((chunk, index) => ({
        ...c.input,
        text: chunk.text,
        coverage: 'PARTIAL_CONTENT' as const,
        warnings: [...transcript.warnings, `TRANSCRIPT_CHUNK_${index + 1}_OF_${chunks.length}`],
      })),
    ];
    const runs: Array<Awaited<ReturnType<typeof classify>>> = [];
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const path = join(
        out,
        `${entry.videoId}-${i}-${hash({ input, catalog, policy: POLICY_VERSION })}.json`
      );
      const run = existsSync(path)
        ? RunSchema.parse(await Bun.file(path).json())
        : await classify(input, catalog, {
            apiKey: process.env.TYPESAFE_API_KEY,
            model: 'jev-1.13.0',
            price: 0.042,
          });
      if (
        run.inputHash !== hash(input) ||
        run.catalogHash !== hash(catalog) ||
        run.policyVersion !== POLICY_VERSION ||
        run.requestedModel !== 'jev-1.13.0'
      )
        throw new Error('Incompatible saved experiment run.');
      if (!existsSync(path)) await Bun.write(path, JSON.stringify(run, null, 2) + '\n');
      runs.push(run);
    }
    const tags = catalog.tags.map((tag) => {
      const support = runs.slice(1).flatMap((r, index) =>
        r.probabilities[tag.id] >= 0.8
          ? [
              {
                chunk: index + 1,
                startMs: chunks[index].startMs,
                endMs: chunks[index].endMs,
                probability: r.probabilities[tag.id],
              },
            ]
          : []
      );
      return {
        id: tag.id,
        name: tag.name,
        descriptionProbability: runs[0].probabilities[tag.id],
        maxTranscriptProbability: Math.max(...runs.slice(1).map((r) => r.probabilities[tag.id])),
        support,
        descriptionSuggested: runs[0].probabilities[tag.id] >= 0.8,
        transcriptSuggested: support.length >= Math.min(2, chunks.length),
      };
    });
    rows.push({
      bookmarkId: c.input.bookmarkId,
      title: c.input.title,
      videoId: entry.videoId,
      acquisition: transcript.acquisition,
      textHash: transcript.textSha256,
      chunkCount: chunks.length,
      tags,
      estimatedCostUsd: runs.reduce((n, r) => n + r.estimatedCostUsd, 0),
      apiLatencyMs: runs.reduce((n, r) => n + r.latencyMs, 0),
    });
  }
  const result = {
    version: 1,
    policyVersion: POLICY_VERSION,
    catalogHash: hash(catalog),
    datasetHash: hash(dataset),
    threshold: 0.8,
    aggregation:
      'at least two supporting chunks (one if only one chunk); experimental, not validated',
    rows,
  };
  await Bun.write(join(out, 'comparison.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({
      episodes: rows.length,
      chunkCount: rows.reduce((n, r) => n + r.chunkCount, 0),
      estimatedCostUsd: rows.reduce((n, r) => n + r.estimatedCostUsd, 0),
      report: join(out, 'comparison.json'),
    })
  );
}
if (import.meta.main) {
  const [dataset, transcripts, out] = process.argv.slice(2);
  if (!dataset || !transcripts || !out)
    throw new Error(
      'Usage: bun transcript-experiment.ts DATASET TRANSCRIPT_DIRECTORY OUTPUT_DIRECTORY'
    );
  await transcriptExperiment(dataset, transcripts, out);
}
