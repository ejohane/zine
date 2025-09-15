import type { Bookmark, CreateBookmark, UpdateBookmark } from '@zine/shared';

// @ts-ignore - Expo environment variable
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';

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
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
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

// Bookmark-specific API methods
export const bookmarksApi = {
  getAll: () => apiClient.get<Bookmark[]>('/api/v1/bookmarks'),
  getById: (id: string) => apiClient.get<Bookmark>(`/api/v1/bookmarks/${id}`),
  create: (bookmark: CreateBookmark) => apiClient.post<Bookmark>('/api/v1/bookmarks', bookmark),
  update: (id: string, bookmark: UpdateBookmark) => apiClient.put<Bookmark>(`/api/v1/bookmarks/${id}`, bookmark),
  delete: (id: string) => apiClient.delete<void>(`/api/v1/bookmarks/${id}`),
  getRecent: (limit: number = 10) => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      status: 'active',
      sort: 'createdAt',
      order: 'desc'
    });
    return apiClient.get<Bookmark[]>(`/api/v1/bookmarks?${params.toString()}`);
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
};