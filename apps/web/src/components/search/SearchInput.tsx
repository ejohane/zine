import { Search, X } from 'lucide-react'
import { useRef, useEffect } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  placeholder?: string
  autoFocus?: boolean
}

export function SearchInput({ 
  value, 
  onChange, 
  onClear, 
  placeholder = "Search bookmarks...",
  autoFocus = true 
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-12 pr-12 py-3 bg-surface hover:bg-surface-hover rounded-full text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-spotify-green transition-all"
          aria-label="Search bookmarks"
          role="searchbox"
        />
        {value && (
          <button
            onClick={onClear}
            className="absolute right-4 p-1 hover:bg-surface-hover rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-spotify-green"
            aria-label="Clear search"
            type="button"
          >
            <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}