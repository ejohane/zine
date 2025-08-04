import { ExternalLink, Clock, User, Calendar } from 'lucide-react'
import type { Bookmark } from '../../lib/api'

interface BookmarkCardProps {
  bookmark: Bookmark
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const formatDate = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - d.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return d.toLocaleDateString('en-US')
  }

  return (
    <div className="group relative bg-card hover:bg-surface-hover rounded-lg transition-all duration-200 cursor-pointer overflow-hidden">
      <a 
        href={bookmark.url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="block p-4"
      >
        <div className="flex gap-4">
          {/* Thumbnail */}
          {bookmark.thumbnailUrl ? (
            <div className="relative flex-shrink-0 w-24 h-24 md:w-32 md:h-32 rounded-md overflow-hidden bg-secondary">
              <img
                src={bookmark.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
              />
              {/* Play button overlay for videos/podcasts */}
              {(bookmark.contentType === 'video' || bookmark.contentType === 'podcast') && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-black ml-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-shrink-0 w-24 h-24 md:w-32 md:h-32 rounded-md bg-secondary flex items-center justify-center">
              <ExternalLink className="w-8 h-8 text-muted-foreground" />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base md:text-lg line-clamp-2 mb-1 text-card-foreground group-hover:text-spotify-green transition-colors">
              {bookmark.title}
            </h3>
            
            {bookmark.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {bookmark.description}
              </p>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {bookmark.creator?.name && (
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  <span>{bookmark.creator.name}</span>
                </div>
              )}
              
              {bookmark.videoMetadata?.duration && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{formatDuration(bookmark.videoMetadata.duration)}</span>
                </div>
              )}
              
              {bookmark.articleMetadata?.readingTime && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{bookmark.articleMetadata.readingTime} min read</span>
                </div>
              )}
              
              {bookmark.publishedAt && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(new Date(bookmark.publishedAt).toISOString())}</span>
                </div>
              )}
            </div>

            {/* Source badge */}
            {bookmark.source && (
              <div className="mt-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                  {bookmark.source}
                </span>
              </div>
            )}
          </div>
        </div>
      </a>
    </div>
  )
}