import { describe, expect, it } from 'vitest';

import {
  extractPersonEntities,
  getProfileImageCandidateForPerson,
  normalizePersonDisplayName,
  normalizePersonName,
} from './service';

describe('people service helpers', () => {
  it('normalizes person names conservatively', () => {
    expect(normalizePersonName('  Joe   Rogan  ')).toBe('joe rogan');
    expect(normalizePersonName('"Sam Harris."')).toBe('sam harris');
    expect(normalizePersonName('Joseph Rogan')).toBe('joseph rogan');
  });

  it('capitalizes person display names', () => {
    expect(normalizePersonDisplayName('armin ronacher')).toBe('Armin Ronacher');
    expect(normalizePersonDisplayName('KEVIN ROOSE')).toBe('Kevin Roose');
    expect(normalizePersonDisplayName("sara o'connor")).toBe("Sara O'Connor");
    expect(normalizePersonDisplayName('ludwig van beethoven')).toBe('Ludwig van Beethoven');
    expect(normalizePersonDisplayName('Paul McCartney')).toBe('Paul McCartney');
    expect(normalizePersonDisplayName('g.k. chesterton')).toBe('G.K. Chesterton');
    expect(normalizePersonDisplayName('G.K. Chesterton')).toBe('G.K. Chesterton');
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
        relationship: 'MENTIONED',
        confidence: 0.9,
        evidenceText: null,
      },
      {
        rawName: 'Sam Harris',
        rawType: 'PERSON',
        displayName: 'Sam Harris',
        normalizedName: 'sam harris',
        relationship: 'MENTIONED',
        confidence: 0.8,
        evidenceText: null,
      },
    ]);
  });

  it('capitalizes lowercase person entities before indexing', () => {
    const people = extractPersonEntities(
      JSON.stringify([{ name: 'armin ronacher', type: 'PERSON', confidence: 0.9 }])
    );

    expect(people[0]?.displayName).toBe('Armin Ronacher');
  });

  it('preserves supported person relationships and prefers host roles when deduping', () => {
    const people = extractPersonEntities(
      JSON.stringify([
        { name: 'Casey Newton', type: 'PERSON', relationship: 'MENTIONED', confidence: 0.95 },
        {
          name: 'Casey Newton',
          type: 'PERSON',
          relationship: 'HOST',
          confidence: 0.82,
          evidenceText: 'Hosted by Casey Newton and Kevin Roose',
        },
        {
          name: 'Kevin Roose',
          type: 'PERSON',
          relationship: 'co-host',
          confidence: 0.84,
          evidenceText: 'Hosted by Casey Newton and Kevin Roose',
        },
      ])
    );

    expect(people).toEqual([
      {
        rawName: 'Casey Newton',
        rawType: 'PERSON',
        displayName: 'Casey Newton',
        normalizedName: 'casey newton',
        relationship: 'HOST',
        confidence: 0.82,
        evidenceText: 'Hosted by Casey Newton and Kevin Roose',
      },
      {
        rawName: 'Kevin Roose',
        rawType: 'PERSON',
        displayName: 'Kevin Roose',
        normalizedName: 'kevin roose',
        relationship: 'CO_HOST',
        confidence: 0.84,
        evidenceText: 'Hosted by Casey Newton and Kevin Roose',
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
