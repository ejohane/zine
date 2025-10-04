// @ts-nocheck
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { asyncStoragePersister } from '../lib/persistor';
import { getCacheBuster } from '../lib/cacheVersion';
import { 
  handlePersistenceError, 
  logPersistenceSuccess, 
  logPersistenceFailure 
} from '../lib/persistErrorHandler';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours (IMPORTANT: must be >= maxAge)
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
    },
    mutations: {
      retry: 1,
    },
  },
});

interface QueryProviderProps {
  children: any;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        buster: getCacheBuster(),
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            return query.state.status === 'success';
          },
        },
      }}
      onSuccess={() => {
        logPersistenceSuccess();
      }}
      onError={(error) => {
        logPersistenceFailure(error as Error);
        handlePersistenceError(error as Error);
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}