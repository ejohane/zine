import { ExternalLink, Clock, User, Calendar, Play, Headphones, FileText } from 'lucide-react'
import type { Bookmark } from '../../lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '../ui/badge'

interface BookmarkCardProps {
  bookmark: Bookmark
  variant?: 'default' | 'carousel' | 'compact'
  onClick?: (bookmark: Bookmark) => void
}

export function BookmarkCard({ bookmark, variant = 'default', onClick }: BookmarkCardProps) {
  // Debug logging
  console.log('BookmarkCard received:', bookmark)
  
  // Check if title looks like an ID (only alphanumeric, no spaces)
  const titleLooksLikeId = bookmark.title && /^[a-zA-Z0-9]+$/.test(bookmark.title) && bookmark.title.length > 15
  const displayTitle = titleLooksLikeId ? (bookmark.description || bookmark.url || 'Untitled Bookmark') : (bookmark.title || 'Untitled Bookmark')
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

  const getContentTypeIcon = () => {
    switch (bookmark.contentType) {
      case 'video':
        return <Play className="w-4 h-4" />
      case 'podcast':
        return <Headphones className="w-4 h-4" />
      case 'article':
        return <FileText className="w-4 h-4" />
      default:
        return <ExternalLink className="w-4 h-4" />
    }
  }

  const getContentTypeColor = () => {
    switch (bookmark.contentType) {
      case 'video':
        return 'bg-video-orange text-white'
      case 'podcast':
        return 'bg-podcast-pink text-white'
      case 'article':
        return 'bg-article-blue text-white'
      default:
        return 'bg-gray-600 text-white'
    }
  }

  const getContentTypeGradient = () => {
    switch (bookmark.contentType) {
      case 'video':
        return 'from-orange-500 to-orange-400'
      case 'podcast':
        return 'from-pink-500 to-pink-400'
      case 'article':
        return 'from-blue-500 to-blue-400'
      default:
        return 'from-gray-600 to-gray-500'
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onClick) {
      onClick(bookmark)
    } else {
      window.open(bookmark.url, '_blank')
    }
  }

  // Carousel variant - rich media card
  if (variant === 'carousel') {
    return (
      <div 
        className="group relative bg-white dark:bg-zinc-900 rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 cursor-pointer overflow-hidden"
        onClick={handleClick}
      >
        {/* Thumbnail with gradient overlay */}
        <div className="relative aspect-video">
          {bookmark.thumbnailUrl ? (
            <>
              <img
                src={bookmark.thumbnailUrl}
                alt={displayTitle}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className={cn(
                "absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"
              )} />
            </>
          ) : (
            <div className={cn(
              "w-full h-full bg-gradient-to-br flex items-center justify-center",
              getContentTypeGradient()
            )}>
              <div className="text-white opacity-80">
                {getContentTypeIcon()}
              </div>
            </div>
          )}
          
          {/* Content type badge */}
          <div className="absolute top-2 right-2">
            <Badge className={cn("text-xs", getContentTypeColor())}>
              {bookmark.contentType?.toUpperCase() || 'WEB'}
            </Badge>
          </div>

          {/* Duration/Reading time */}
          {(bookmark.videoMetadata?.duration || bookmark.articleMetadata?.readingTime) && (
            <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs">
              {bookmark.videoMetadata?.duration 
                ? formatDuration(bookmark.videoMetadata.duration)
                : `${bookmark.articleMetadata?.readingTime} min`}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-sm line-clamp-2 mb-1 text-foreground">
            {displayTitle}
          </h3>
          {bookmark.creator && (
            <div className="flex items-center gap-2">
              {bookmark.creator.avatarUrl && (
                <img 
                  src={bookmark.creator.avatarUrl} 
                  alt={bookmark.creator.name}
                  className="w-5 h-5 rounded-full object-cover"
                />
              )}
              <p className="text-xs text-muted-foreground">
                {bookmark.creator.name}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Compact variant - minimal list item
  if (variant === 'compact') {
    return (
      <div 
        className="group flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
        onClick={handleClick}
      >
        {/* Small thumbnail */}
        {bookmark.thumbnailUrl ? (
          <img
            src={bookmark.thumbnailUrl}
            alt=""
            className="w-16 h-16 rounded object-cover flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className={cn(
            "w-16 h-16 rounded bg-gradient-to-br flex items-center justify-center flex-shrink-0",
            getContentTypeGradient()
          )}>
            <div className="text-white opacity-80">
              {getContentTypeIcon()}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm line-clamp-1 mb-1">
            {displayTitle}
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {bookmark.creator && (
              <>
                {bookmark.creator.avatarUrl && (
                  <img 
                    src={bookmark.creator.avatarUrl} 
                    alt={bookmark.creator.name}
                    className="w-4 h-4 rounded-full object-cover"
                  />
                )}
                <span>{bookmark.creator.name}</span>
              </>
            )}
            {bookmark.source && (
              <>
                <span>•</span>
                <span>{bookmark.source}</span>
              </>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {bookmark.contentType || 'web'}
          </Badge>
        </div>
      </div>
    )
  }

  // Default variant - existing full card
  return (
    <div className="group relative bg-card hover:bg-surface-hover rounded-lg transition-all duration-200 cursor-pointer overflow-hidden">
      <a 
        href={bookmark.url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="block p-4"
        onClick={onClick ? (e) => { e.preventDefault(); onClick(bookmark) } : undefined}
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
              {displayTitle}
            </h3>
            
            {bookmark.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {bookmark.description}
              </p>
            )}

            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {bookmark.creator && (
                <div className="flex items-center gap-1.5">
                  {bookmark.creator.avatarUrl ? (
                    <img 
                      src={bookmark.creator.avatarUrl} 
                      alt={bookmark.creator.name}
                      className="w-4 h-4 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-3 h-3" />
                  )}
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