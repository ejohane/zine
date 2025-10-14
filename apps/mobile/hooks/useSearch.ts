// @ts-nocheck
import * as React from 'react';
const { useState, useEffect, useCallback, useRef } = React;
import { searchApi } from '../lib/api';

export interface SearchResult {
  type: 'bookmark' | 'feed_item';
  id: string;
  title: string;
  description?: string;
  url: string;
  thumbnailUrl?: string;
  creator?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  contentType?: 'video' | 'podcast' | 'article';
  publishedAt?: string;
  relevanceScore: number;
  notes?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  query: string;
  facets: {
    bookmarks: number;
    content: number;
  };
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface SearchFilters {
  type?: 'bookmarks' | 'feeds' | 'content' | 'all';
  limit?: number;
  offset?: number;
}

const DEFAULT_FILTERS: SearchFilters = {
  type: 'all',
  limit: 20,
  offset: 0,
};

export interface UseSearchOptions {
  initialQuery?: string;
  initialFilters?: SearchFilters;
  debounceMs?: number;
}

export function useSearch(options: UseSearchOptions = {}) {
  const defaultFiltersRef = useRef<SearchFilters>({
    ...DEFAULT_FILTERS,
    ...options.initialFilters,
  });

  const debounceDelay = options.debounceMs ?? 300;

  const [searchQuery, setSearchQueryState] = useState(options.initialQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(options.initialQuery ?? '');
  const [filters, setFilters] = useState<SearchFilters>(defaultFiltersRef.current);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
  }, []);

  // Debounce search query (300ms)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, debounceDelay);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, debounceDelay]);

  const performSearch = useCallback(async (query: string, searchFilters: SearchFilters, append: boolean = false) => {
    if (!query || query.trim().length === 0) {
      setResults(null);
      setLoading(false);
      return;
    }

    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const params = new URLSearchParams();
      params.append('q', query.trim());
      
      if (searchFilters.type && searchFilters.type !== 'all') {
        params.append('type', searchFilters.type);
      }
      
      if (searchFilters.limit) {
        params.append('limit', searchFilters.limit.toString());
      }
      
      if (searchFilters.offset) {
        params.append('offset', searchFilters.offset.toString());
      }

      const data = await searchApi.search(query.trim(), Object.fromEntries(params));
      
      if (append) {
        setResults(prevResults => prevResults ? {
          ...data,
          results: [...prevResults.results, ...data.results],
        } : data);
      } else {
        setResults(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search');
      console.error('Search error:', err);
      if (!append) {
        setResults(null);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Perform search when debounced query or filters change
  useEffect(() => {
    if (filters.offset && filters.offset > 0) {
      return;
    }

    if (debouncedQuery !== searchQuery) {
      return;
    }

    performSearch(debouncedQuery, filters);
  }, [debouncedQuery, filters, performSearch, searchQuery]);

  const updateFilters = useCallback((newFilters: Partial<SearchFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultFiltersRef.current);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setResults(null);
    setError(null);
    resetFilters();
  }, [resetFilters]);

  const refetch = useCallback(() => {
    performSearch(debouncedQuery, filters, false);
  }, [debouncedQuery, filters, performSearch]);

  const loadMore = useCallback(() => {
    if (!results || !results.pagination.hasMore || loadingMore) {
      return;
    }

    const baseOffset = results.pagination.offset ?? filters.offset ?? 0;
    const pageSize = results.pagination.limit ?? filters.limit ?? 20;
    const newOffset = baseOffset + pageSize;

    performSearch(debouncedQuery, { ...filters, offset: newOffset }, true);
  }, [debouncedQuery, filters, results, loadingMore, performSearch]);

  return {
    searchQuery,
    setSearchQuery,
    results,
    loading,
    loadingMore,
    error,
    filters,
    updateFilters,
    resetFilters,
    clearSearch,
    refetch,
    loadMore,
    hasResults: results && results.results.length > 0,
    isSearching: searchQuery.length > 0,
    canLoadMore: results?.pagination.hasMore || false,
  };
}
