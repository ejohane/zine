import { createFileRoute } from '@tanstack/react-router'
import { UserProfile } from '@clerk/clerk-react'
import { PageWrapper } from '../components/layout/PageWrapper'
import { useAuth } from '../lib/auth'
import { useBookmarks } from '../hooks/useBookmarks'
import { useTheme } from '../hooks/useTheme'
import { User, Settings, Palette, BookOpen, Clock, Tag, LogOut } from 'lucide-react'
import { motion } from 'framer-motion'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  const { user, signOut } = useAuth()
  const { data: bookmarks, isLoading: bookmarksLoading } = useBookmarks()
  const { theme, setTheme } = useTheme()

  // Calculate user statistics
  const stats = {
    totalBookmarks: bookmarks?.length || 0,
    videoCount: bookmarks?.filter(b => b.contentType === 'video').length || 0,
    articleCount: bookmarks?.filter(b => b.contentType === 'article').length || 0,
    podcastCount: bookmarks?.filter(b => b.contentType === 'podcast').length || 0,
    savedToday: bookmarks?.filter(b => {
      const createdDate = new Date(b.createdAt)
      const today = new Date()
      return createdDate.toDateString() === today.toDateString()
    }).length || 0,
    uniqueSources: new Set(bookmarks?.map(b => b.source) || []).size,
  }

  const userName = user?.firstName || user?.username || 'User'
  const userEmail = user?.primaryEmailAddress?.emailAddress || ''
  const userAvatar = user?.imageUrl

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto">
        {/* Profile Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-6 mb-8">
            <div className="relative">
              {userAvatar ? (
                <img 
                  src={userAvatar} 
                  alt={userName}
                  className="w-24 h-24 rounded-full object-cover ring-4 ring-spotify-green/20"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-spotify-green flex items-center justify-center">
                  <User className="w-12 h-12 text-black" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground mb-1">{userName}</h1>
              <p className="text-muted-foreground">{userEmail}</p>
            </div>
          </div>
        </motion.div>

        {/* User Statistics */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Your Library Stats
          </h2>
          {bookmarksLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-surface rounded-lg p-4 animate-pulse">
                  <div className="h-8 bg-surface-hover rounded mb-2"></div>
                  <div className="h-4 bg-surface-hover rounded w-2/3"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-surface hover:bg-surface-hover rounded-lg p-4 transition-colors cursor-default"
              >
                <p className="text-2xl font-bold text-spotify-green">{stats.totalBookmarks}</p>
                <p className="text-sm text-muted-foreground">Total Bookmarks</p>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-surface hover:bg-surface-hover rounded-lg p-4 transition-colors cursor-default"
              >
                <p className="text-2xl font-bold text-foreground">{stats.videoCount}</p>
                <p className="text-sm text-muted-foreground">Videos</p>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-surface hover:bg-surface-hover rounded-lg p-4 transition-colors cursor-default"
              >
                <p className="text-2xl font-bold text-foreground">{stats.articleCount}</p>
                <p className="text-sm text-muted-foreground">Articles</p>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-surface hover:bg-surface-hover rounded-lg p-4 transition-colors cursor-default"
              >
                <p className="text-2xl font-bold text-foreground">{stats.podcastCount}</p>
                <p className="text-sm text-muted-foreground">Podcasts</p>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-surface hover:bg-surface-hover rounded-lg p-4 transition-colors cursor-default"
              >
                <p className="text-2xl font-bold text-foreground">{stats.savedToday}</p>
                <p className="text-sm text-muted-foreground">Saved Today</p>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-surface hover:bg-surface-hover rounded-lg p-4 transition-colors cursor-default"
              >
                <p className="text-2xl font-bold text-foreground">{stats.uniqueSources}</p>
                <p className="text-sm text-muted-foreground">Unique Sources</p>
              </motion.div>
            </div>
          )}
        </motion.div>

        {/* Theme Settings */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Appearance
          </h2>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-sm text-muted-foreground mb-4">Choose how Zine looks to you</p>
            <div className="grid grid-cols-3 gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setTheme('light')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  theme === 'light' 
                    ? 'border-spotify-green bg-spotify-green/10' 
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <div className="w-full h-20 bg-white rounded-md mb-2 flex items-center justify-center">
                  <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                </div>
                <p className="text-sm font-medium">Light</p>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setTheme('dark')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  theme === 'dark' 
                    ? 'border-spotify-green bg-spotify-green/10' 
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <div className="w-full h-20 bg-gray-900 rounded-md mb-2 flex items-center justify-center">
                  <div className="w-12 h-12 bg-gray-700 rounded-full"></div>
                </div>
                <p className="text-sm font-medium">Dark</p>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setTheme('system')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  theme === 'system' 
                    ? 'border-spotify-green bg-spotify-green/10' 
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <div className="w-full h-20 rounded-md mb-2 overflow-hidden flex">
                  <div className="w-1/2 bg-white flex items-center justify-center">
                    <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                  </div>
                  <div className="w-1/2 bg-gray-900 flex items-center justify-center">
                    <div className="w-8 h-8 bg-gray-700 rounded-full"></div>
                  </div>
                </div>
                <p className="text-sm font-medium">System</p>
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Account Settings */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Account Settings
          </h2>
          <div className="bg-surface rounded-lg overflow-hidden">
            <UserProfile 
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "shadow-none border-0 bg-transparent",
                  navbar: "hidden",
                  pageScrollBox: "p-0",
                  page: "gap-4",
                  profileSection: "bg-background rounded-lg p-6 border border-border",
                  formButtonPrimary: "bg-spotify-green hover:bg-spotify-green/90 text-black",
                  profileSectionContent: "gap-4",
                }
              }}
            />
          </div>
        </motion.div>

        {/* Sign Out */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSignOut}
            className="w-full bg-surface hover:bg-surface-hover rounded-lg p-4 flex items-center justify-between transition-colors group"
          >
            <div className="flex items-center gap-3">
              <LogOut className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="font-medium">Sign Out</span>
            </div>
            <span className="text-sm text-muted-foreground">See you soon!</span>
          </motion.button>
        </motion.div>
      </div>
    </PageWrapper>
  )
}