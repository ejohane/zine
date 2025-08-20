import { RefreshCw } from 'lucide-react'
import type { Bookmark } from '../../lib/api'

interface BookmarkPreviewProps {
  preview: Bookmark | null
  isLoading: boolean
  error: string | null
  onRetry?: () => void
}

export function BookmarkPreview({ preview, isLoading, error, onRetry }: BookmarkPreviewProps) {
  if (isLoading) {
    return (
      <div className="p-6 bg-surface rounded-lg">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-spotify-green"></div>
          <span className="ml-3 text-muted-foreground">Extracting metadata...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-surface rounded-lg">
        <div className="text-center py-8">
          <p className="text-red-500 font-medium mb-2">Preview failed</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-4 py-2 bg-surface-hover hover:bg-surface rounded-full text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!preview) return null

  return (
    <div className="p-6 bg-surface rounded-lg">
      <div className="flex gap-4">
        {/* Thumbnail */}
        {preview.thumbnailUrl && (
          <div className="flex-shrink-0">
            <img
              src={preview.thumbnailUrl}
              alt=""
              className="w-24 h-24 object-cover rounded-lg"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg mb-2 line-clamp-2">
            {preview.title}
          </h3>
          
          {preview.description && (
            <p className="text-muted-foreground text-sm mb-3 line-clamp-3">
              {preview.description}
            </p>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap gap-2 text-xs">
            {preview.source && (
              <span className="px-2 py-1 bg-surface-hover rounded-full">
                {preview.source}
              </span>
            )}
            {preview.contentType && (
              <span className="px-2 py-1 bg-surface-hover rounded-full">
                {preview.contentType}
              </span>
            )}
            {preview.creator?.name && (
              <span className="px-2 py-1 bg-surface-hover rounded-full">
                {preview.creator.name}
              </span>
            )}
            {preview.publishedAt && (
              <span className="px-2 py-1 bg-surface-hover rounded-full">
                {new Date(preview.publishedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}