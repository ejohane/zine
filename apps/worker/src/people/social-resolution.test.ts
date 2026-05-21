import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getValidAccessToken } from '../lib/token-refresh';
import { socialResolutionInternals } from './social-resolution';

vi.mock('../lib/token-refresh', () => ({
  getValidAccessToken: vi.fn(),
}));

describe('social profile resolution helpers', () => {
  beforeEach(() => {
    vi.mocked(getValidAccessToken).mockReset();
  });

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
        source: 'AI_INFERRED',
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
        summary: 'Flask maintainer interview with Armin Ronacher.',
        rawMetadata: null,
        creatorName: 'The Changelog',
        creatorDescription: 'Developer podcast',
        creatorHandle: null,
      }
    );

    expect(queries[0]).toBe('"Armin Ronacher"');
    expect(queries.some((query) => query.includes('Flask') || query.includes('flask'))).toBe(true);
  });

  it('uses item summaries as social-resolution context', () => {
    const terms = socialResolutionInternals.extractContextTerms(
      {
        itemId: 'item-1',
        title: 'Google I/O reactions',
        provider: 'YOUTUBE',
        contentType: 'VIDEO',
        publisher: null,
        summary: 'The Verge executive editor Jake Kastrenakes joins the livestream.',
        rawMetadata: null,
        creatorName: 'The Verge',
        creatorDescription: null,
        creatorHandle: '@theverge',
      },
      {
        displayName: 'Jake Kastrenakes',
        evidenceText: 'executive editor Jake Kastrenakes',
      }
    );

    expect(terms).toContain('verge');
    expect(terms).toContain('executive');
  });

  it('prioritizes person evidence and creator context before long summaries', () => {
    const terms = socialResolutionInternals.extractContextTerms(
      {
        itemId: 'item-1',
        title: 'Google I/O 2026 reactions | The Vergecast Livestream',
        provider: 'YOUTUBE',
        contentType: 'VIDEO',
        publisher: null,
        summary:
          'Google I/O is upon us with keynote reactions, Android demos, Gemini updates, search announcements, hardware rumors, live chat, subscriber questions, and analysis from The Verge senior AI reporter Hayden Field and executive editor Jake Kastrenakes.',
        rawMetadata: null,
        creatorName: 'The Verge',
        creatorDescription: 'Technology news and analysis from the Verge team.',
        creatorHandle: '@theverge',
      },
      {
        displayName: 'Jake Kastrenakes',
        evidenceText: 'executive editor Jake Kastrenakes',
      }
    );

    expect(terms.slice(0, 3)).toEqual(['executive', 'editor', 'verge']);

    const scored = socialResolutionInternals.scoreXProfileCandidate({
      personName: 'Jake Kastrenakes',
      contextTerms: terms,
      candidate: {
        id: 'x-6',
        name: 'Jake Kastrenakes',
        username: 'jake_k',
        description: 'executive editor @verge / contact me: https://t.co/52CumWCN0M',
      },
    });

    expect(scored.matchedTerms).toEqual(expect.arrayContaining(['executive', 'editor', 'verge']));
    expect(scored.confidence).toBeGreaterThanOrEqual(0.82);
  });

  it('rescoring stored X candidates can promote previously conservative matches', () => {
    const scored = socialResolutionInternals.scoreStoredXProfileCandidate({
      personName: 'Jake Kastrenakes',
      contextTerms: ['executive', 'editor', 'verge'],
      profile: {
        providerProfileId: '1973331',
        handle: 'jake_k',
        displayName: 'Jake Kastrenakes',
        avatarUrl: 'https://pbs.twimg.com/profile_images/jake.jpg',
        profileUrl: 'https://x.com/jake_k',
        description: 'executive editor @verge / contact me: https://t.co/52CumWCN0M',
        verified: false,
        evidenceJson: null,
      },
    });

    expect(scored.confidence).toBeGreaterThanOrEqual(0.82);
    expect(scored.matchedTerms).toEqual(['executive', 'editor', 'verge']);
  });

  it('does not auto-link first-name-only people from search matches', () => {
    const scored = socialResolutionInternals.scoreXProfileCandidate({
      personName: 'Ben',
      contextTerms: ['technology', 'podcast', 'writer', 'newsletter'],
      candidate: {
        id: 'x-ben',
        name: 'Ben Thompson',
        username: 'benthompson',
        description: 'Technology writer, newsletter author, and podcast host.',
        verified: true,
        followersCount: 100000,
      },
    });

    expect(scored.confidence).toBeGreaterThanOrEqual(0.82);
    expect(
      socialResolutionInternals.canAutoLinkXProfileCandidate({
        personName: 'Ben',
        candidate: scored,
      })
    ).toBe(false);
  });

  it('allows first-name-only auto-linking when the handle is explicit in context', () => {
    const scored = socialResolutionInternals.scoreInferredXProfileCandidate({
      personName: 'Ben',
      contextTerms: ['technology', 'podcast', 'writer'],
      inferredHandle: {
        username: 'benthompson',
        confidence: 0.92,
        source: 'CONTEXT_EXPLICIT',
        reason: 'The handle appears in the content context.',
      },
      candidate: {
        id: 'x-ben',
        name: 'Ben Thompson',
        username: 'benthompson',
        description: 'Technology writer and podcast host.',
      },
    });

    expect(scored.confidence).toBeGreaterThanOrEqual(0.82);
    expect(
      socialResolutionInternals.canAutoLinkXProfileCandidate({
        personName: 'Ben',
        candidate: scored,
      })
    ).toBe(true);
  });

  it('generates common validated lookup handles from names', () => {
    const candidates = socialResolutionInternals.buildNameDerivedHandleCandidates({
      id: 'person-1',
      userId: 'user-1',
      displayName: 'Jake Kastrenakes',
      normalizedName: 'jake kastrenakes',
      profileImageSource: null,
      xHandle: null,
      relationship: 'GUEST',
      evidenceText: 'executive editor Jake Kastrenakes',
    });

    expect(candidates.map((candidate) => candidate.username)).toContain('jake_k');
  });

  it('does not boost name-derived handles without profile context support', () => {
    const scored = socialResolutionInternals.scoreInferredXProfileCandidate({
      personName: 'James Smith',
      contextTerms: ['podcast', 'venture'],
      inferredHandle: {
        username: 'jamessmith',
        confidence: 0.72,
        source: 'NAME_DERIVED',
        reason: 'Generated from the person name.',
      },
      candidate: {
        id: 'x-5',
        name: 'James Smith',
        username: 'jamessmith',
        description: 'Personal account.',
      },
    });

    expect(scored.confidence).toBeLessThan(0.82);
  });

  it('can boost name-derived handles when the validated profile matches item context', () => {
    const scored = socialResolutionInternals.scoreInferredXProfileCandidate({
      personName: 'Jake Kastrenakes',
      contextTerms: ['verge', 'executive', 'editor'],
      inferredHandle: {
        username: 'jake_k',
        confidence: 0.72,
        source: 'NAME_DERIVED',
        reason: 'Generated from the person name.',
      },
      candidate: {
        id: 'x-6',
        name: 'Jake Kastrenakes',
        username: 'jake_k',
        description: 'Executive editor at The Verge.',
        profileImageUrl: 'https://pbs.twimg.com/profile_images/jake.jpg',
        followersCount: 10000,
      },
    });

    expect(scored.confidence).toBeGreaterThanOrEqual(0.82);
    expect(scored.inferredHandleSource).toBe('NAME_DERIVED');
  });

  it('uses a configured X service user connection for user-search access', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValueOnce('user-context-token');
    const connection = {
      id: 'connection-1',
      userId: 'service-user-1',
      provider: 'X',
      providerUserId: 'x-user-1',
      accessToken: 'encrypted-access',
      refreshToken: 'encrypted-refresh',
      tokenExpiresAt: Date.now() + 60_000,
      scopes: 'tweet.read users.read offline.access',
      connectedAt: Date.now(),
      lastRefreshedAt: null,
      status: 'ACTIVE',
    };
    const db = {
      query: {
        providerConnections: {
          findFirst: vi.fn().mockResolvedValue(connection),
        },
      },
    };

    const tokens = await socialResolutionInternals.resolveXAccessTokens(db as never, {
      DB: {} as D1Database,
      OAUTH_STATE_KV: {} as KVNamespace,
      ENCRYPTION_KEY: '0'.repeat(64),
      X_CLIENT_ID: 'x-client-id',
      X_PROFILE_SEARCH_USER_ID: 'service-user-1',
      X_BEARER_TOKEN: 'app-only-token',
    });

    expect(db.query.providerConnections.findFirst).toHaveBeenCalledTimes(1);
    expect(getValidAccessToken).toHaveBeenCalledWith(connection, expect.anything());
    expect(tokens).toEqual({
      userSearchAccessToken: 'user-context-token',
      directLookupAccessToken: 'app-only-token',
    });
  });

  it('falls back to app-only direct lookup when no X service user is configured', async () => {
    const db = {
      query: {
        providerConnections: {
          findFirst: vi.fn(),
        },
      },
    };

    const tokens = await socialResolutionInternals.resolveXAccessTokens(
      db as never,
      {
        X_BEARER_TOKEN: 'app-only-token',
      } as never
    );

    expect(db.query.providerConnections.findFirst).not.toHaveBeenCalled();
    expect(getValidAccessToken).not.toHaveBeenCalled();
    expect(tokens).toEqual({
      userSearchAccessToken: null,
      directLookupAccessToken: 'app-only-token',
    });
  });
});
