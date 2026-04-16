import type { PropsWithChildren } from 'react';
import type { ContentType } from '@zine/shared';
import { vi } from 'vitest';

type AuthMode = 'clerk' | 'development-bypass' | 'disabled';

type QueryResult<T> = {
  data?: T;
  isLoading: boolean;
  error: Error | null;
};

type MutationOptions = {
  onSuccess?: () => void;
};

type ItemsLibraryInput = {
  limit: number;
  filter: {
    contentType?: ContentType;
  };
};

type ItemsGetInput = {
  id: string;
};

type CreatorGetInput = {
  creatorId: string;
};

type BookmarkPreviewInput = {
  url: string;
};

type MutationSpy = ReturnType<typeof vi.fn<(input: unknown) => void>>;

type SessionState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
};

const authAvailability = {
  mode: 'development-bypass' as AuthMode,
  isEnabled: true,
};

const sessionState: SessionState = {
  isLoaded: true,
  isSignedIn: true,
  getToken: async () => null,
  signOut: async () => {},
};

export const invalidateSpies = {
  itemsGetInvalidate: vi.fn(async () => undefined),
  itemsLibraryInvalidate: vi.fn(async () => undefined),
  itemsHomeInvalidate: vi.fn(async () => undefined),
};

export const mutationSpies = {
  toggleFinished: vi.fn<(input: unknown) => void>(),
  unbookmark: vi.fn<(input: unknown) => void>(),
};

export const hookSpies = {
  itemsLibraryUseQuery: vi.fn<(input: ItemsLibraryInput) => QueryResult<unknown>>((_input) =>
    createQueryResult({})
  ),
  itemsGetUseQuery: vi.fn<(input: ItemsGetInput, options?: unknown) => QueryResult<unknown>>(
    (_input) => createQueryResult({})
  ),
  creatorsGetUseQuery: vi.fn<(input: CreatorGetInput, options?: unknown) => QueryResult<unknown>>(
    (_input) => createQueryResult({})
  ),
  bookmarksPreviewUseQuery: vi.fn<
    (input: BookmarkPreviewInput, options?: unknown) => QueryResult<unknown>
  >((_input) => createQueryResult({})),
  toggleFinishedUseMutation: vi.fn((options?: MutationOptions) =>
    createMutationResult(mutationSpies.toggleFinished, options)
  ),
  unbookmarkUseMutation: vi.fn((options?: MutationOptions) =>
    createMutationResult(mutationSpies.unbookmark, options)
  ),
};

function createQueryResult<T>(overrides: Partial<QueryResult<T>> = {}): QueryResult<T> {
  return {
    data: undefined,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function createMutationResult(spy: MutationSpy, options?: MutationOptions) {
  return {
    isPending: false,
    mutate: (input: unknown) => {
      spy(input);
      options?.onSuccess?.();
    },
  };
}

export function resetTrpcMocks() {
  authAvailability.mode = 'development-bypass';
  authAvailability.isEnabled = true;

  sessionState.isLoaded = true;
  sessionState.isSignedIn = true;
  sessionState.getToken = async () => null;
  sessionState.signOut = async () => {};

  Object.values(invalidateSpies).forEach((spy) => {
    spy.mockReset();
    spy.mockResolvedValue(undefined);
  });

  Object.values(mutationSpies).forEach((spy) => {
    spy.mockReset();
  });

  hookSpies.itemsLibraryUseQuery.mockReset();
  hookSpies.itemsLibraryUseQuery.mockImplementation((_input) => createQueryResult());

  hookSpies.itemsGetUseQuery.mockReset();
  hookSpies.itemsGetUseQuery.mockImplementation((_input) => createQueryResult());

  hookSpies.creatorsGetUseQuery.mockReset();
  hookSpies.creatorsGetUseQuery.mockImplementation((_input) => createQueryResult());

  hookSpies.bookmarksPreviewUseQuery.mockReset();
  hookSpies.bookmarksPreviewUseQuery.mockImplementation((_input) => createQueryResult());

  hookSpies.toggleFinishedUseMutation.mockReset();
  hookSpies.toggleFinishedUseMutation.mockImplementation((options?: MutationOptions) =>
    createMutationResult(mutationSpies.toggleFinished, options)
  );

  hookSpies.unbookmarkUseMutation.mockReset();
  hookSpies.unbookmarkUseMutation.mockImplementation((options?: MutationOptions) =>
    createMutationResult(mutationSpies.unbookmark, options)
  );
}

export function setAuthAvailability(nextState: Partial<typeof authAvailability>) {
  Object.assign(authAvailability, nextState);
}

export function setSessionState(nextState: Partial<SessionState>) {
  Object.assign(sessionState, nextState);
}

export const trpc = {
  useUtils: () => ({
    items: {
      get: { invalidate: invalidateSpies.itemsGetInvalidate },
      library: { invalidate: invalidateSpies.itemsLibraryInvalidate },
      home: { invalidate: invalidateSpies.itemsHomeInvalidate },
    },
  }),
  items: {
    library: {
      useQuery: (input: ItemsLibraryInput) => hookSpies.itemsLibraryUseQuery(input),
    },
    get: {
      useQuery: (input: ItemsGetInput, options?: unknown) =>
        hookSpies.itemsGetUseQuery(input, options),
    },
    toggleFinished: {
      useMutation: (options?: MutationOptions) => hookSpies.toggleFinishedUseMutation(options),
    },
    unbookmark: {
      useMutation: (options?: MutationOptions) => hookSpies.unbookmarkUseMutation(options),
    },
  },
  creators: {
    get: {
      useQuery: (input: CreatorGetInput, options?: unknown) =>
        hookSpies.creatorsGetUseQuery(input, options),
    },
  },
  bookmarks: {
    preview: {
      useQuery: (input: BookmarkPreviewInput, options?: unknown) =>
        hookSpies.bookmarksPreviewUseQuery(input, options),
    },
  },
};

export function useAuthAvailability() {
  return authAvailability;
}

export function useAppSession() {
  return sessionState;
}

export function RootProviders({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function useRecapTimezone() {
  return undefined;
}
