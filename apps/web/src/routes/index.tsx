import { createFileRoute, Link, useSearch } from '@tanstack/react-router'
import { useBookmarks } from '../hooks/useBookmarks'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import type { Bookmark } from '../lib/api'

interface HomeSearchParams {
  saved?: string
  message?: string
}

function Home() {
  const { isAuthenticated } = useAuth()
  const { data: bookmarks, isLoading, error } = useBookmarks()
  const { saved, message } = useSearch({ from: '/' }) as HomeSearchParams

  // Show welcome screen for unauthenticated users
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Welcome to Zine</h1>
          <p className="mb-8">Please sign in to access your bookmarks</p>
          <div className="space-x-4">
            <Link 
              to="/sign-in"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Sign In
            </Link>
            <Link 
              to="/sign-up"
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading your bookmarks...</p>
      </div>
    </div>
  )
  
  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-600 mb-4">Error loading bookmarks: {error.message}</p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    </div>
  )

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const renderBookmarkCard = (bookmark: Bookmark) => (
    <Card key={bookmark.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex gap-4">
          {/* Thumbnail */}
          {bookmark.thumbnailUrl && (
            <div className="flex-shrink-0">
              <img
                src={bookmark.thumbnailUrl}
                alt="Thumbnail"
                className="w-16 h-16 object-cover rounded-md border"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg line-clamp-2 mb-2">
              <a 
                href={bookmark.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-blue-600 transition-colors"
              >
                {bookmark.title}
              </a>
            </h3>
            
            {bookmark.description && (
              <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                {bookmark.description}
              </p>
            )}

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-3">
              {bookmark.source && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {bookmark.source}
                </span>
              )}
              {bookmark.contentType && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {bookmark.contentType}
                </span>
              )}
            </div>

            {/* Creator and metadata */}
            <div className="space-y-1 text-sm text-gray-600">
              {bookmark.creator && (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4">👤</span>
                  <span>{bookmark.creator.name}</span>
                  {bookmark.creator.handle && (
                    <span className="text-gray-500">{bookmark.creator.handle}</span>
                  )}
                </div>
              )}

              {bookmark.videoMetadata?.duration && (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4">📹</span>
                  <span>Duration: {formatDuration(bookmark.videoMetadata.duration)}</span>
                </div>
              )}

              {bookmark.podcastMetadata?.episodeTitle && (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4">🎧</span>
                  <span>{bookmark.podcastMetadata.episodeTitle}</span>
                </div>
              )}

              {bookmark.articleMetadata?.wordCount && (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4">📰</span>
                  <span>{bookmark.articleMetadata.wordCount} words</span>
                  {bookmark.articleMetadata.readingTime && (
                    <span className="text-gray-500">({bookmark.articleMetadata.readingTime} min read)</span>
                  )}
                </div>
              )}

              {bookmark.publishedAt && (
                <div className="flex items-center gap-2 text-gray-500">
                  <span className="w-4 h-4">📅</span>
                  <span>{new Date(bookmark.publishedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {/* Notes */}
            {bookmark.notes && (
              <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                <strong>Notes:</strong> {bookmark.notes}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Success Message */}
      {saved && message && (
        <div className="bg-green-50 border border-green-200 px-4 py-3 mb-4">
          <div className="flex items-center gap-2 text-green-700">
            <span className="w-5 h-5">✅</span>
            <span>{message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Zine</h1>
              <p className="text-lg text-gray-600 mt-1">Your intelligent bookmark manager</p>
            </div>
            <Link to="/save">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                <span className="w-5 h-5 mr-2">🔖</span>
                Save Bookmark
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl">{bookmarks?.length || 0}</CardTitle>
                <CardDescription>Total Bookmarks</CardDescription>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl">
                  {bookmarks?.filter(b => b.source && b.source !== 'web').length || 0}
                </CardTitle>
                <CardDescription>Platform-Specific</CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl">
                  {new Set(bookmarks?.map(b => b.creator?.name).filter(Boolean)).size || 0}
                </CardTitle>
                <CardDescription>Unique Creators</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Bookmarks */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-900">Recent Bookmarks</h2>
            {bookmarks && bookmarks.length > 0 && (
              <Link to="/save">
                <Button variant="outline">
                  <span className="w-4 h-4 mr-2">➕</span>
                  Add Another
                </Button>
              </Link>
            )}
          </div>

          {bookmarks && bookmarks.length > 0 ? (
            <div className="space-y-4">
              {bookmarks.map(renderBookmarkCard)}
            </div>
          ) : (
            <Card className="text-center py-12">
              <CardContent>
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">🔖</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No bookmarks yet
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Start building your collection by saving your first bookmark
                    </p>
                    <Link to="/save">
                      <Button size="lg">
                        <span className="w-5 h-5 mr-2">🚀</span>
                        Save Your First Bookmark
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: Home,
  beforeLoad: async () => {
    // Note: This is a placeholder. In a real app, we'd need to check auth status
    // For now, we'll rely on the Clerk components to handle the redirect
    return {}
  },
  validateSearch: (search: Record<string, unknown>): HomeSearchParams => {
    return {
      saved: typeof search.saved === 'string' ? search.saved : undefined,
      message: typeof search.message === 'string' ? search.message : undefined,
    }
  },
})