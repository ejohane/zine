import { Play, Headphones, FileText, ExternalLink, Globe, Calendar, Clock, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Bookmark } from '@zine/shared'
import { cn } from '@/lib/utils'

interface BookmarkPreviewProps {
  bookmark: Bookmark
}

export function BookmarkPreview({ bookmark }: BookmarkPreviewProps) {
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
        return 'bg-red-500 text-white border-red-500'
      case 'podcast':
        return 'bg-green-500 text-white border-green-500'
      case 'article':
        return 'bg-blue-500 text-white border-blue-500'
      default:
        return 'bg-gray-500 text-white border-gray-500'
    }
  }

  const getPlatformColor = () => {
    switch (bookmark.source) {
      case 'youtube':
        return 'text-red-600 dark:text-red-500'
      case 'spotify':
        return 'text-green-600 dark:text-green-500'
      case 'twitter':
      case 'x':
        return 'text-blue-500 dark:text-blue-400'
      case 'substack':
        return 'text-orange-600 dark:text-orange-500'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date)
  }

  const extractDomain = (url: string) => {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname.replace('www.', '')
    } catch {
      return ''
    }
  }

  return (
    <div className="space-y-4">
      {/* Main preview card matching homepage style */}
      <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        {/* Thumbnail */}
        {bookmark.thumbnailUrl && (
          <div className="relative aspect-video bg-gray-100 dark:bg-zinc-800">
            <img
              src={bookmark.thumbnailUrl}
              alt={bookmark.title}
              className="w-full h-full object-cover"
            />
            {/* Duration overlay for videos */}
            {bookmark.videoMetadata?.duration && (
              <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs font-medium">
                {formatDuration(bookmark.videoMetadata.duration)}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Content type badge */}
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs font-medium", getContentTypeColor())}>
              <span className="flex items-center gap-1">
                {getContentTypeIcon()}
                {bookmark.contentType?.toUpperCase() || 'LINK'}
              </span>
            </Badge>
            
            {/* Source platform */}
            {bookmark.source && (
              <span className={cn("text-xs font-medium", getPlatformColor())}>
                {bookmark.source.charAt(0).toUpperCase() + bookmark.source.slice(1)}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-foreground line-clamp-2">
            {bookmark.title}
          </h3>

          {/* Description */}
          {bookmark.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {bookmark.description}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {/* Creator */}
            {bookmark.creator?.name && (
              <div className="flex items-center gap-1">
                <User className="w-3 h-3" />
                <span>{bookmark.creator.name}</span>
              </div>
            )}

            {/* Published date */}
            {bookmark.publishedAt && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>{formatDate(new Date(bookmark.publishedAt))}</span>
              </div>
            )}

            {/* Reading time for articles */}
            {bookmark.articleMetadata?.readingTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{bookmark.articleMetadata.readingTime} min read</span>
              </div>
            )}

            {/* Podcast duration */}
            {bookmark.podcastMetadata?.duration && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{formatDuration(bookmark.podcastMetadata.duration)}</span>
              </div>
            )}
          </div>

          {/* URL/Domain */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-2 border-t border-gray-100 dark:border-zinc-800">
            <Globe className="w-3 h-3" />
            <span className="truncate">{extractDomain(bookmark.url)}</span>
          </div>
        </div>
      </div>

      {/* Additional metadata if available */}
      {(bookmark.videoMetadata?.viewCount || bookmark.articleMetadata?.wordCount) && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {bookmark.videoMetadata?.viewCount && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-zinc-800">
              <span className="text-muted-foreground">Views</span>
              <span className="font-medium">
                {new Intl.NumberFormat('en-US', { notation: 'compact' }).format(bookmark.videoMetadata.viewCount)}
              </span>
            </div>
          )}
          {bookmark.articleMetadata?.wordCount && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-zinc-800">
              <span className="text-muted-foreground">Words</span>
              <span className="font-medium">
                {new Intl.NumberFormat('en-US').format(bookmark.articleMetadata.wordCount)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}