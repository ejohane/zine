import { expect, test } from 'bun:test';
import {
  qualityGate,
  type ReviewedPrediction,
} from '../../packages/shared/src/tag-classifier/quality-gate';
const cases = (): ReviewedPrediction[] =>
  Array.from({ length: 40 }, (_, i) => ({
    bookmarkId: String(i),
    coverage: i % 2 ? 'FULL_CONTENT' : 'DESCRIPTION_ONLY',
    reviewed: true,
    suggestions: ['ai'],
    labels: { expectedGroups: [['ai']], acceptable: [], unwanted: [], exhaustive: false },
  }));
test('release quality gate requires size, human judgments and all extras reviewed', () => {
  expect(qualityGate(cases()).passes).toBe(true);
  expect(qualityGate(cases().slice(1)).passes).toBe(false);
  const unknown = cases();
  unknown[0].suggestions.push('strategy');
  expect(qualityGate(unknown).passes).toBe(false);
  const pending = cases();
  pending[0].reviewed = false;
  expect(qualityGate(pending).passes).toBe(false);
});
test('reports micro scores and coverage failures without null-as-zero', () => {
  const failed = cases();
  for (let i = 0; i < 10; i++) failed[i].suggestions = ['strategy'];
  const gate = qualityGate(failed);
  expect(gate.overall.recovery).toBe(0.75);
  expect(gate.passes).toBe(false);
  expect(Object.keys(gate.byCoverage).length).toBe(2);
  expect(qualityGate([]).overall.precision).toBeNull();
  expect(() => qualityGate([cases()[0], cases()[0]])).toThrow('Duplicate');
});
