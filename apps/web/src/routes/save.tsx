import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { PageWrapper } from '../components/layout/PageWrapper'
import { SaveBookmarkInput } from '../components/save/SaveBookmarkInput'
import { BookmarkPreview } from '../components/save/BookmarkPreview'
import { useSaveBookmark } from '../hooks/useSaveBookmark'

function SavePage() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const { preview, saveBookmark, isLoading, isSaving, error, updateUrl, retry } = useSaveBookmark()

  // Update the hook when URL changes
  useEffect(() => {
    updateUrl(url)
  }, [url, updateUrl])

  const handleSave = async () => {
    const result = await saveBookmark(url)
    if (result) {
      navigate({ 
        to: '/', 
        search: { 
          saved: result.id,
          message: `Successfully saved: ${result.title}` 
        } 
      })
    }
  }

  const handleCancel = () => {
    navigate({ to: '/' })
  }

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-6">Save Bookmark</h1>
          
          {/* URL Input */}
          <SaveBookmarkInput
            value={url}
            onChange={setUrl}
            onClear={() => setUrl('')}
            placeholder="Enter URL to save..."
          />
        </div>

        {/* Main Content */}
        <main className="flex-1">
          {/* Bookmark Preview */}
          {(preview || isLoading || error) && (
            <BookmarkPreview
              preview={preview}
              isLoading={isLoading}
              error={error}
              onRetry={() => retry(url)}
            />
          )}

          {/* Action Buttons */}
          {preview && (
            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={handleCancel}
                className="px-6 py-2 bg-surface hover:bg-surface-hover rounded-full text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-spotify-green text-black hover:bg-spotify-green-dark rounded-full text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Bookmark'}
              </button>
            </div>
          )}
        </main>
      </div>
    </PageWrapper>
  )
}

export const Route = createFileRoute('/save')({
  component: SavePage,
})