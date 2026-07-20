import { EditorialCandidateArtifactSchema, EditorialSnapshotSchema } from '@zine/editorial-schema';
import { dirname, join } from 'node:path';

import { buildEditorialCandidateArtifact } from './candidates';

export type EditorialReplayRow = {
  editionDate: string;
  snapshotId: string;
  previousStrategy: 'X_LED_V1' | 'EDITORIAL_V2' | null;
  previousCandidateCount: number | null;
  v2CandidateCount: number;
  selectedCount: number;
  uniqueCreators: number;
  uniqueDomains: number;
  maxPairwiseSimilarity: number;
  corpusTopicConcentration: number;
  selectedTopicConcentration: number;
  historicalRepeatRiskCount: number;
  originCounts: { x: number; zine: number; external: number };
};

export type EditorialReplayReport = {
  schemaVersion: 1;
  generatedAt: string;
  directory: string;
  snapshots: number;
  rows: EditorialReplayRow[];
  aggregate: {
    averageSelectedCount: number;
    averageUniqueCreators: number;
    averageUniqueDomains: number;
    averageMaxPairwiseSimilarity: number;
    averageCorpusTopicConcentration: number;
    averageSelectedTopicConcentration: number;
    totalHistoricalRepeatRisks: number;
  };
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return (
    Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1_000) / 1_000
  );
}

export async function replayEditorialDirectory(
  directory: string,
  generatedAt = new Date()
): Promise<EditorialReplayReport> {
  const snapshotPaths: string[] = [];
  const glob = new Bun.Glob('**/snapshot.json');
  for await (const path of glob.scan({ cwd: directory, absolute: true, onlyFiles: true })) {
    snapshotPaths.push(path);
  }
  snapshotPaths.sort();

  const rows: EditorialReplayRow[] = [];
  const replayedSnapshotIds = new Set<string>();
  for (const snapshotPath of snapshotPaths) {
    const snapshot = EditorialSnapshotSchema.parse(await Bun.file(snapshotPath).json());
    if (replayedSnapshotIds.has(snapshot.id)) continue;
    replayedSnapshotIds.add(snapshot.id);
    const v2 = buildEditorialCandidateArtifact(snapshot, new Date(snapshot.generatedAt));
    if (v2.strategy !== 'EDITORIAL_V2') throw new Error('Replay ranker did not produce v2');
    const previousPath = join(dirname(snapshotPath), 'candidates.json');
    let previousStrategy: EditorialReplayRow['previousStrategy'] = null;
    let previousCandidateCount: number | null = null;
    if (await Bun.file(previousPath).exists()) {
      const parsed = EditorialCandidateArtifactSchema.safeParse(
        await Bun.file(previousPath).json()
      );
      if (parsed.success) {
        previousStrategy = parsed.data.strategy;
        previousCandidateCount = parsed.data.candidates.length;
      }
    }
    rows.push({
      editionDate: snapshot.editionDate,
      snapshotId: snapshot.id,
      previousStrategy,
      previousCandidateCount,
      v2CandidateCount: v2.candidates.length,
      selectedCount: v2.portfolio.diagnostics.selectedCount,
      uniqueCreators: v2.portfolio.diagnostics.uniqueCreators,
      uniqueDomains: v2.portfolio.diagnostics.uniqueDomains,
      maxPairwiseSimilarity: v2.portfolio.diagnostics.maxPairwiseSimilarity,
      corpusTopicConcentration: v2.portfolio.diagnostics.corpusTopicConcentration,
      selectedTopicConcentration: v2.portfolio.diagnostics.selectedTopicConcentration,
      historicalRepeatRiskCount: v2.portfolio.diagnostics.historicalRepeatRiskCount,
      originCounts: v2.portfolio.diagnostics.originCounts,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    directory,
    snapshots: rows.length,
    rows,
    aggregate: {
      averageSelectedCount: average(rows.map((row) => row.selectedCount)),
      averageUniqueCreators: average(rows.map((row) => row.uniqueCreators)),
      averageUniqueDomains: average(rows.map((row) => row.uniqueDomains)),
      averageMaxPairwiseSimilarity: average(rows.map((row) => row.maxPairwiseSimilarity)),
      averageCorpusTopicConcentration: average(rows.map((row) => row.corpusTopicConcentration)),
      averageSelectedTopicConcentration: average(rows.map((row) => row.selectedTopicConcentration)),
      totalHistoricalRepeatRisks: rows.reduce((sum, row) => sum + row.historicalRepeatRiskCount, 0),
    },
  };
}
