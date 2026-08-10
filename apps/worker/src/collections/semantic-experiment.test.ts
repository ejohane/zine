import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  assertReadOnlySql,
  buildProductionCorpusQuery,
  buildSemanticCollectionCorpus,
  compareCollectionGenerations,
  renderSemanticCollectionReview,
  runWorkersAIStructured,
  validateCollectionProposal,
  validateCollectionProposalSet,
  validateDiscoveredThemes,
  validateProposalNovelty,
  type CollectionGeneration,
  type CollectionProposal,
  type SemanticCollectionCorpus,
} from './semantic-experiment';

function understanding(itemId: string) {
  return JSON.stringify({
    schemaVersion: 1,
    sourceContentHash: `sha256:source-${itemId}`,
    coverage: 'FULL_CONTENT',
    chunks: [
      {
        ordinal: 0,
        blockIds: ['b1', 'b2', 'b3'],
        characterCount: 500,
        summary: { text: `Summary for ${itemId}.`, evidenceBlockIds: ['b1'] },
        topics: [
          {
            name: 'Intentional work',
            description: `Topic for ${itemId}.`,
            evidenceBlockIds: ['b1'],
          },
        ],
        claims: [
          { statement: `Claim one for ${itemId}.`, evidenceBlockIds: ['b1'] },
          { statement: `Claim two for ${itemId}.`, evidenceBlockIds: ['b2'] },
        ],
        questionsAnswered: [
          {
            question: `Question for ${itemId}?`,
            answer: `Answer for ${itemId}.`,
            evidenceBlockIds: ['b2'],
          },
        ],
        concepts: [
          {
            name: 'Deliberate impact',
            description: `Concept for ${itemId}.`,
            evidenceBlockIds: ['b2'],
          },
        ],
        perspective: { description: `Perspective for ${itemId}.`, evidenceBlockIds: ['b3'] },
        audience: { description: `Audience for ${itemId}.`, evidenceBlockIds: ['b3'] },
        actionableTakeaways: [{ description: `Takeaway for ${itemId}.`, evidenceBlockIds: ['b3'] }],
      },
    ],
  });
}

function row(itemId: string) {
  return {
    item_id: itemId,
    user_item_id: `user-${itemId}`,
    title: `Article ${itemId}`,
    canonical_url: `https://example.com/${itemId}`,
    creator: `Author ${itemId}`,
    publisher: null,
    enrichment_content_hash: `sha256:enrichment-${itemId}`,
    source_content_hash: `sha256:source-${itemId}`,
    source_coverage: 'FULL_CONTENT',
    source_kind: 'PUBLIC_WEB',
    source_word_count: 1_000,
    source_quality_score: 1,
    source_quality_warnings_json: '[]',
    understanding_json: understanding(itemId),
  };
}

async function corpus(): Promise<SemanticCollectionCorpus> {
  return buildSemanticCollectionCorpus(
    'user-1',
    [row('item-1'), row('item-2'), row('item-3'), row('item-4')],
    '2026-08-10T00:00:00.000Z'
  );
}

function proposal(
  input: {
    proposalId?: string;
    origin?: 'USER_DIRECTED' | 'AI_DISCOVERED';
    title?: string;
    selectedIds?: string[];
    seed?: number;
  } = {}
): CollectionProposal {
  const selectedIds = input.selectedIds ?? ['item-1', 'item-2', 'item-3'];
  const signal = (itemId: string) => `${itemId}:c0:claim:0`;
  return {
    proposalId: input.proposalId ?? 'user-directed',
    origin: input.origin ?? 'USER_DIRECTED',
    lens: 'How deliberate choices turn engineering effort into organizational impact.',
    discoveryRationale:
      input.origin === 'AI_DISCOVERED'
        ? 'Several articles distinguish visible activity from consequential work.'
        : null,
    themeSeedItemIds: input.origin === 'AI_DISCOVERED' ? selectedIds : [],
    model: 'collection-model',
    promptVersion: 'semantic-collections-v1',
    seed: input.seed ?? 1001,
    title: input.title ?? 'Choosing Work That Actually Matters',
    description: 'A collection about directing technical effort toward consequential outcomes.',
    collectionRationale:
      'These articles describe different mechanisms for separating visible activity from durable impact.',
    candidateScores: ['item-1', 'item-2', 'item-3', 'item-4'].map((itemId, index) => ({
      itemId,
      overallScore: 95 - index * 10,
      verdict: index < 3 ? ('STRONG' as const) : ('WEAK' as const),
    })),
    selectedItems: selectedIds.map((itemId, index) => ({
      itemId,
      rank: index + 1,
      reason: `This selection contributes a distinct mechanism to the collection thesis ${index}.`,
      signalIds: [signal(itemId)],
    })),
    nearMisses: selectedIds.includes('item-4')
      ? []
      : [
          {
            itemId: 'item-4',
            reason:
              'This article is adjacent but offers weaker support for the exact collection lens.',
            signalIds: [signal('item-4')],
          },
        ],
  };
}

