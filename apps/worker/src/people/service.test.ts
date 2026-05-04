import { describe, expect, it } from 'vitest';

import { extractPersonEntities, normalizePersonName } from './service';

describe('people service helpers', () => {
  it('normalizes person names conservatively', () => {
    expect(normalizePersonName('  Joe   Rogan  ')).toBe('joe rogan');
    expect(normalizePersonName('"Sam Harris."')).toBe('sam harris');
    expect(normalizePersonName('Joseph Rogan')).toBe('joseph rogan');
  });

  it('extracts high-confidence PERSON entities and dedupes by normalized name', () => {
    const people = extractPersonEntities(
      JSON.stringify([
        { name: 'Joe Rogan', type: 'PERSON', confidence: 0.9 },
        { name: 'joe rogan', type: 'person', confidence: 0.7 },
        { name: 'OpenAI', type: 'ORG', confidence: 0.95 },
        { name: 'Low Confidence', type: 'PERSON', confidence: 0.4 },
        { name: 'Sam Harris', type: 'PERSON', confidence: 0.8 },
      ])
    );

    expect(people).toEqual([
      {
        rawName: 'Joe Rogan',
        rawType: 'PERSON',
        displayName: 'Joe Rogan',
        normalizedName: 'joe rogan',
        confidence: 0.9,
      },
      {
        rawName: 'Sam Harris',
        rawType: 'PERSON',
        displayName: 'Sam Harris',
        normalizedName: 'sam harris',
        confidence: 0.8,
      },
    ]);
  });

  it('returns no candidates for malformed enrichment JSON', () => {
    expect(extractPersonEntities('{not json')).toEqual([]);
    expect(extractPersonEntities(JSON.stringify({ name: 'Joe Rogan' }))).toEqual([]);
  });
});
