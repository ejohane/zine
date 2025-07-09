import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '../components/ui/button'

function BookmarksPage() {
  const { isSignedIn, isLoaded } = useAuth()

  // Show loading while Clerk loads
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Redirect to sign-in if not authenticated
  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Authentication Required</h2>
          <p className="text-gray-600 mb-6">Please sign in to access your bookmarks</p>
          <Link to="/sign-in">
            <Button size="lg">Sign In</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-2">
      <h1 className="text-2xl font-bold">Bookmarks</h1>
      <p className="mt-2">Your saved bookmarks will appear here</p>
    </div>
  )
}

export const Route = createFileRoute('/bookmarks')({
  component: BookmarksPage,
})