import { Filter, X } from 'lucide-react'
import { type SearchFilters } from '../../hooks/useSearch'
import { cn } from '../../lib/utils'

interface SearchFiltersProps {
  filters: SearchFilters
  onUpdateFilters: (filters: Partial<SearchFilters>) => void
  onClearFilter: (key: keyof SearchFilters) => void
  onClearAll: () => void
  hasActiveFilters: boolean
}

const contentTypes = [
  { value: 'article', label: 'Articles' },
  { value: 'video', label: 'Videos' },
  { value: 'podcast', label: 'Podcasts' },
]

const sources = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'spotify', label: 'Spotify' },
  { value: 'medium', label: 'Medium' },
  { value: 'substack', label: 'Substack' },
]

const sortOptions = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'title', label: 'Title' },
  { value: 'creator', label: 'Creator' },
]

export function SearchFilters({ 
  filters, 
  onUpdateFilters, 
  onClearFilter,
  onClearAll,
  hasActiveFilters 
}: SearchFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Filter header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
        </div>
        {hasActiveFilters && (
          <button
            onClick={onClearAll}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Content Type Filter */}
      <div>
        <h3 className="text-sm font-medium mb-2">Content Type</h3>
        <div className="flex flex-wrap gap-2">
          {contentTypes.map(type => (
            <button
              key={type.value}
              onClick={() => {
                if (filters.contentType === type.value) {
                  onClearFilter('contentType')
                } else {
                  onUpdateFilters({ contentType: type.value })
                }
              }}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm transition-all",
                filters.contentType === type.value
                  ? "bg-spotify-green text-black font-medium"
                  : "bg-surface hover:bg-surface-hover text-muted-foreground"
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Source Filter */}
      <div>
        <h3 className="text-sm font-medium mb-2">Source</h3>
        <div className="flex flex-wrap gap-2">
          {sources.map(source => (
            <button
              key={source.value}
              onClick={() => {
                if (filters.source === source.value) {
                  onClearFilter('source')
                } else {
                  onUpdateFilters({ source: source.value })
                }
              }}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm transition-all",
                filters.source === source.value
                  ? "bg-spotify-green text-black font-medium"
                  : "bg-surface hover:bg-surface-hover text-muted-foreground"
              )}
            >
              {source.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sort Options */}
      <div>
        <h3 className="text-sm font-medium mb-2">Sort By</h3>
        <div className="flex flex-wrap gap-2">
          {sortOptions.map(option => (
            <button
              key={option.value}
              onClick={() => {
                if (filters.sortBy === option.value) {
                  onClearFilter('sortBy')
                } else {
                  onUpdateFilters({ sortBy: option.value as SearchFilters['sortBy'] })
                }
              }}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm transition-all",
                filters.sortBy === option.value
                  ? "bg-spotify-green text-black font-medium"
                  : "bg-surface hover:bg-surface-hover text-muted-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="pt-2 border-t border-surface">
          <div className="flex flex-wrap gap-2">
            {filters.contentType && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface rounded-full text-xs">
                Type: {contentTypes.find(t => t.value === filters.contentType)?.label}
                <button
                  onClick={() => onClearFilter('contentType')}
                  className="ml-1 hover:text-primary"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.source && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface rounded-full text-xs">
                Source: {sources.find(s => s.value === filters.source)?.label}
                <button
                  onClick={() => onClearFilter('source')}
                  className="ml-1 hover:text-primary"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.sortBy && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface rounded-full text-xs">
                Sort: {sortOptions.find(s => s.value === filters.sortBy)?.label}
                <button
                  onClick={() => onClearFilter('sortBy')}
                  className="ml-1 hover:text-primary"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}