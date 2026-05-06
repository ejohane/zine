import { describe, expect, it } from 'vitest';

import {
  extractPersonEntities,
  getProfileImageCandidateForPerson,
  normalizePersonName,
} from './service';

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

  it('prefers X profile image candidates when a matching X creator exists', () => {
    expect(
      getProfileImageCandidateForPerson(
        { normalizedName: 'joe rogan' },
        {
          provider: 'X',
          normalizedName: 'joe rogan',
          imageUrl: 'https://pbs.twimg.com/profile_images/joe.jpg',
          externalUrl: 'https://x.com/joerogan',
          handle: 'joerogan',
        }
      )
    ).toEqual({
      imageUrl: 'https://pbs.twimg.com/profile_images/joe.jpg',
      source: 'X',
      sourceUrl: 'https://x.com/joerogan',
      xHandle: 'joerogan',
    });
  });

  it('uses matching non-X creator images as fallback candidates', () => {
    expect(
      getProfileImageCandidateForPerson(
        { normalizedName: 'joe rogan' },
        {
          provider: 'SPOTIFY',
          normalizedName: 'joe rogan',
          imageUrl: 'https://example.com/creator.jpg',
          externalUrl: 'https://open.spotify.com/show/example',
          handle: null,
        }
      )
    ).toEqual({
      imageUrl: 'https://example.com/creator.jpg',
      source: 'CREATOR',
      sourceUrl: 'https://open.spotify.com/show/example',
      xHandle: null,
    });
  });

  it('does not use creator images when the creator name does not match the person', () => {
    expect(
      getProfileImageCandidateForPerson(
        { normalizedName: 'sam harris' },
        {
          provider: 'X',
          normalizedName: 'joe rogan',
          imageUrl: 'https://pbs.twimg.com/profile_images/joe.jpg',
          externalUrl: 'https://x.com/joerogan',
          handle: 'joerogan',
        }
      )
    ).toBeNull();
  });
});
