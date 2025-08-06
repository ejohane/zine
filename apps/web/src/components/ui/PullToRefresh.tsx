import { useState, useRef, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: ReactNode
  className?: string
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [startY, setStartY] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const threshold = 80
  const maxPull = 120

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      setStartY(e.touches[0].clientY)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!startY || isRefreshing) return
    
    const currentY = e.touches[0].clientY
    const distance = currentY - startY

    if (distance > 0 && containerRef.current?.scrollTop === 0) {
      e.preventDefault()
      setPullDistance(Math.min(distance, maxPull))
    }
  }

  const handleTouchEnd = async () => {
    if (pullDistance > threshold && !isRefreshing) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    }
    setPullDistance(0)
    setStartY(0)
  }

  const pullProgress = Math.min(pullDistance / threshold, 1)

  return (
    <div 
      ref={containerRef}
      className={cn("relative overflow-auto h-full", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={cn(
          "absolute top-0 left-0 right-0 flex items-center justify-center transition-all duration-300",
          isRefreshing && "animate-pulse"
        )}
        style={{
          height: `${pullDistance}px`,
          opacity: pullProgress
        }}
      >
        <RefreshCw 
          className={cn(
            "h-6 w-6 text-primary transition-transform duration-300",
            isRefreshing && "animate-spin"
          )}
          style={{
            transform: `rotate(${pullProgress * 180}deg)`
          }}
        />
      </div>
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance === 0 ? 'transform 0.3s' : 'none'
        }}
      >
        {children}
      </div>
    </div>
  )
}