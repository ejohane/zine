import { Link, useLocation } from '@tanstack/react-router'
import { Home, Search, User } from 'lucide-react'
import { UserButton } from '@clerk/clerk-react'
import { cn } from '../../lib/utils'
import { ThemeToggle } from '../theme/ThemeToggle'

export function DesktopNav() {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/search', label: 'Search', icon: Search },
    { path: '/profile', label: 'Profile', icon: User },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/" className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded">
            <h1 className="text-2xl font-bold text-primary">Zine</h1>
          </Link>
        </div>

        <nav className="flex items-center gap-1" role="navigation" aria-label="Desktop navigation">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200',
                  'hover:bg-accent/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background',
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'
                )}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </header>
  )
}