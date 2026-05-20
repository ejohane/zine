import { describe, expect, it } from 'vitest';

import { socialResolutionInternals } from './social-resolution';

describe('social profile resolution helpers', () => {
  it('scores exact X display-name matches higher when profile context matches content', () => {
    const scored = socialResolutionInternals.scoreXProfileCandidate({
      personName: 'Armin Ronacher',
      contextTerms: ['flask', 'python', 'pallets'],
      candidate: {
        id: 'x-1',
        name: 'Armin Ronacher',
        username: 'mitsuhiko',
        description: 'Creator of Flask and Pallets. Python developer.',
        profileImageUrl: 'https://pbs.twimg.com/profile_images/armin.jpg',
        verified: true,
        followersCount: 100000,
      },
    });

    expect(scored.confidence).toBeGreaterThanOrEqual(0.82);
    expect(scored.matchedTerms).toEqual(['flask', 'python', 'pallets']);
  });

  it('does not auto-link name-only matches without contextual evidence', () => {
    const scored = socialResolutionInternals.scoreXProfileCandidate({
      personName: 'James Smith',
      contextTerms: ['podcast', 'venture'],
      candidate: {
        id: 'x-2',
        name: 'James Smith',
        username: 'jamessmith',
        description: 'Personal account.',
      },
    });

    expect(scored.confidence).toBeLessThan(0.82);
  });

  it('can auto-link validated inferred handles that do not resemble the person name', () => {
    const scored = socialResolutionInternals.scoreInferredXProfileCandidate({
      personName: 'Marc Andreessen',
      contextTerms: ['joe', 'rogan', 'venture'],
      inferredHandle: {
        username: 'pmarca',
        confidence: 0.9,
        reason: 'Well-known X handle for Marc Andreessen.',
      },
      candidate: {
        id: 'x-4',
        name: 'Marc Andreessen',
        username: 'pmarca',
        description: 'Co-founder of Andreessen Horowitz.',
        profileImageUrl: 'https://pbs.twimg.com/profile_images/pmarca.jpg',
        verified: true,
        followersCount: 1200000,
      },
    });

    expect(scored.confidence).toBeGreaterThanOrEqual(0.82);
    expect(scored.inferredHandleConfidence).toBe(0.9);
  });

  it('penalizes parody and fan accounts', () => {
    const scored = socialResolutionInternals.scoreXProfileCandidate({
      personName: 'Elon Musk',
      contextTerms: ['tesla', 'spacex'],
      candidate: {
        id: 'x-3',
        name: 'Elon Musk',
        username: 'notelon',
        description: 'Parody fan account for Tesla and SpaceX news.',
      },
    });

    expect(scored.confidence).toBeLessThan(0.82);
    expect(scored.negativeSignals).toContain('parody');
  });

  it('builds inferred search queries from person and content context', () => {
    const queries = socialResolutionInternals.buildXSearchQueries(
      {
        id: 'person-1',
        userId: 'user-1',
        displayName: 'Armin Ronacher',
        normalizedName: 'armin ronacher',
        profileImageSource: null,
        xHandle: null,
        relationship: 'GUEST',
        evidenceText: 'Interview with Armin Ronacher about Flask',
      },
      {
        itemId: 'item-1',
        title: 'Flask, Python, and open source maintainership',
        provider: 'SPOTIFY',
        contentType: 'PODCAST',
        publisher: null,
        rawMetadata: null,
        creatorName: 'The Changelog',
        creatorDescription: 'Developer podcast',
        creatorHandle: null,
      }
    );

    expect(queries[0]).toBe('"Armin Ronacher"');
    expect(queries.some((query) => query.includes('Flask') || query.includes('flask'))).toBe(true);
  });
});
