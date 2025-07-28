import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../components/ui/button'
import { SaveBookmarkForm } from '../components/SaveBookmarkForm'
import { BrowserExtensionBanner } from '../components/BrowserExtensionBanner'
import { BulkImportDialog } from '../components/BulkImportDialog'
import type { Bookmark } from '../lib/api'

interface SaveSearchParams {
  url?: string
}

function SavePage() {
  const navigate = useNavigate()
  const { url } = useSearch({ from: '/save' }) as SaveSearchParams
  const [currentUrl, setCurrentUrl] = useState(url || '')
  const [showBulkImport, setShowBulkImport] = useState(false)

  const handleSaveSuccess = (bookmark: Bookmark) => {
    // Navigate back to home with success message
    navigate({ 
      to: '/', 
      search: { 
        saved: bookmark.id,
        message: `Successfully saved: ${bookmark.title}` 
      } 
    })
  }

  const handleBulkImportSuccess = (bookmarks: Bookmark[]) => {
    setShowBulkImport(false)
    // Navigate back to home with success message
    navigate({ 
      to: '/', 
      search: { 
        message: `Successfully imported ${bookmarks.length} bookmarks` 
      } 
    })
  }

  const handleCancel = () => {
    navigate({ to: '/' })
  }

  const handleUrlFromExtension = (newUrl: string) => {
    setCurrentUrl(newUrl)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900">Save New Bookmark</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkImport(true)}
              className="hidden sm:flex items-center gap-2"
            >
              <span className="w-4 h-4">📥</span>
              Bulk Import
            </Button>
          </div>
          <p className="text-base sm:text-lg text-gray-600 mb-4">
            Add any URL to your bookmark collection with automatic metadata extraction
          </p>
          {/* Mobile bulk import button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBulkImport(true)}
            className="sm:hidden"
          >
            <span className="w-4 h-4 mr-2">📥</span>
            Bulk Import
          </Button>
        </div>

        {/* Browser Extension Banner */}
        <BrowserExtensionBanner 
          onUrlFromExtension={handleUrlFromExtension}
          className="mb-6"
        />

        {/* Save Form */}
        <SaveBookmarkForm
          initialUrl={currentUrl}
          onSuccess={handleSaveSuccess}
          onCancel={handleCancel}
        />

        {/* Help Text */}
        <div className="mt-8 sm:mt-12 max-w-2xl mx-auto">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 sm:p-6">
            <h3 className="font-semibold text-blue-900 mb-2">✨ Enhanced Metadata Extraction</h3>
            <div className="text-sm text-blue-800 space-y-2">
              <p>Zine automatically extracts rich metadata from your bookmarks:</p>
              <ul className="list-disc list-inside space-y-1 ml-2 sm:ml-4">
                <li><strong>YouTube</strong>: Video titles, creators, thumbnails, and duration</li>
                <li><strong>Spotify</strong>: Podcast episodes, music tracks, and artist information</li>
                <li><strong>Twitter/X</strong>: Tweet content, author details, and social context</li>
                <li><strong>Substack</strong>: Article titles, authors, and reading time estimates</li>
                <li><strong>Web Articles</strong>: Open Graph data, JSON-LD, and content analysis</li>
              </ul>
              <p className="mt-3">
                <strong>Smart Features:</strong> Duplicate detection, creator normalization, 
                and automatic content classification.
              </p>
            </div>
          </div>
        </div>

        {/* Bulk Import Dialog */}
        <BulkImportDialog
          isOpen={showBulkImport}
          onClose={() => setShowBulkImport(false)}
          onSuccess={handleBulkImportSuccess}
        />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/save')({
  component: SavePage,
  validateSearch: (search: Record<string, unknown>): SaveSearchParams => {
    return {
      url: typeof search.url === 'string' ? search.url : undefined,
    }
  },
})