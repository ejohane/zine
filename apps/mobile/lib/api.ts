import type { CreateBookmark, UpdateBookmark } from '@zine/shared';
import type { Bookmark } from '../types/bookmark';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Get API port from environment or calculate from port offset
function getApiPort(): number {
  // Read port offset from environment (EXPO_PUBLIC_ prefix makes it available in JS runtime)
  const portOffset = process.env.EXPO_PUBLIC_PORT_OFFSET ? parseInt(process.env.EXPO_PUBLIC_PORT_OFFSET, 10) : 0;
  const apiPort = 8787 + portOffset;
  if (__DEV__) {
    console.log(`📊 Port calculation: 8787 + ${portOffset} = ${apiPort}`);
  }
  return apiPort;
}

// Replace port in URL string
function replacePortInUrl(url: string, newPort: number): string {
  // Match protocol://host:port or protocol://host
  const match = url.match(/^(https?:\/\/[^:\/]+)(:\d+)?(\/.*)?$/);
  if (match) {
    const protocol = match[1]; // http://hostname or https://hostname
    const path = match[3] || ''; // path or empty
    const result = `${protocol}:${newPort}${path}`;
    if (__DEV__) {
      console.log(`🔄 Replaced port in ${url} → ${result}`);
    }
    return result;
  }
  if (__DEV__) {
    console.warn(`⚠️ Failed to replace port in URL: ${url}`);
  }
  return url; // Return original if pattern doesn't match
}

// Determine the API URL based on the environment
function getApiUrl(): string {
  if (__DEV__) {
    console.log('🔍 ENV DEBUG:');
    console.log('  EXPO_PUBLIC_API_URL:', process.env.EXPO_PUBLIC_API_URL);
    console.log('  EXPO_PUBLIC_PORT_OFFSET:', process.env.EXPO_PUBLIC_PORT_OFFSET);
    console.log('  EXPO_PUBLIC_TAILSCALE_API_URL:', process.env.EXPO_PUBLIC_TAILSCALE_API_URL);
  }

  // If explicitly set in environment, use that
  if (process.env.EXPO_PUBLIC_API_URL) {
    if (__DEV__) {
      console.log('⚠️ Using explicit EXPO_PUBLIC_API_URL (this may be wrong!)');
    }
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // In production builds, always use the production API
  if (!__DEV__) {
    return 'https://api.myzine.app';
  }

  const apiPort = getApiPort();

  // In development, check if we're on a simulator or physical device
  const isSimulator = Constants.isDevice === false;
  
  if (__DEV__) {
    console.log(`🔍 Device Detection: Constants.isDevice = ${Constants.isDevice}, isSimulator = ${isSimulator}`);
  }
  
  if (Platform.OS === 'ios') {
    // iOS Simulator can use localhost
    if (isSimulator) {
      if (__DEV__) {
        console.log(`✅ Using localhost for iOS Simulator`);
      }
      return `http://localhost:${apiPort}`;
    }
    if (__DEV__) {
      console.log(`📱 Physical iOS device detected, using network IP`);
    }
    // Physical iOS device needs your Mac's IP address
    // You can use either your local network IP or Tailscale IP
    if (process.env.EXPO_PUBLIC_TAILSCALE_API_URL) {
      return replacePortInUrl(process.env.EXPO_PUBLIC_TAILSCALE_API_URL, apiPort);
    }
    return `http://100.90.89.84:${apiPort}`;
  }

  if (Platform.OS === 'android') {
    // Android Emulator uses 10.0.2.2 to reach host machine
    if (isSimulator) {
      return `http://10.0.2.2:${apiPort}`;
    }
    // Physical Android device needs your Mac's IP address
    if (process.env.EXPO_PUBLIC_TAILSCALE_API_URL) {
      return replacePortInUrl(process.env.EXPO_PUBLIC_TAILSCALE_API_URL, apiPort);
    }
    return `http://100.90.89.84:${apiPort}`;
  }

  // Fallback
  return `http://localhost:${apiPort}`;
}

const API_URL = getApiUrl();

// Log the API URL being used (only in development)
if (__DEV__) {
  console.log(`🔗 API URL: ${API_URL}`);
  console.log(`📱 Device: ${Constants.isDevice ? 'Physical' : 'Simulator'}`);
  console.log(`🖥️ Platform: ${Platform.OS}`);
}

// Store the getToken function reference
let getTokenFunction: (() => Promise<string | null>) | null = null;

// Initialize the API client with the auth hook
export function initializeApiClient(getToken: () => Promise<string | null>) {
  getTokenFunction = getToken;
}

// Authenticated fetch wrapper
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_URL}${endpoint}`;
  
  // Get the authentication token
  const token = getTokenFunction ? await getTokenFunction() : null;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  // Add authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    // Handle unauthorized responses
    if (response.status === 401) {
      // Token might be expired, try to get a fresh one
      if (getTokenFunction) {
        const freshToken = await getTokenFunction();
        if (freshToken && freshToken !== token) {
          // Retry with fresh token
          headers['Authorization'] = `Bearer ${freshToken}`;
          return fetch(url, {
            ...options,
            headers,
          });
        }
      }
    }
    
    return response;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// API client with typed methods
export const apiClient = {
  // GET request
  get: async <T = any>(endpoint: string): Promise<T> => {
    const response = await authenticatedFetch(endpoint, {
      method: 'GET',
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Request failed with status ${response.status}`);
    }
    
    return response.json();
  },
  
  // POST request
  post: async <T = any>(endpoint: string, data?: any): Promise<T> => {
    const response = await authenticatedFetch(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Request failed with status ${response.status}`);
    }
    
    return response.json();
  },
  
  // PUT request
  put: async <T = any>(endpoint: string, data?: any): Promise<T> => {
    const response = await authenticatedFetch(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Request failed with status ${response.status}`);
    }
    
    return response.json();
  },
  
  // DELETE request
  delete: async <T = any>(endpoint: string): Promise<T> => {
    const response = await authenticatedFetch(endpoint, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Request failed with status ${response.status}`);
    }
    
    // Handle empty responses
    const text = await response.text();
    return text ? JSON.parse(text) : {} as T;
  },
  
  // PATCH request
  patch: async <T = any>(endpoint: string, data?: any): Promise<T> => {
    const response = await authenticatedFetch(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Request failed with status ${response.status}`);
    }
    
    return response.json();
  },
};

