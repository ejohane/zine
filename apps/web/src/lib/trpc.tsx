import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { ClerkProvider, useAuth, useClerk } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact, type CreateTRPCReact } from '@trpc/react-query';
import superjson from 'superjson';

import type { AppRouter } from '@zine/worker/trpc/router';

import { API_URL, CLERK_PUBLISHABLE_KEY } from './env';
import {
  buildWebQueryPersistenceBuster,
  buildWebQueryPersistenceKey,
  PERSISTENCE_MAX_AGE_MS,
  shouldPersistQuery,
} from './query-persistence';

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();

export type AuthMode = 'clerk' | 'development-bypass' | 'disabled';

type AppSessionValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
};

type AuthAvailabilityValue = {
  mode: AuthMode;
  isEnabled: boolean;
};

const isLocalPreview =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const AUTH_MODE: AuthMode = CLERK_PUBLISHABLE_KEY
  ? 'clerk'
  : isLocalPreview
    ? 'development-bypass'
    : 'disabled';

const defaultSession: AppSessionValue = {
  isLoaded: true,
  isSignedIn: false,
  getToken: async () => null,
  signOut: async () => {},
};

const AuthAvailabilityContext = createContext<AuthAvailabilityValue>({
  mode: AUTH_MODE,
  isEnabled: AUTH_MODE !== 'disabled',
});

const AppSessionContext = createContext<AppSessionValue>(defaultSession);

export function useAuthAvailability() {
  return useContext(AuthAvailabilityContext);
}

export function useAppSession() {
  return useContext(AppSessionContext);
}

function BaseTrpcProvider({
  children,
  getToken,
  authAvailability,
  session,
  persistenceScope,
}: {
  children: ReactNode;
  getToken?: () => Promise<string | null>;
  authAvailability: AuthAvailabilityValue;
  session: AppSessionValue;
  persistenceScope: string | null | undefined;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const persistenceBuster = useMemo(() => buildWebQueryPersistenceBuster(), []);
  const persistenceKey = useMemo(
    () => buildWebQueryPersistenceKey(persistenceScope),
    [persistenceScope]
  );
  const persister = useMemo(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    return createSyncStoragePersister({
      storage: window.localStorage,
      key: persistenceKey,
    });
  }, [persistenceKey]);

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${API_URL}/trpc`,
          transformer: superjson,
          headers: getToken
            ? async () => {
                const token = await getToken();
                return token ? { Authorization: `Bearer ${token}` } : {};
              }
            : undefined,
        }),
      ],
    })
  );

  return (
    <AuthAvailabilityContext.Provider value={authAvailability}>
      <AppSessionContext.Provider value={session}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          {persister ? (
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={{
                persister,
                maxAge: PERSISTENCE_MAX_AGE_MS,
                buster: persistenceBuster,
                dehydrateOptions: {
                  shouldDehydrateQuery: ({ queryKey, state }) =>
                    shouldPersistQuery({ queryKey, status: state.status }),
                },
              }}
            >
              {children}
            </PersistQueryClientProvider>
          ) : (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          )}
        </trpc.Provider>
      </AppSessionContext.Provider>
    </AuthAvailabilityContext.Provider>
  );
}

function FallbackProviders({ children }: { children: ReactNode }) {
  const authAvailability = useMemo<AuthAvailabilityValue>(
    () => ({
      mode: AUTH_MODE,
      isEnabled: AUTH_MODE !== 'disabled',
    }),
    []
  );
  const session = useMemo<AppSessionValue>(
    () => ({
      isLoaded: true,
      isSignedIn: AUTH_MODE === 'development-bypass',
      getToken: async () => null,
      signOut: async () => {},
    }),
    []
  );

  return (
    <BaseTrpcProvider
      authAvailability={authAvailability}
      session={session}
      persistenceScope={AUTH_MODE === 'development-bypass' ? 'dev-user-001' : null}
    >
      {children}
    </BaseTrpcProvider>
  );
}

function ClerkSessionProviders({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const clerk = useClerk();
  const getTokenRef = useRef(auth.getToken);
  getTokenRef.current = auth.getToken;

  const authAvailability = useMemo<AuthAvailabilityValue>(
    () => ({
      mode: 'clerk',
      isEnabled: true,
    }),
    []
  );
  const session = useMemo<AppSessionValue>(
    () => ({
      isLoaded: auth.isLoaded,
      isSignedIn: auth.isSignedIn ?? false,
      getToken: async () => (await getTokenRef.current()) ?? null,
      signOut: async (options) => {
        await clerk.signOut(
          options?.redirectUrl ? { redirectUrl: options.redirectUrl } : undefined
        );
      },
    }),
    [auth.isLoaded, auth.isSignedIn, clerk]
  );

  return (
    <BaseTrpcProvider
      key={auth.userId ?? 'anon'}
      authAvailability={authAvailability}
      getToken={session.getToken}
      session={session}
      persistenceScope={auth.userId}
    >
      {children}
    </BaseTrpcProvider>
  );
}

function AuthenticatedProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      routerPush={(to) => {
        window.history.pushState(null, '', to);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
      routerReplace={(to) => {
        window.history.replaceState(null, '', to);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
    >
      <ClerkSessionProviders>{children}</ClerkSessionProviders>
    </ClerkProvider>
  );
}

export function RootProviders({ children }: { children: ReactNode }) {
  if (AUTH_MODE === 'clerk') {
    return <AuthenticatedProviders>{children}</AuthenticatedProviders>;
  }

  return <FallbackProviders>{children}</FallbackProviders>;
}
