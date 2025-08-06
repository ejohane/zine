import { useState, useCallback, useEffect } from 'react'

const RECENT_SEARCHES_KEY = 'zine-recent-searches'
const MAX_RECENT_SEARCHES = 10

export interface RecentSearch {
  query: string
  timestamp: number
}

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
      if (stored) {
        const searches = JSON.parse(stored) as RecentSearch[]
        setRecentSearches(searches)
      }
    } catch (error) {
      console.error('Error loading recent searches:', error)
    }
  }, [])

  // Save recent searches to localStorage
  const saveToStorage = useCallback((searches: RecentSearch[]) => {
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches))
    } catch (error) {
      console.error('Error saving recent searches:', error)
    }
  }, [])

  // Add a new search
  const addSearch = useCallback((query: string) => {
    if (!query.trim()) return

    setRecentSearches(prev => {
      // Remove duplicate if exists
      const filtered = prev.filter(s => s.query.toLowerCase() !== query.toLowerCase())
      
      // Add new search at the beginning
      const newSearches = [
        { query: query.trim(), timestamp: Date.now() },
        ...filtered
      ].slice(0, MAX_RECENT_SEARCHES)
      
      saveToStorage(newSearches)
      return newSearches
    })
  }, [saveToStorage])

  // Remove a specific search
  const removeSearch = useCallback((query: string) => {
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s.query !== query)
      saveToStorage(filtered)
      return filtered
    })
  }, [saveToStorage])

  // Clear all recent searches
  const clearAll = useCallback(() => {
    setRecentSearches([])
    localStorage.removeItem(RECENT_SEARCHES_KEY)
  }, [])

  return {
    recentSearches,
    addSearch,
    removeSearch,
    clearAll,
    hasRecentSearches: recentSearches.length > 0
  }
}