// Types for bookmark operations
interface PreviewResponse {
  data: Bookmark;
  source: string;
  cached: boolean;
}

interface SaveBookmarkResponse {
  data?: Bookmark;
  duplicate?: boolean;
  duplicateContentId?: string;
  duplicateReasons?: string[];
  enrichmentSource?: string;
  message?: string;
  error?: string;
}

const logAlternateLinks = (bookmark?: Bookmark | null, context?: string) => {
  if (!__DEV__ || !bookmark?.alternateLinks?.length) {
    return;
  }

  console.log(
    `🔁 Alternate links${context ? ` (${context})` : ''}:`,
    bookmark.alternateLinks.map(link => `${link.provider}:${link.externalId ?? link.url}`).join(', ')
  );
};

// Types for API responses
interface BookmarksResponse {
  data: Bookmark[];
  meta: {
    total: number;
    userId: string;
    status: string;
    source?: string;
    contentType?: string;
  };
}

// Bookmark-specific API methods
export const bookmarksApi = {
  getAll: async () => {
    const response = await apiClient.get<BookmarksResponse>('/api/v1/bookmarks');
    // Extract the data array from the response
    if (!response.data) {
      console.warn('API returned invalid bookmarks data:', response);
      return [];
    }
    if (__DEV__) {
      response.data.forEach((bookmark) => logAlternateLinks(bookmark, 'list'));
    }
    return response.data;
  },
  getById: async (id: string) => {
    const bookmark = await apiClient.get<Bookmark>(`/api/v1/bookmarks/${id}`);
    logAlternateLinks(bookmark, 'detail');
    return bookmark;
  },
  create: (bookmark: CreateBookmark) => apiClient.post<Bookmark>('/api/v1/bookmarks', bookmark),
  update: (id: string, bookmark: UpdateBookmark) => apiClient.put<Bookmark>(`/api/v1/bookmarks/${id}`, bookmark),
  delete: (id: string) => apiClient.delete<void>(`/api/v1/bookmarks/${id}`),
  getRecent: async (limit: number = 10, offset: number = 0) => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      status: 'active',
      sort: 'createdAt',
      order: 'desc'
    });
    const response = await apiClient.get<BookmarksResponse>(`/api/v1/bookmarks?${params.toString()}`);
    if (!response.data) {
      console.warn('API returned invalid bookmarks data:', response);
      return [];
    }
    if (__DEV__) {
      response.data.forEach((bookmark) => logAlternateLinks(bookmark, 'recent'));
    }
    return response.data;
  },
  preview: async (url: string): Promise<Bookmark> => {
    const response = await apiClient.post<PreviewResponse>('/api/v1/bookmarks/preview', { url });
    logAlternateLinks(response.data, 'preview');
    return response.data;
  },
  save: async (url: string): Promise<{ bookmark: Bookmark; duplicate: boolean; duplicateContentId?: string; duplicateReasons?: string[]; enrichmentSource?: string }> => {
    // Use the enriched save endpoint for better metadata extraction
    const response = await apiClient.post<SaveBookmarkResponse>('/api/v1/enriched-bookmarks/save-enriched', { url });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    if (!response.data) {
      throw new Error('Failed to save bookmark');
    }
    
    logAlternateLinks(response.data, response.duplicate ? 'duplicate-save' : 'save');

    return {
      bookmark: response.data,
      duplicate: Boolean(response.duplicate),
      duplicateContentId: response.duplicateContentId,
      duplicateReasons: response.duplicateReasons,
      enrichmentSource: response.enrichmentSource,
    };
  },
  refreshMetadata: async (id: string): Promise<Bookmark> => {
    const response = await apiClient.put<{ data?: Bookmark; message?: string; enrichmentSource?: string }>(
      `/api/v1/enriched-bookmarks/${id}/refresh-enriched`
    );

    if (!response?.data) {
      throw new Error(response?.message || 'Failed to refresh bookmark');
    }

    logAlternateLinks(response.data, 'refresh');
    return response.data;
  },
  getBookmarksByCreator: async (creatorId: string, page: number = 1, limit: number = 20): Promise<Bookmark[]> => {
    const response = await apiClient.get<{ creator: any; bookmarks: Bookmark[] }>(`/api/v1/bookmarks/creator/${creatorId}?page=${page}&limit=${limit}`);
    return response.bookmarks || [];
  },
  getBookmarksByCreatorWithDetails: async (creatorId: string, page: number = 1, limit: number = 20): Promise<{ 
    creator: any; 
    bookmarks: Bookmark[];
    totalCount: number;
    page: number;
    limit: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    totalPages: number;
  }> => {
    return apiClient.get<{ 
      creator: any; 
      bookmarks: Bookmark[];
      totalCount: number;
      page: number;
      limit: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      totalPages: number;
    }>(`/api/v1/bookmarks/creator/${creatorId}?page=${page}&limit=${limit}`);
  },
  archive: async (id: string): Promise<Bookmark> => {
    return apiClient.put<Bookmark>(`/api/v1/bookmarks/${id}/archive`);
  },
  unarchive: async (id: string): Promise<Bookmark> => {
    return apiClient.put<Bookmark>(`/api/v1/bookmarks/${id}/unarchive`);
  },
  trackAccessed: async (bookmarkId: string): Promise<void> => {
    await apiClient.patch(`/api/v1/bookmarks/${bookmarkId}/accessed`);
  },
  getRecentlyAccessed: async (limit: number = 4): Promise<Bookmark[]> => {
    const response = await apiClient.get<BookmarksResponse>(`/api/v1/bookmarks/recent?limit=${limit}`);
    if (!response.data) {
      console.warn('API returned invalid recent bookmarks data:', response);
      return [];
    }
    if (__DEV__) {
      response.data.forEach((bookmark) => logAlternateLinks(bookmark, 'recently-accessed'));
    }
    return response.data;
  },
};

