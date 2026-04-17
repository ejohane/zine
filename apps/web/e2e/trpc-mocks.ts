import type { Page, Route } from '@playwright/test';
import { ContentType, Provider } from '@zine/shared';
import superjson from 'superjson';

const libraryItems = [
  {
    id: 'article-1',
    title: 'Stable component APIs',
    creator: 'Zine Editorial',
    creatorId: 'creator-1',
    creatorImageUrl: null,
    thumbnailUrl: null,
    contentType: ContentType.ARTICLE,
    provider: Provider.SUBSTACK,
    duration: null,
    readingTimeMinutes: 8,
    publisher: null,
    summary: '<p>Shared card spacing and metadata rhythm should hold up.</p>',
    canonicalUrl: 'https://zine.example/read/stable-component-apis',
    publishedAt: '2025-02-16T11:20:00.000Z',
    bookmarkedAt: '2025-02-16T11:20:00.000Z',
    ingestedAt: '2025-02-16T11:20:00.000Z',
    isFinished: false,
  },
  {
    id: 'video-1',
    title: 'Design systems at scale',
    creator: 'Zine Editorial',
    creatorId: 'creator-1',
    creatorImageUrl: null,
    thumbnailUrl: null,
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    duration: 605,
    readingTimeMinutes: null,
    publisher: null,
    summary: '<p>A long-form walkthrough of resilient design systems.</p>',
    canonicalUrl: 'https://zine.example/watch/design-systems-at-scale',
    publishedAt: '2025-02-18T09:45:00.000Z',
    bookmarkedAt: '2025-02-18T10:00:00.000Z',
    ingestedAt: '2025-02-18T10:00:00.000Z',
    isFinished: false,
  },
  {
    id: 'podcast-1',
    title: 'Product taste and pacing',
    creator: 'Studio Dispatch',
    creatorId: 'creator-2',
    creatorImageUrl: null,
    thumbnailUrl: null,
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    duration: 1820,
    readingTimeMinutes: null,
    publisher: null,
    summary: '<p>A quiet conversation about editorial judgment.</p>',
    canonicalUrl: 'https://open.spotify.com/episode/example',
    publishedAt: '2025-02-17T16:10:00.000Z',
    bookmarkedAt: '2025-02-17T16:10:00.000Z',
    ingestedAt: '2025-02-17T16:10:00.000Z',
    isFinished: true,
  },
  {
    id: 'post-1',
    title: 'Notes on interface pace',
    creator: 'Erik J',
    creatorId: 'creator-3',
    creatorImageUrl: null,
    thumbnailUrl: null,
    contentType: ContentType.POST,
    provider: Provider.X,
    duration: null,
    readingTimeMinutes: null,
    publisher: null,
    summary:
      'Ship the smallest interaction that still feels inevitable, then tighten it until it disappears.',
    canonicalUrl: 'https://x.com/erik/status/1234567890',
    publishedAt: '2025-02-19T08:30:00.000Z',
    bookmarkedAt: '2025-02-19T08:35:00.000Z',
    ingestedAt: '2025-02-19T08:35:00.000Z',
    isFinished: false,
  },
] as const;

const creators = {
  'creator-1': {
    id: 'creator-1',
    handle: 'zine-editorial',
    description: 'Hosted by Alice Example',
  },
  'creator-2': {
    id: 'creator-2',
    handle: 'studio-dispatch',
    description: 'Hosted by Alice Example and Bob Example',
  },
  'creator-3': {
    id: 'creator-3',
    handle: 'erik',
    description: 'Writes about product and interface rhythm',
  },
} as const;

type MockMode = 'default' | 'empty' | 'error';

function unwrapInput(value: unknown): unknown {
  if (value && typeof value === 'object' && 'json' in value) {
    return unwrapInput((value as { json: unknown }).json);
  }

  return value;
}

function parseInputs(request: Route['request']): unknown[] {
  if (request.method() === 'POST') {
    const body = request.postDataJSON();
    if (Array.isArray(body)) {
      return body.map((entry) => unwrapInput(entry));
    }
    return [unwrapInput(body)];
  }

  const url = new URL(request.url());
  const rawInput = url.searchParams.get('input');
  if (!rawInput) {
    return [];
  }

  const parsed = JSON.parse(rawInput) as unknown;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.every(([key]) => /^\d+$/.test(key))) {
      return entries
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([, value]) => unwrapInput(value));
    }
  }

  return [unwrapInput(parsed)];
}

function success(data: unknown) {
  return {
    result: {
      data: superjson.serialize(data),
    },
  };
}

function failure(message: string, path: string, httpStatus = 500) {
  return {
    error: superjson.serialize({
      message,
      code: -32603,
      data: {
        code: 'INTERNAL_SERVER_ERROR',
        httpStatus,
        path,
      },
    }),
  };
}

export async function mockWebTrpc(page: Page, mode: MockMode = 'default') {
  await page.route('**/trpc/**', async (route) => {
    const url = new URL(route.request().url());
    const procedures = url.pathname.split('/trpc/')[1]?.split(',') ?? [];
    const inputs = parseInputs(route.request());

    const responses = procedures.map((procedure, index) => {
      if (procedure === 'items.library') {
        if (mode === 'error') {
          return failure('Could not load bookmarks from the mock API.', procedure);
        }
        if (mode === 'empty') {
          return success({ items: [] });
        }

        const input =
          (inputs[index] as { filter?: { contentType?: ContentType } } | undefined) ?? {};
        const filteredItems = input.filter?.contentType
          ? libraryItems.filter((item) => item.contentType === input.filter?.contentType)
          : libraryItems;

        return success({ items: filteredItems });
      }

      if (procedure === 'items.get') {
        const input = (inputs[index] as { id?: string } | undefined) ?? {};
        const item = libraryItems.find((candidate) => candidate.id === input.id);
        return item ? success(item) : failure('Bookmark not found.', procedure, 404);
      }

      if (procedure === 'creators.get') {
        const input = (inputs[index] as { creatorId?: keyof typeof creators } | undefined) ?? {};
        return success(input.creatorId ? (creators[input.creatorId] ?? null) : null);
      }

      return failure(`Unhandled mock procedure: ${procedure}`, procedure);
    });

    await route.fulfill({
      status: mode === 'error' ? 500 : 200,
      contentType: 'application/json',
      body: JSON.stringify(responses.length === 1 ? responses[0] : responses),
    });
  });
}
