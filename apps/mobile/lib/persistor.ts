import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { removeOldestQuery } from '@tanstack/react-query-persist-client';

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'ZINE_QUERY_CACHE',
  throttleTime: 1000,
  serialize: JSON.stringify,
  deserialize: JSON.parse,
  retry: removeOldestQuery,
});
