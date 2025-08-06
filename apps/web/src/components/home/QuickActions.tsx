import { Link } from '@tanstack/react-router'
import { Button } from '../ui/button'
import { Bookmark, Upload, Rss, Search } from 'lucide-react'

export function QuickActions() {
  const actions = [
    {
      icon: Bookmark,
      label: 'Save Bookmark',
      description: 'Add a new bookmark',
      to: '/save',
      color: 'bg-spotify-green hover:bg-spotify-green-hover text-white'
    },
    {
      icon: Upload,
      label: 'Bulk Import',
      description: 'Import multiple bookmarks',
      to: '/bookmarks',
      color: 'bg-card hover:bg-surface-hover text-card-foreground'
    },
    {
      icon: Rss,
      label: 'Browse Feed',
      description: 'Discover new content',
      to: '/feed',
      color: 'bg-card hover:bg-surface-hover text-card-foreground'
    },
    {
      icon: Search,
      label: 'Search',
      description: 'Find bookmarks',
      to: '/search',
      color: 'bg-card hover:bg-surface-hover text-card-foreground'
    }
  ]

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4 text-foreground">Quick Actions</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link key={action.to} to={action.to}>
              <Button
                variant="ghost"
                className={`h-auto p-4 flex flex-col items-center gap-2 ${action.color} border border-border transition-all duration-200`}
              >
                <Icon className="w-6 h-6" />
                <div className="text-center">
                  <div className="font-medium">{action.label}</div>
                  <div className="text-xs opacity-70">{action.description}</div>
                </div>
              </Button>
            </Link>
          )
        })}
      </div>
    </div>
  )
}