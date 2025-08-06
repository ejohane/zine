import { createFileRoute } from '@tanstack/react-router'
import { PageWrapper } from '../components/layout/PageWrapper'
import { SearchInput } from '../components/search/SearchInput'
import { SearchFilters } from '../components/search/SearchFilters'
import { SearchResults } from '../components/search/SearchResults'
import { RecentSearches } from '../components/search/RecentSearches'
import { useSearch } from '../hooks/useSearch'
import { useRecentSearches } from '../hooks/useRecentSearches'
import { useState } from 'react'
import { Filter } from 'lucide-react'

export const Route = createFileRoute('/search')({
  component: SearchPage,
})

function SearchPage() {
  const [showFilters, setShowFilters] = useState(false)
  const search = useSearch()
  const recentSearches = useRecentSearches()


  const handleSelectRecentSearch = (query: string) => {
    search.updateQuery(query)
  }

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-6">Search</h1>
          
          {/* Search Input */}
          <SearchInput
            value={search.query}
            onChange={(query) => {
              search.updateQuery(query)
              if (query.trim()) {
                recentSearches.addSearch(query)
              }
            }}
            onClear={search.clearSearch}
          />

          {/* Filter Toggle Button (Mobile) */}
          <div className="mt-4 md:hidden">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-hover rounded-full text-sm transition-colors"
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              {search.hasActiveFilters && (
                <span className="ml-1 px-2 py-0.5 bg-spotify-green text-black text-xs rounded-full">
                  {Object.keys(search.filters).length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Filters Sidebar (Desktop) */}
          <aside className="hidden md:block w-64 flex-shrink-0">
            <div className="sticky top-24">
              <SearchFilters
                filters={search.filters}
                onUpdateFilters={search.updateFilters}
                onClearFilter={search.clearFilter}
                onClearAll={search.clearAllFilters}
                hasActiveFilters={search.hasActiveFilters}
              />
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1">
            {/* Mobile Filters */}
            {showFilters && (
              <div className="md:hidden mb-6 p-4 bg-surface rounded-lg">
                <SearchFilters
                  filters={search.filters}
                  onUpdateFilters={search.updateFilters}
                  onClearFilter={search.clearFilter}
                  onClearAll={search.clearAllFilters}
                  hasActiveFilters={search.hasActiveFilters}
                />
              </div>
            )}

            {/* Recent Searches - only show when no active search */}
            {!search.query && !search.hasActiveFilters && (
              <RecentSearches
                searches={recentSearches.recentSearches}
                onSelect={handleSelectRecentSearch}
                onRemove={recentSearches.removeSearch}
                onClearAll={recentSearches.clearAll}
              />
            )}

            {/* Search Results */}
            <SearchResults
              results={search.results}
              isLoading={search.isLoading}
              query={search.query}
              resultCount={search.resultCount}
            />
          </main>
        </div>
      </div>
    </PageWrapper>
  )
}