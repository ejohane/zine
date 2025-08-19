import { Play, Headphones, FileText, Link2, BookOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ContentType } from '@zine/shared'

interface ContentTypeBadgeProps {
  contentType?: ContentType | null
  className?: string
  showIcon?: boolean
}

export function ContentTypeBadge({ contentType, className, showIcon = true }: ContentTypeBadgeProps) {
  const getIcon = () => {
    switch (contentType) {
      case 'video':
        return <Play className="w-3 h-3" />
      case 'podcast':
        return <Headphones className="w-3 h-3" />
      case 'article':
        return <FileText className="w-3 h-3" />
      case 'post':
        return <BookOpen className="w-3 h-3" />
      default:
        return <Link2 className="w-3 h-3" />
    }
  }

  const getColorClass = () => {
    switch (contentType) {
      case 'video':
        return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800'
      case 'podcast':
        return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800'
      case 'article':
        return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800'
      case 'post':
        return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
    }
  }

  const label = contentType ? contentType.toUpperCase() : 'LINK'

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs font-medium",
        getColorClass(),
        className
      )}
    >
      <span className="flex items-center gap-1">
        {showIcon && getIcon()}
        {label}
      </span>
    </Badge>
  )
}