import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RecentBookmark {
  bookmarkId: string;
  openedAt: number;
}

export interface RecentBookmarksData {
  bookmarks: RecentBookmark[];
}

const STORAGE_KEY = '@zine:recent_bookmarks';
const MAX_RECENT_BOOKMARKS = 4;

export async function getRecentBookmarks(): Promise<RecentBookmark[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    
    const parsed: RecentBookmarksData = JSON.parse(data);
    return parsed.bookmarks || [];
  } catch (error) {
    console.error('Failed to get recent bookmarks:', error);
    return [];
  }
}

export async function addRecentBookmark(bookmarkId: string): Promise<void> {
  try {
    const existing = await getRecentBookmarks();
    
    const filtered = existing.filter(b => b.bookmarkId !== bookmarkId);
    
    const updated = [
      { bookmarkId, openedAt: Date.now() },
      ...filtered,
    ];
    
    const trimmed = updated.slice(0, MAX_RECENT_BOOKMARKS);
    
    const data: RecentBookmarksData = { bookmarks: trimmed };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to add recent bookmark:', error);
  }
}

export async function clearRecentBookmarks(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear recent bookmarks:', error);
  }
}