// Feed-specific API methods
export const feedsApi = {
  getAll: () => apiClient.get<any[]>('/api/v1/feeds'),
  subscribe: (feedUrl: string) => apiClient.post<any>('/api/v1/feeds/subscribe', { url: feedUrl }),
  unsubscribe: (feedId: string) => apiClient.delete<void>(`/api/v1/feeds/${feedId}`),
  getItems: (feedId: string) => apiClient.get<any[]>(`/api/v1/feeds/${feedId}/items`),
  hideFeedItem: (itemId: string) => apiClient.put<void>(`/api/v1/feed/${itemId}/hide`),
  unhideFeedItem: (itemId: string) => apiClient.put<void>(`/api/v1/feed/${itemId}/unhide`),
};

// Subscription API methods
export const subscriptionsApi = {
  refresh: () => apiClient.post<{ message: string }>('/api/v1/subscriptions/refresh', {}),
  
  discover: async (provider: 'spotify' | 'youtube'): Promise<DiscoveryResult> => {
    return apiClient.get<DiscoveryResult>(`/api/v1/subscriptions/discover/${provider}`);
  },

  update: async (
    provider: 'spotify' | 'youtube', 
    subscriptions: Array<{
      externalId: string;
      title: string;
      creatorName: string;
      description?: string;
      thumbnailUrl?: string;
      subscriptionUrl?: string;
      selected: boolean;
      totalEpisodes?: number;
    }>
  ): Promise<{ added: number; removed: number }> => {
    return apiClient.post<{ added: number; removed: number }>(
      `/api/v1/subscriptions/${provider}/update`,
      { subscriptions }
    );
  },

  list: async (provider?: 'spotify' | 'youtube'): Promise<UserSubscription[]> => {
    const endpoint = provider 
      ? `/api/v1/subscriptions?provider=${provider}`
      : '/api/v1/subscriptions';
    const response = await apiClient.get<{ subscriptions: UserSubscription[] }>(endpoint);
    return response.subscriptions;
  }
};

