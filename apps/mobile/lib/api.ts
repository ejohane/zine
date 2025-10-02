import type { Bookmark, CreateBookmark, UpdateBookmark } from '@zine/shared';
import type { Creator } from '../types/bookmark';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Determine the API URL based on the environment
function getApiUrl(): string {
  // If explicitly set in environment, use that
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // In production builds, always use the production API
  if (!__DEV__) {
    return 'https://api.myzine.app';
  }

  // In development, check if we're on a simulator or physical device
  const isSimulator = Constants.isDevice === false;
  
  if (Platform.OS === 'ios') {
    // iOS Simulator can use localhost
    if (isSimulator) {
      return 'http://localhost:8787';
    }
    // Physical iOS device needs your Mac's IP address
    // You can use either your local network IP or Tailscale IP
    return process.env.EXPO_PUBLIC_TAILSCALE_API_URL || 'http://100.90.89.84:8787';
  }

  if (Platform.OS === 'android') {
    // Android Emulator uses 10.0.2.2 to reach host machine
    if (isSimulator) {
      return 'http://10.0.2.2:8787';
    }
    // Physical Android device needs your Mac's IP address
    return process.env.EXPO_PUBLIC_TAILSCALE_API_URL || 'http://100.90.89.84:8787';
  }

  // Fallback
  return 'http://localhost:8787';
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
  duplicate?: Bookmark;
  error?: string;
}

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
    return response.data;
  },
  getById: (id: string) => apiClient.get<Bookmark>(`/api/v1/bookmarks/${id}`),
  create: (bookmark: CreateBookmark) => apiClient.post<Bookmark>('/api/v1/bookmarks', bookmark),
  update: (id: string, bookmark: UpdateBookmark) => apiClient.put<Bookmark>(`/api/v1/bookmarks/${id}`, bookmark),
  delete: (id: string) => apiClient.delete<void>(`/api/v1/bookmarks/${id}`),
  getRecent: async (limit: number = 10) => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      status: 'active',
      sort: 'createdAt',
      order: 'desc'
    });
    const response = await apiClient.get<BookmarksResponse>(`/api/v1/bookmarks?${params.toString()}`);
    // Extract the data array from the response
    if (!response.data) {
      console.warn('API returned invalid bookmarks data:', response);
      return [];
    }
    return response.data;
  },
  preview: async (url: string): Promise<Bookmark> => {
    const response = await apiClient.post<PreviewResponse>('/api/v1/bookmarks/preview', { url });
    return response.data;
  },
  save: async (url: string): Promise<Bookmark> => {
    // Use the enriched save endpoint for better metadata extraction
    const response = await apiClient.post<SaveBookmarkResponse>('/api/v1/enriched-bookmarks/save-enriched', { url });
    
    if (response.duplicate) {
      throw new Error(`Bookmark already exists: ${response.duplicate.title}`);
    }
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    if (!response.data) {
      throw new Error('Failed to save bookmark');
    }
    
    return response.data;
  },
  refreshMetadata: async (id: string): Promise<Bookmark> => {
    const response = await apiClient.put<{ data: Bookmark; message?: string }>(`/api/v1/bookmarks/${id}/refresh`);
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
};

// Feed-specific API methods
export const feedsApi = {
  getAll: () => apiClient.get<any[]>('/api/v1/feeds'),
  subscribe: (feedUrl: string) => apiClient.post<any>('/api/v1/feeds/subscribe', { url: feedUrl }),
  unsubscribe: (feedId: string) => apiClient.delete<void>(`/api/v1/feeds/${feedId}`),
  getItems: (feedId: string) => apiClient.get<any[]>(`/api/v1/feeds/${feedId}/items`),
};

// Search API methods
export const searchApi = {
  search: (query: string) => apiClient.get<any[]>(`/api/v1/search?q=${encodeURIComponent(query)}`),
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