import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { useState, useCallback, useEffect } from 'react'
import { fetchBookmarks } from '../lib/api'

export interface SearchFilters {
  contentType?: string
  source?: string
  status?: string
  sortBy?: 'recent' | 'title' | 'creator'
}

export interface SearchState {
  query: string
  filters: SearchFilters
}

export function useSearch(initialQuery = '') {
  const { getToken } = useAuth()
  const [searchState, setSearchState] = useState<SearchState>({
    query: initialQuery,
    filters: {}
  })
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchState.query)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchState.query])

  // Search query
  const { data: searchResults = [], isLoading, error } = useQuery({
    queryKey: ['search', debouncedQuery, searchState.filters],
    queryFn: async () => {
      const token = await getToken()
      
      // If no search query and no filters, return empty
      if (!debouncedQuery && Object.keys(searchState.filters).length === 0) {
        return []
      }

      // Fetch all bookmarks with filters
      const bookmarks = await fetchBookmarks(token, searchState.filters)
      
      // If there's a search query, filter results
      if (debouncedQuery) {
        const query = debouncedQuery.toLowerCase()
        return bookmarks.filter(bookmark => 
          bookmark.title.toLowerCase().includes(query) ||
          bookmark.description?.toLowerCase().includes(query) ||
          bookmark.creator?.name?.toLowerCase().includes(query) ||
          bookmark.source?.toLowerCase().includes(query)
        )
      }
      
      return bookmarks
    },
    enabled: debouncedQuery.length > 0 || Object.keys(searchState.filters).length > 0,
  })

  // Update search query
  const updateQuery = useCallback((query: string) => {
    setSearchState(prev => ({ ...prev, query }))
  }, [])

  // Update filters
  const updateFilters = useCallback((filters: Partial<SearchFilters>) => {
    setSearchState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...filters }
    }))
  }, [])

  // Clear specific filter
  const clearFilter = useCallback((filterKey: keyof SearchFilters) => {
    setSearchState(prev => {
      const newFilters = { ...prev.filters }
      delete newFilters[filterKey]
      return { ...prev, filters: newFilters }
    })
  }, [])

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setSearchState(prev => ({ ...prev, filters: {} }))
  }, [])

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchState({ query: '', filters: {} })
  }, [])

  // Sort results
  const sortedResults = [...searchResults].sort((a, b) => {
    switch (searchState.filters.sortBy) {
      case 'title':
        return a.title.localeCompare(b.title)
      case 'creator':
        return (a.creator?.name || '').localeCompare(b.creator?.name || '')
      case 'recent':
      default:
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    }
  })

  return {
    query: searchState.query,
    filters: searchState.filters,
    results: sortedResults,
    isLoading,
    error,
    updateQuery,
    updateFilters,
    clearFilter,
    clearAllFilters,
    clearSearch,
    hasActiveFilters: Object.keys(searchState.filters).length > 0,
    resultCount: sortedResults.length
  }
}