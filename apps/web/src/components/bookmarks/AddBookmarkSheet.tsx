import * as React from 'react'
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Input, Spinner, Button } from '@zine/design-system'
import { X, Link2, Save, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getClipboardUrlIfValid } from '@/utils/clipboard'
import { validateUrl, normalizeUrl } from '@/utils/validation'
import { useBookmarkPreview } from '@/hooks/useBookmarkPreview'
import { useCreateBookmark } from '@/hooks/useCreateBookmark'
import { BookmarkPreview } from './BookmarkPreview'

interface AddBookmarkSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddBookmarkSheet({ open, onOpenChange }: AddBookmarkSheetProps) {
  const [url, setUrl] = React.useState('')
  const [debouncedUrl, setDebouncedUrl] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [notes, setNotes] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Use the preview hook with debounced URL
  const { 
    data: preview, 
    isLoading: isLoadingPreview, 
    error: previewError,
    refetch: retryPreview 
  } = useBookmarkPreview(
    debouncedUrl,
    !!debouncedUrl && !error
  )

  // Use the create bookmark mutation
  const createBookmark = useCreateBookmark()

  // Debounce URL input for preview API calls
  React.useEffect(() => {
    const trimmedUrl = url.trim()
    
    if (!trimmedUrl) {
      setDebouncedUrl('')
      return
    }

    const validation = validateUrl(trimmedUrl)
    if (!validation.valid) {
      return
    }

    const timer = setTimeout(() => {
      setDebouncedUrl(normalizeUrl(trimmedUrl))
    }, 500)

    return () => clearTimeout(timer)
  }, [url])

  // Auto-focus and auto-paste from clipboard when sheet opens
  React.useEffect(() => {
    if (open) {
      // Focus the input after sheet animation completes
      const focusTimer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          // On mobile, select the input to trigger keyboard
          if ('ontouchstart' in window) {
            inputRef.current.select()
          }
        }
      }, 300) // Reduced back to 300ms for Radix sheet

      // Try to paste from clipboard
      if (!url) { // Only paste if URL is empty
        getClipboardUrlIfValid().then((clipboardUrl) => {
          if (clipboardUrl) {
            setUrl(clipboardUrl)
            setError(null)
          }
        })
      }

      return () => clearTimeout(focusTimer)
    }
  }, [open, url])

  // Reset state when sheet closes
  React.useEffect(() => {
    if (!open) {
      // Small delay to let animation complete before resetting
      const resetTimer = setTimeout(() => {
        setUrl('')
        setDebouncedUrl('')
        setError(null)
        setNotes('')
      }, 200)
      return () => clearTimeout(resetTimer)
    }
  }, [open])

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)
    
    // Clear error when user starts typing
    if (error) {
      setError(null)
    }

    // Basic validation as user types (with trimmed URL)
    const trimmedUrl = newUrl.trim()
    if (trimmedUrl && trimmedUrl.length > 5) {
      const validation = validateUrl(trimmedUrl)
      if (!validation.valid) {
        setError(validation.error || null)
      }
    }
  }

  const handleClearInput = () => {
    setUrl('')
    setError(null)
    inputRef.current?.focus()
  }

  const handleSaveBookmark = async () => {
    if (!preview || !debouncedUrl) return

    try {
      await createBookmark.mutateAsync({
        url: debouncedUrl,
        notes: notes.trim() || undefined,
      })
      
      // Close the sheet on success
      onOpenChange(false)
    } catch (error) {
      // Error is handled by the mutation's onError callback
      console.error('Failed to save bookmark:', error)
    }
  }

  const canSave = preview && !isLoadingPreview && !error && !createBookmark.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className={cn(
          "h-[85vh] sm:h-[80vh]",
          "rounded-t-[20px]",
          "border-t border-gray-200 dark:border-zinc-800",
          "focus:outline-none",
          "overflow-hidden",
          "flex flex-col"
        )}
        aria-label="Add bookmark dialog"
        aria-describedby="add-bookmark-description"
      >
        {/* Drag handle */}
        <div className="mx-auto w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 mb-4 flex-shrink-0" />
        
        {/* Header */}
        <SheetHeader className="px-4 pb-4 flex-shrink-0">
          <SheetTitle className="text-xl font-semibold">Add Bookmark</SheetTitle>
          <SheetDescription id="add-bookmark-description" className="text-sm text-muted-foreground">
            Save a link to read or watch later
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-4">
            {/* URL Input */}
            <div>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10">
                  <Link2 className="h-4 w-4" />
                </div>
                <Input
                  ref={inputRef}
                  type="url"
                  placeholder="Paste or type a URL..."
                  value={url}
                  onChange={handleUrlChange}
                  className={cn(
                    "pl-10 pr-10",
                    "text-base", // Larger text for mobile
                    error && "border-red-500 focus:ring-red-500"
                  )}
                  aria-label="URL input"
                  aria-invalid={!!error}
                  aria-describedby={error ? "url-error" : undefined}
                  autoComplete="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="url"
                />
                {url && (
                  <button
                    onClick={handleClearInput}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 z-10"
                    aria-label="Clear input"
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {error && (
                <p id="url-error" className="mt-2 text-sm text-red-500">
                  {error}
                </p>
              )}
            </div>

            {/* Preview content */}
            {isLoadingPreview && (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-6 w-6" />
                <span className="ml-2 text-sm text-muted-foreground">Loading preview...</span>
              </div>
            )}

            {previewError && !error && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">
                      Failed to load preview
                    </p>
                    <p className="text-xs text-red-500 dark:text-red-500 mt-1">
                      {previewError.message || 'Unable to fetch content from this URL'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => retryPreview()}
                    className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {preview && !isLoadingPreview && (
              <>
                <BookmarkPreview bookmark={preview} />
                
                {/* Notes field */}
                <div className="space-y-2">
                  <label htmlFor="notes" className="text-sm font-medium text-foreground">
                    Add notes (optional)
                  </label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add a note about this bookmark..."
                    className={cn(
                      "w-full rounded-lg border border-gray-200 dark:border-zinc-800",
                      "bg-white dark:bg-zinc-900",
                      "px-3 py-2 text-sm",
                      "placeholder:text-muted-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
                      "resize-none"
                    )}
                    rows={3}
                  />
                </div>
              </>
            )}

            {/* Duplicate warning if applicable */}
            {createBookmark.isError && createBookmark.error?.message.includes('already exists') && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  <p className="font-medium">This bookmark already exists</p>
                  <p className="text-xs mt-1 text-yellow-700 dark:text-yellow-300">
                    {createBookmark.error.message.replace('Bookmark already exists: ', '')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer with save button - Fixed at bottom */}
        {preview && !isLoadingPreview && (
          <SheetFooter className="px-4 pt-2 pb-4 border-t border-gray-200 dark:border-zinc-800 flex-shrink-0">
            <Button
              onClick={handleSaveBookmark}
              disabled={!canSave}
              className="w-full h-12 text-base font-medium"
              size="lg"
            >
              {createBookmark.isPending ? (
                <>
                  <Spinner className="w-4 h-4 mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Bookmark
                </>
              )}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}