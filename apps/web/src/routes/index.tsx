import { createFileRoute, Link } from '@tanstack/react-router'
import { useBookmarks } from '../hooks/useBookmarks'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui/button'
import { BookmarkSectionSkeleton } from '../components/home/BookmarkSkeleton'
import { FilterTabs } from '../components/home/FilterTabs'
import { ContentGrid } from '../components/home/ContentGrid'
import { SectionHeader } from '../components/home/SectionHeader'
import { Plus, User } from 'lucide-react'
import { useState } from 'react'


function Home() {
  const { isAuthenticated } = useAuth()
  const { data: bookmarks, isLoading, error } = useBookmarks()
  const [activeFilter, setActiveFilter] = useState('All')

  // Show welcome screen for unauthenticated users
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-5xl font-bold mb-4 text-foreground">Welcome to Zine</h1>
            <p className="text-xl text-muted-foreground">Your intelligent bookmark manager with a modern twist</p>
          </div>
          <div className="space-y-4">
            <Link to="/sign-in" className="block">
              <Button size="lg" className="w-full bg-spotify-green hover:bg-spotify-green-hover text-white">
                Sign In
              </Button>
            </Link>
            <Link to="/sign-up" className="block">
              <Button size="lg" variant="outline" className="w-full">
                Create Account
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) return (
    <div className="min-h-screen bg-background p-4">
      <div className="animate-pulse">
        <div className="h-10 bg-secondary rounded w-64 mb-2" />
        <div className="h-6 bg-secondary rounded w-96 mb-8" />
      </div>
      <BookmarkSectionSkeleton />
      <BookmarkSectionSkeleton />
    </div>
  )
  
  if (error) return (
    <div className="min-h-screen bg-background p-4">
      <div className="text-center py-12">
        <p className="text-destructive mb-4">Error loading bookmarks: {error.message}</p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    </div>
  )

  // Organize bookmarks by categories
  const recentBookmarks = bookmarks?.slice(0, 8) || []
  const podcastBookmarks = bookmarks?.filter(b => b.contentType === 'podcast') || []

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* User Profile Header */}
      <div className="flex items-center justify-between p-4 pt-12">
        <div className="w-10 h-10 rounded-full bg-spotify-green flex items-center justify-center">
          <User className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 mb-6">
        <FilterTabs activeFilter={activeFilter} onFilterChange={setActiveFilter} />
      </div>

      {/* Content Grid */}
      <div className="px-4 space-y-6 pb-28">
        {bookmarks && bookmarks.length > 0 ? (
          <>
            {/* Your Episodes Section */}
            <ContentGrid
              title="Your Episodes"
              items={recentBookmarks.slice(0, 2)}
              type="episodes"
            />

            {/* Picked for you Section */}
            <div>
              <SectionHeader title="Picked for you" />
              <div className="space-y-4">
                {recentBookmarks.slice(0, 1).map((bookmark) => (
                  <div key={bookmark.id} className="bg-surface rounded-lg p-4 flex items-center space-x-4">
                    <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                      <span className="text-xs font-medium">IMG</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-spotify-green mb-1">Included in Premium</div>
                      <h3 className="font-semibold text-foreground line-clamp-2">{bookmark.title}</h3>
                      <p className="text-sm text-muted-foreground">{bookmark.url}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="ghost" className="w-8 h-8 p-0">
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button size="sm" className="w-8 h-8 p-0 rounded-full bg-white text-black hover:bg-gray-200">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Your shows Section */}
            <div>
              <SectionHeader title="Your shows" />
              <div className="grid grid-cols-1 gap-4">
                {podcastBookmarks.slice(0, 3).map((bookmark) => (
                  <div key={bookmark.id} className="relative">
                    <div className="w-full aspect-video bg-surface rounded-lg flex items-center justify-center relative overflow-hidden">
                      <span className="text-xs font-medium text-muted-foreground">PODCAST</span>
                      <div className="absolute top-2 left-2">
                        <div className="bg-black/80 text-white px-2 py-1 rounded text-xs font-medium">
                          A SPOTIFY VIDEO PODCAST
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <h3 className="font-semibold text-foreground">{bookmark.title}</h3>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-24 h-24 mb-6 rounded-full bg-card flex items-center justify-center">
              <Plus className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-semibold mb-2 text-foreground">No content yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              Start building your collection by saving your first bookmark. We'll organize everything for you.
            </p>
            <Link to="/save">
              <Button size="lg" className="bg-spotify-green hover:bg-spotify-green-hover text-white">
                <Plus className="w-5 h-5 mr-2" />
                Save Your First Bookmark
              </Button>
            </Link>
          </div>
        )}
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
})