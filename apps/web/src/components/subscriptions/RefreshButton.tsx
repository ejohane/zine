import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'

interface RefreshButtonProps {
  onRefresh: () => Promise<void>
  isRefreshing: boolean
  lastRefreshTime?: Date | null
  nextAllowedTime?: Date | null
  className?: string
  showLabel?: boolean
}

export function RefreshButton({
  onRefresh,
  isRefreshing,
  lastRefreshTime,
  nextAllowedTime,
  className,
  showLabel = true
}: RefreshButtonProps) {
  const [isDisabled, setIsDisabled] = useState(false)
  const [remainingTime, setRemainingTime] = useState<string | null>(null)

  useEffect(() => {
    if (!nextAllowedTime) {
      setIsDisabled(false)
      setRemainingTime(null)
      return
    }

    const checkTime = () => {
      const now = new Date()
      const remaining = nextAllowedTime.getTime() - now.getTime()
      
      if (remaining <= 0) {
        setIsDisabled(false)
        setRemainingTime(null)
      } else {
        setIsDisabled(true)
        const minutes = Math.floor(remaining / 60000)
        const seconds = Math.floor((remaining % 60000) / 1000)
        
        if (minutes > 0) {
          setRemainingTime(`${minutes}:${seconds.toString().padStart(2, '0')}`)
        } else {
          setRemainingTime(`${seconds}s`)
        }
      }
    }

    checkTime()
    const interval = setInterval(checkTime, 1000)
    return () => clearInterval(interval)
  }, [nextAllowedTime])

  const getTooltipText = () => {
    if (isRefreshing) return 'Refreshing...'
    if (remainingTime) return `Available in ${remainingTime}`
    if (lastRefreshTime) {
      const now = new Date()
      const diff = now.getTime() - lastRefreshTime.getTime()
      const minutes = Math.floor(diff / 60000)
      
      if (minutes < 1) return 'Last refreshed just now'
      if (minutes === 1) return 'Last refreshed 1 minute ago'
      if (minutes < 60) return `Last refreshed ${minutes} minutes ago`
      
      const hours = Math.floor(minutes / 60)
      if (hours === 1) return 'Last refreshed 1 hour ago'
      return `Last refreshed ${hours} hours ago`
    }
    return 'Refresh subscriptions'
  }

  const handleClick = async () => {
    if (isDisabled || isRefreshing) return
    await onRefresh()
  }

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled || isRefreshing}
      title={getTooltipText()}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
        'bg-primary text-primary-foreground',
        'hover:bg-primary/90 transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        className
      )}
    >
      <RefreshCw 
        className={cn(
          'h-4 w-4',
          isRefreshing && 'animate-spin'
        )} 
      />
      {showLabel && (
        <span>
          {isRefreshing ? 'Refreshing...' : remainingTime ? `Wait ${remainingTime}` : 'Refresh'}
        </span>
      )}
    </button>
  )
}