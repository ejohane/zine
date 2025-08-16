import { Play, Star, Plus } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { useBookmarks } from '@/hooks/useBookmarks'

interface QuickActionButtonProps {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  to?: string
  className?: string
}

function QuickActionButton({ icon, label, onClick, to, className }: QuickActionButtonProps) {
  const buttonContent = (
    <>
      <div className="w-14 h-14 mx-auto mb-2 flex items-center justify-center">
        {icon}
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </>
  )

  const buttonClass = cn(
    "flex flex-col items-center justify-center p-6 rounded-2xl",
    "bg-white hover:bg-gray-50 dark:bg-zinc-900 dark:hover:bg-zinc-800",
    "transition-all hover:scale-105 active:scale-95",
    "shadow-sm hover:shadow-lg border border-gray-200 dark:border-zinc-800",
    "min-h-[120px] w-full",
    className
  )

  if (to) {
    return (
      <Link to={to} className={buttonClass}>
        {buttonContent}
      </Link>
    )
  }

  return (
    <button onClick={onClick} className={buttonClass}>
      {buttonContent}
    </button>
  )
}

export function QuickActions() {
  const navigate = useNavigate()

  // Fetch continue item from API (will be connected to DO later)
  // TODO: Replace with DO endpoint for last opened bookmark
  const { data: bookmarks } = useBookmarks({ status: 'active' })
  const continueItem = bookmarks?.[0] // For now, just use the most recent bookmark

  const handleContinue = () => {
    if (continueItem) {
      // Open the bookmark URL
      window.open(continueItem.url, '_blank')
      // TODO: Update DO with opened timestamp
    }
  }

  const handleFavorites = () => {
    // Navigate to bookmarks with favorites filter
    navigate({ to: '/bookmarks', search: { filter: 'favorites' } })
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <QuickActionButton
        icon={<Play className="w-8 h-8 text-white" />}
        label="Continue"
        onClick={handleContinue}
        className={!continueItem ? 'opacity-50 cursor-not-allowed' : ''}
      />
      <QuickActionButton
        icon={<Star className="w-8 h-8 text-white" />}
        label="Favorites"
        onClick={handleFavorites}
      />
      <QuickActionButton
        icon={<Plus className="w-8 h-8 text-white" />}
        label="Add New"
        to="/save"
      />
    </div>
  )
}