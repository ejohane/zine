import { Link, useLocation } from '@tanstack/react-router'
import { Home, Search, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/search', label: 'Search', icon: Search },
  { path: '/profile', label: 'Profile', icon: User },
]

export function TabBar() {
  const location = useLocation()

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white dark:bg-black safe-bottom">
      <nav className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-colors touchable",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "scale-110")} />
              <span className="text-xs font-medium mt-1">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}