function generation(proposals: CollectionProposal[], corpusHash: string): CollectionGeneration {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-10T00:01:00.000Z',
    corpusHash,
    model: 'collection-model',
    promptVersion: 'semantic-collections-v1',
    proposals,
  };
}

describe('semantic collection production query', () => {
  it('builds one read-only statement selecting only understood bookmarked articles', () => {
    const query = buildProductionCorpusQuery("user'oops");
    expect(query).toContain("ui.user_id = 'user''oops'");
    expect(query).toContain('ie.understanding_json IS NOT NULL');
    expect(query).toContain("i.content_type = 'ARTICLE'");
    expect(() => assertReadOnlySql(query)).not.toThrow();
  });

  it.each([
    'DELETE FROM items',
    'WITH rows AS (SELECT 1) UPDATE items SET title = NULL',
    'SELECT 1; DROP TABLE items',
    'PRAGMA table_info(items)',
  ])('rejects production SQL with a write or administrative path: %s', (query) => {
    expect(() => assertReadOnlySql(query)).toThrow();
  });
});

describe('semantic collection model client', () => {
  it('parses Workers AI chat completions and repairs schema-invalid output', async () => {
    const requests: Array<{ messages: Array<{ content: string }> }> = [];
    const responses = [
      { result: { choices: [{ message: { content: '{"value":"the"}' } }] } },
      { result: { choices: [{ message: { content: '```json\n{"value":"complete"}\n```' } }] } },
    ];
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await runWorkersAIStructured({
      accountId: 'account',
      apiToken: 'token',
      model: 'model',
      seed: 1,
      maxTokens: 100,
      operation: 'test generation',
      repairPrompt: 'Repair the value.',
      messages: [{ role: 'user', content: 'Return a value. /no_think' }],
      schema: {
        safeParse(value: unknown) {
          if (
            value &&
            typeof value === 'object' &&
            (value as { value?: unknown }).value === 'complete'
          ) {
            return { success: true as const, data: value as { value: string } };
          }
          return {
            success: false as const,
            error: { message: 'value must be complete' },
          } as never;
        },
      } as never,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result).toEqual({ value: 'complete' });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)?.content).toContain('value must be complete');
    expect(requests[1]?.messages.at(-1)?.content).toContain('{"value":"the"}');
    expect(requests[1]?.messages.at(-1)?.content).toContain('/no_think');
  });

  it('retries transient transport failures without consuming semantic repair attempts', async () => {
    let calls = 0;
    const diagnostics: string[] = [];
    const result = await runWorkersAIStructured({
      accountId: 'account',
      apiToken: 'token',
      model: 'model',
      seed: 1,
      maxTokens: 100,
      operation: 'transport test',
      repairPrompt: 'Repair.',
      repairAttempts: 0,
      transportRetries: 1,
      onDiagnostic: (message) => diagnostics.push(message),
      messages: [{ role: 'user', content: 'Return JSON. /no_think' }],
      schema: z.object({ ok: z.literal(true) }),
      fetchImpl: (async () => {
        calls++;
        return calls === 1
          ? new Response(JSON.stringify({ errors: [{ message: 'timeout' }] }), {
              status: 408,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response(JSON.stringify({ result: { response: '{"ok":true}' } }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
      }) as typeof fetch,
    });

    expect(result).toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(diagnostics).toEqual(['transport test transport 408; retry 1/1']);
  });
});

describe('semantic collection corpus', () => {
  it('creates a stable content-addressed corpus with exact evidence signals', async () => {
    const first = await corpus();
    const second = await buildSemanticCollectionCorpus(
      'user-1',
      [row('item-4'), row('item-3'), row('item-2'), row('item-1')],
      '2026-08-11T00:00:00.000Z'
    );

    expect(first.corpusHash).toBe(second.corpusHash);
    expect(first.items[0]?.signals.map((signal) => signal.kind)).toContain('CLAIM');
    expect(first.items[0]?.signals[0]?.evidenceBlockIds).toEqual(['b1']);
  });

  it('rejects stale source hashes and invented understanding evidence', async () => {
    const stale = row('stale');
    stale.source_content_hash = 'sha256:different';
    await expect(
      buildSemanticCollectionCorpus('user-1', [stale, row('2'), row('3')])
    ).rejects.toThrow('source hash is stale');

    const invalid = row('invalid');
    const parsed = JSON.parse(invalid.understanding_json);
    parsed.chunks[0].claims[0].evidenceBlockIds = ['invented'];
    invalid.understanding_json = JSON.stringify(parsed);
    await expect(
      buildSemanticCollectionCorpus('user-1', [invalid, row('2'), row('3')])
    ).rejects.toThrow('invalid block IDs');
  });
});

describe('semantic collection validation', () => {
  it('accepts grounded proposals and rejects missing candidates, invalid signals, and truncation', async () => {
    const snapshot = await corpus();
    expect(validateCollectionProposal(proposal(), snapshot)).toEqual([]);

    const invalid = proposal();
    invalid.candidateScores.pop();
    invalid.selectedItems[0]!.signalIds = ['invented'];
    invalid.collectionRationale = 'This explanation ends with the';
    expect(validateCollectionProposal(invalid, snapshot)).toEqual(
      expect.arrayContaining([
        'candidateScores must contain every corpus item exactly once',
        'candidateScores is missing item-4',
        expect.stringContaining('invalid signal IDs'),
        expect.stringContaining('truncated endings'),
      ])
    );
  });

  it('rejects duplicate AI-discovered portfolios above the overlap limit', async () => {
    const snapshot = await corpus();
    const proposals = [
      proposal(),
      proposal({ proposalId: 'ai-1', origin: 'AI_DISCOVERED', title: 'Impact Beyond Activity' }),
      proposal({ proposalId: 'ai-2', origin: 'AI_DISCOVERED', title: 'Judgment Over Motion' }),
      proposal({
        proposalId: 'ai-3',
        origin: 'AI_DISCOVERED',
        title: 'Choosing Consequential Systems',
        selectedIds: ['item-1', 'item-2', 'item-4'],
      }),
    ];
    const issues = validateCollectionProposalSet(
      generation(proposals, snapshot.corpusHash),
      snapshot
    );
    expect(issues.some((issue) => issue.includes('overlap too heavily'))).toBe(true);
  });

  it('requires diverse theme seeds and repairs each new proposal against prior portfolios', async () => {
    const snapshot = await corpus();
    const themeIssues = validateDiscoveredThemes(
      [
        {
          lens: 'How intentional work produces durable outcomes across engineering organizations.',
          rationale: 'Several articles distinguish consequential projects from visible activity.',
          seedItemIds: ['item-1', 'item-2', 'item-3'],
        },
        {
          lens: 'How human judgment constrains automation in changing software development systems.',
          rationale: 'Several articles retain review and accountability as automation expands.',
          seedItemIds: ['item-1', 'item-2', 'item-3'],
        },
        {
          lens: 'How teams replace process theater with context-sensitive coordination practices.',
          rationale: 'Several articles challenge formal process when it obscures local judgment.',
          seedItemIds: ['item-2', 'item-3', 'item-4'],
        },
      ],
      snapshot
    );
    expect(themeIssues).toEqual(
      expect.arrayContaining([expect.stringContaining('seed portfolios overlap too heavily')])
    );

    const prior = proposal({
      proposalId: 'ai-1',
      origin: 'AI_DISCOVERED',
      title: 'Impact Beyond Activity',
    });
    const duplicate = proposal({
      proposalId: 'ai-2',
      origin: 'AI_DISCOVERED',
      title: 'Judgment Over Motion',
    });
    expect(validateProposalNovelty(duplicate, [prior])).toEqual([
      expect.stringContaining('choose a more distinct evidence-backed portfolio'),
    ]);
  });

  it('requires AI-discovered collections to retain their three-item theme core', async () => {
    const snapshot = await corpus();
    const invalid = proposal({
      proposalId: 'ai-1',
      origin: 'AI_DISCOVERED',
      title: 'Impact Beyond Activity',
      selectedIds: ['item-1', 'item-2', 'item-3'],
    });
    invalid.themeSeedItemIds = ['item-1', 'item-2', 'item-4'];
    expect(validateCollectionProposal(invalid, snapshot)).toEqual([
      'AI-discovered proposal is missing theme seed item item-4',
    ]);
  });
});

describe('semantic collection stability and review', () => {
  it('compares fixed lenses across seeds and renders evidence-backed review controls', async () => {
    const snapshot = await corpus();
    const primaryProposals = [
      proposal(),
      proposal({ proposalId: 'ai-1', origin: 'AI_DISCOVERED', title: 'Impact Beyond Activity' }),
      proposal({
        proposalId: 'ai-2',
        origin: 'AI_DISCOVERED',
        title: 'Judgment Over Motion',
        selectedIds: ['item-1', 'item-3', 'item-4'],
      }),
      proposal({
        proposalId: 'ai-3',
        origin: 'AI_DISCOVERED',
        title: 'Choosing Consequential Systems',
        selectedIds: ['item-2', 'item-3', 'item-4'],
      }),
    ];
    const replayProposals = primaryProposals.map((entry) => ({
      ...entry,
      seed: 2001,
      selectedItems: entry.selectedItems.map((item) => ({ ...item })),
    }));
    replayProposals[0]!.selectedItems[2] = {
      itemId: 'item-4',
      rank: 3,
      reason:
        'This replay selection contributes a distinct supported perspective to the collection.',
      signalIds: ['item-4:c0:claim:0'],
    };

    const primary = generation(primaryProposals, snapshot.corpusHash);
    const replay = generation(replayProposals, snapshot.corpusHash);
    const stability = compareCollectionGenerations(primary, replay);

    expect(stability.passes).toBe(false);
    expect(stability.proposals[0]?.coreRetention).toBeCloseTo(2 / 3);
    const review = renderSemanticCollectionReview({
      corpus: snapshot,
      primary,
      replay,
      stability,
      validationIssues: [],
    });
    expect(review).toContain('# Semantic collection experiment review');
    expect(review).toContain('CLAIM: Claim one for item-1. [b1]');
    expect(review).toContain('theme core');
    expect(review).toContain('- [ ] Productize');
  });
});
