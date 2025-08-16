import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BookmarkCard } from './BookmarkCard'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useBookmarks } from '@/hooks/useBookmarks'
import type { Bookmark } from '@zine/shared'

export function RecentCarousel() {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Fetch recent bookmarks (will be replaced with DO endpoint)
  // TODO: Replace with DO endpoint /api/v1/user-state/recent
  const { data: bookmarks, isLoading } = useBookmarks({ status: 'active' })
  const recentBookmarks = bookmarks?.slice(0, 10) || []
  
  // Debug logging
  console.log('Recent bookmarks data:', recentBookmarks)

  // Mark bookmark as opened
  const markAsOpened = useMutation({
    mutationFn: async (bookmarkId: string) => {
      // TODO: Replace with DO endpoint /api/v1/user-state/bookmark-opened
      // For now, we'll just return success until backend endpoint is ready
      console.log('Marking bookmark as opened:', bookmarkId)
      return Promise.resolve({ success: true })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
    }
  })

  const handleBookmarkClick = (bookmark: Bookmark) => {
    markAsOpened.mutate(bookmark.id)
    window.open(bookmark.url, '_blank')
  }

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -300,
        behavior: 'smooth'
      })
    }
  }

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 300,
        behavior: 'smooth'
      })
    }
  }

  if (isLoading) {
    return (
      <div className="relative">
        <h2 className="text-xl font-semibold mb-4 text-foreground">Recent</h2>
        <div className="flex gap-4 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[280px]">
              <div className="w-full h-[200px] rounded-lg bg-gray-200 dark:bg-zinc-800 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!recentBookmarks || recentBookmarks.length === 0) {
    return null
  }

  return (
    <div className="relative group">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">Recent</h2>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={scrollLeft}
            className="p-1 rounded-full bg-white dark:bg-zinc-800 shadow-md hover:shadow-lg transition-shadow"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <button
            onClick={scrollRight}
            className="p-1 rounded-full bg-white dark:bg-zinc-800 shadow-md hover:shadow-lg transition-shadow"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5 text-foreground" />
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className={cn(
          "flex gap-4 overflow-x-auto scrollbar-hide",
          "snap-x snap-mandatory",
          "-mx-4 px-4 md:mx-0 md:px-0"
        )}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {recentBookmarks.map((bookmark) => (
          <div
            key={bookmark.id}
            className="flex-shrink-0 w-[280px] snap-start"
            onClick={() => handleBookmarkClick(bookmark)}
          >
            <BookmarkCard bookmark={bookmark} variant="carousel" />
          </div>
        ))}
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}