import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui/button'
import { QuickActions } from '../components/home/QuickActions'
import { RecentCarousel } from '../components/home/RecentCarousel'
import { QueueList } from '../components/home/QueueList'


function Home() {
  const { isAuthenticated } = useAuth()

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


  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Greeting Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{greeting()}</h1>
          <p className="text-muted-foreground">
            Welcome back to your personalized content hub
          </p>
        </div>

        {/* Quick Actions */}
        <section className="mb-10">
          <QuickActions />
        </section>

        {/* Recent Carousel */}
        <section className="mb-10">
          <RecentCarousel />
        </section>

        {/* Queue Section */}
        <section>
          <QueueList />
        </section>
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