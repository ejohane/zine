import { describe, expect, test } from 'bun:test';
import { scoreReview } from '../../packages/shared/src/tag-classifier/review';

describe('human review scoring', () => {
  test('partial labels leave extras unknown and expose review coverage', () => {
    const result = scoreReview(['rust', 'programming', 'strategy'], {
      expectedGroups: [['rust']],
      acceptable: ['programming'],
      unwanted: [],
      exhaustive: false,
    });
    expect(result.reviewedPrecision).toBe(1);
    expect(result.unknown).toEqual(['strategy']);
    expect(result.reviewCoverage).toBe(2 / 3);
    expect(result.completeForPrecision).toBe(false);
  });
  test('aliases and alternatives count a required concept once', () => {
    const result = scoreReview(
      ['LLM', 'language-models', 'staff-engineer'],
      {
        expectedGroups: [['language-models'], ['principal-engineer', 'staff-engineer']],
        acceptable: [],
        unwanted: [],
        exhaustive: true,
      },
      { LLM: 'language-models' }
    );
    expect(result.useful.length).toBe(2);
    expect(result.recovered).toBe(2);
    expect(result.recovery).toBe(1);
  });
  test('exhaustive labels reject extras; conflicting labels fail', () => {
    expect(
      scoreReview(['ai'], { expectedGroups: [], acceptable: [], unwanted: [], exhaustive: true })
        .unwanted
    ).toEqual(['ai']);
    expect(() =>
      scoreReview([], {
        expectedGroups: [['ai']],
        acceptable: [],
        unwanted: ['ai'],
        exhaustive: false,
      })
    ).toThrow();
    expect(
      scoreReview([], { expectedGroups: [], acceptable: [], unwanted: [], exhaustive: true })
        .reviewedPrecision
    ).toBeNull();
  });
});
