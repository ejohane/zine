import { asyncStoragePersister } from './persistor';

export async function handlePersistenceError(error: Error): Promise<void> {
  console.error('❌ Cache persistence error:', error);

  if (error.message.includes('QuotaExceededError') || 
      error.message.includes('storage') || 
      error.message.includes('quota')) {
    console.warn('⚠️ Storage quota exceeded, clearing cache...');
    await clearCorruptCache();
  } else if (error.message.includes('JSON') || 
             error.message.includes('parse') || 
             error.message.includes('serialize')) {
    console.warn('⚠️ Corrupt cache data detected, clearing cache...');
    await clearCorruptCache();
  } else {
    console.warn('⚠️ Unknown persistence error, attempting recovery...');
  }
}

export async function clearCorruptCache(): Promise<void> {
  try {
    await asyncStoragePersister.removeClient();
    console.log('✅ Corrupt cache cleared successfully');
  } catch (clearError) {
    console.error('❌ Failed to clear corrupt cache:', clearError);
  }
}

export function logPersistenceSuccess(): void {
  console.log('✅ Cache restored successfully');
}

export function logPersistenceFailure(error: Error): void {
  console.error('❌ Cache restoration failed:', error);
}
