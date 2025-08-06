import { Link, useLocation } from '@tanstack/react-router'
import { Home, Search, LibraryBig, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'

export function MobileNav() {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/search', label: 'Search', icon: Search },
    { path: '/bookmarks', label: 'Your Library', icon: LibraryBig },
    { path: '/save', label: 'Create', icon: Plus },
  ]

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-20 px-4">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path || (path === '/bookmarks' && location.pathname.startsWith('/bookmarks'))
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-all duration-200 min-w-0 flex-1',
                'hover:text-primary focus:outline-none focus:ring-2 focus:ring-spotify-green focus:ring-offset-2 focus:ring-offset-background',
                isActive ? 'text-foreground' : 'text-muted-foreground'
              )}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('w-6 h-6', isActive && 'text-foreground')} aria-hidden="true" />
              <span className={cn('text-xs font-medium', isActive && 'text-foreground')}>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}