// Search API methods
export const searchApi = {
  search: (query: string, params?: Record<string, string>) => {
    const searchParams = new URLSearchParams({ q: query, ...params });
    return apiClient.get<any>(`/api/v1/search?${searchParams.toString()}`);
  },
};

// User API methods
export const userApi = {
  getProfile: () => apiClient.get<any>('/api/v1/users/me'),
  updateProfile: (data: any) => apiClient.patch<any>('/api/v1/users/me', data),
};

// OAuth/Account Types
export interface ConnectedAccount {
  provider: 'spotify' | 'youtube';
  isConnected: boolean;
  connectedAt?: string;
  email?: string;
  name?: string;
}

export interface AccountsResponse {
  accounts: ConnectedAccount[];
}

export interface OAuthConnectResponse {
  authUrl: string;
}

export interface DiscoveredSubscription {
  externalId: string;
  title: string;
  creatorName: string;
  description?: string;
  thumbnailUrl?: string;
  subscriptionUrl?: string;
  provider: 'spotify' | 'youtube';
  isUserSubscribed: boolean;
  totalEpisodes?: number;
}

export interface DiscoveryResult {
  provider: 'spotify' | 'youtube';
  subscriptions: DiscoveredSubscription[];
  totalFound: number;
  errors?: string[];
}

export interface UserSubscription {
  id: string;
  externalId: string;
  title: string;
  creatorName: string;
  description?: string;
  thumbnailUrl?: string;
  subscriptionUrl?: string;
  provider: 'spotify' | 'youtube';
  createdAt: string;
  updatedAt: string;
}

// OAuth/Account API methods
export const accountsApi = {
  fetchAccounts: async (): Promise<ConnectedAccount[]> => {
    try {
      const response = await apiClient.get<{ accounts: any[] }>('/api/v1/accounts');
      
      return (response?.accounts || []).map(account => ({
        provider: account.provider.id as 'spotify' | 'youtube',
        isConnected: account.connected,
        connectedAt: account.connectedAt || undefined,
        externalAccountId: account.externalAccountId || undefined
      }));
    } catch (error) {
      console.error('Failed to fetch accounts from API:', error);
      return [];
    }
  },
  
  connectAccount: async (provider: string, redirectUrl?: string): Promise<string> => {
    const response = await apiClient.post<OAuthConnectResponse>(`/api/v1/auth/${provider}/connect`, {
      redirectUrl
    });
    return response.authUrl;
  },
  
  disconnectAccount: async (provider: string): Promise<void> => {
    return apiClient.delete<void>(`/api/v1/auth/${provider}/disconnect`);
  }
};

// Re-export the recent bookmarks method for backward compatibility
export const getRecentBookmarks = (_token: string, limit: number = 10) => {
  return bookmarksApi.getRecent(limit);
};

// Main API object with manual token passing support
export const api = {
  getBookmark: async (id: string, _token: string): Promise<Bookmark> => {
    return bookmarksApi.getById(id);
  },
  deleteBookmark: async (id: string, _token: string): Promise<void> => {
    return bookmarksApi.delete(id);
  },
  getRecentBookmarks: async (_token: string, limit: number = 10): Promise<Bookmark[]> => {
    return bookmarksApi.getRecent(limit);
  },
  getBookmarksByCreator: async (creatorId: string, _token: string, page: number = 1, limit: number = 20): Promise<Bookmark[]> => {
    return bookmarksApi.getBookmarksByCreator(creatorId, page, limit);
  },
  getBookmarksByCreatorWithDetails: async (creatorId: string, _token: string, page: number = 1, limit: number = 20): Promise<{ 
    creator: any; 
    bookmarks: Bookmark[];
    totalCount: number;
    page: number;
    limit: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    totalPages: number;
  }> => {
    return bookmarksApi.getBookmarksByCreatorWithDetails(creatorId, page, limit);
  },
};
