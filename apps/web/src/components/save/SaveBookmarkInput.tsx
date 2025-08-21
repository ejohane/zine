import { Link2, X } from 'lucide-react'
import { useRef, useEffect } from 'react'

interface SaveBookmarkInputProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  placeholder?: string
  autoFocus?: boolean
}

export function SaveBookmarkInput({ 
  value, 
  onChange, 
  onClear, 
  placeholder = "Enter URL to save...",
  autoFocus = true 
}: SaveBookmarkInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  // Clipboard auto-paste on mount only
  useEffect(() => {
    const checkClipboard = async () => {
      // Only check clipboard on initial mount when value is empty
      if (!value && navigator.clipboard && navigator.clipboard.readText) {
        try {
          const clipboardText = await navigator.clipboard.readText()
          // Check if clipboard contains a URL-like string
          if (clipboardText && (clipboardText.startsWith('http://') || clipboardText.startsWith('https://') || clipboardText.includes('.'))) {
            onChange(clipboardText)
          }
        } catch (err) {
          // Clipboard access denied or not available
          console.log('Clipboard access denied or not available')
        }
      }
    }
    
    checkClipboard()
    // Remove dependencies to only run once on mount
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Link2 className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <input
          ref={inputRef}
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-12 pr-12 py-3 bg-surface hover:bg-surface-hover rounded-full text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-spotify-green transition-all"
          aria-label="URL to save"
        />
        {value && (
          <button
            onClick={onClear}
            className="absolute right-4 p-1 hover:bg-surface-hover rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-spotify-green"
            aria-label="Clear URL"
            type="button"
          >
            <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
