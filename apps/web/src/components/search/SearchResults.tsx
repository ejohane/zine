import { type Bookmark } from '../../lib/api'
import { BookmarkCard } from '../home/BookmarkCard'
import { Search } from 'lucide-react'

interface SearchResultsProps {
  results: Bookmark[]
  isLoading: boolean
  query: string
  resultCount: number
}

export function SearchResults({ results, isLoading, query, resultCount }: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Skeleton loaders */}
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-surface rounded-lg h-32 animate-pulse" />
        ))}
      </div>
    )
  }

  if (query && results.length === 0) {
    return (
      <div className="text-center py-16">
        <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">No results found</h3>
        <p className="text-muted-foreground">
          Try searching with different keywords or filters
        </p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-16">
        <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">Start searching</h3>
        <p className="text-muted-foreground">
          Find your saved bookmarks by title, creator, or description
        </p>
      </div>
    )
  }

  // Group results by content type
  const groupedResults = results.reduce((acc, bookmark) => {
    const type = bookmark.contentType || 'other'
    if (!acc[type]) acc[type] = []
    acc[type].push(bookmark)
    return acc
  }, {} as Record<string, Bookmark[]>)

  const typeLabels: Record<string, string> = {
    article: 'Articles',
    video: 'Videos', 
    podcast: 'Podcasts',
    other: 'Other'
  }

  return (
    <div className="space-y-8">
      {/* Result count */}
      <div className="text-sm text-muted-foreground">
        Found {resultCount} {resultCount === 1 ? 'result' : 'results'}
        {query && <span> for "{query}"</span>}
      </div>

      {/* Grouped results */}
      {Object.entries(groupedResults).map(([type, bookmarks]) => (
        <div key={type}>
          <h3 className="text-lg font-semibold mb-4">{typeLabels[type] || type}</h3>
          <div className="space-y-3">
            {bookmarks.map(bookmark => (
              <BookmarkCard key={bookmark.id} bookmark={bookmark} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}