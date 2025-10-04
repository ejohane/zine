import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient } from '../contexts/query';
import { asyncStoragePersister } from './persistor';

export async function clearQueryCache(): Promise<void> {
  try {
    queryClient.clear();
    
    await asyncStoragePersister.removeClient();
    
    await AsyncStorage.removeItem('ZINE_QUERY_CACHE');
    
    console.log('✅ Query cache cleared successfully');
  } catch (error) {
    console.error('❌ Failed to clear query cache:', error);
    throw error;
  }
}

export async function getCacheSize(): Promise<number> {
  try {
    const cacheData = await AsyncStorage.getItem('ZINE_QUERY_CACHE');
    if (!cacheData) return 0;
    
    const sizeInBytes = new Blob([cacheData]).size;
    return sizeInBytes;
  } catch (error) {
    console.error('❌ Failed to get cache size:', error);
    return 0;
  }
}

export function formatCacheSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
