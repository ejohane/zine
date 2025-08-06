import { Clock, X } from 'lucide-react'
import { type RecentSearch } from '../../hooks/useRecentSearches'

interface RecentSearchesProps {
  searches: RecentSearch[]
  onSelect: (query: string) => void
  onRemove: (query: string) => void
  onClearAll: () => void
}

export function RecentSearches({ searches, onSelect, onRemove, onClearAll }: RecentSearchesProps) {
  if (searches.length === 0) return null

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Recent Searches</h2>
        <button
          onClick={onClearAll}
          className="text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="space-y-2">
        {searches.map((search) => (
          <div
            key={search.query}
            className="group flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-hover rounded-lg cursor-pointer transition-colors"
            onClick={() => onSelect(search.query)}
          >
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{search.query}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove(search.query)
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-surface rounded transition-all"
              aria-label="Remove search"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}