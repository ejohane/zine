// @ts-nocheck
import { useEffect } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { asyncStoragePersister } from '../lib/persistor';
import { getCacheBuster } from '../lib/cacheVersion';
import { 
  handlePersistenceError, 
  logPersistenceSuccess, 
  logPersistenceFailure 
} from '../lib/persistErrorHandler';
import { bookmarksApi } from '../lib/api';
import { syncRecentBookmarksFromStorage } from '../lib/recentBookmarks';
import { useAuth } from './auth';

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
  const { isSignedIn } = useAuth();

  useEffect(() => {
    async function syncRecentBookmarksOnLaunch() {
      try {
        const serverBookmarks = await bookmarksApi.getRecentlyAccessed(4);
        
        if (serverBookmarks.length > 0) {
          const recentItems = serverBookmarks.map(b => ({
            bookmarkId: b.id,
            openedAt: b.lastAccessedAt || Date.now(),
          }));
          
          await syncRecentBookmarksFromStorage({ bookmarks: recentItems });
        }
      } catch (error) {
        console.error('Launch sync failed:', error);
      }
    }
    
    if (isSignedIn) {
      syncRecentBookmarksOnLaunch();
    }
  }, [isSignedIn]);

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