import { Link } from '@tanstack/react-router'
import { useBookmarks } from '@/hooks/useBookmarks'
import { BookmarkCard } from './BookmarkCard'
import { Button } from '../ui/button'
import { ArrowRight } from 'lucide-react'

export function QueueList() {
  // Fetch queue bookmarks from D1 database
  const { data: bookmarks, isLoading } = useBookmarks({ status: 'active' })
  const queueBookmarks = bookmarks?.slice(0, 20) || []

  if (isLoading) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Queue</h2>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-full h-24 rounded-lg bg-gray-200 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!queueBookmarks || queueBookmarks.length === 0) {
    return null
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Queue</h2>
        <Link to="/bookmarks">
          <Button variant="ghost" size="sm" className="text-sm">
            See all
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {queueBookmarks.map((bookmark) => (
          <BookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            variant="compact"
          />
        ))}
      </div>
    </div>
  )
}