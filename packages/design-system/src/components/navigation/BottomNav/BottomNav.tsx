import * as React from "react"
import { cn } from "../../../lib/utils"
import { NavItem } from "../NavItem"

export interface BottomNavItem {
  icon: React.ReactNode
  label: string
  href?: string
  isActive?: boolean
  onClick?: () => void
}

export interface BottomNavProps {
  items: BottomNavItem[]
  className?: string
  activeColor?: string
}

export const BottomNav = React.forwardRef<HTMLElement, BottomNavProps>(
  ({ items, className, activeColor }, ref) => {
    return (
      <nav
        ref={ref}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50",
          "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
          "border-t",
          "safe-area-inset-bottom",
          className
        )}
      >
        <div className="flex items-center justify-around py-2">
          {items.map((item, index) => (
            <NavItem
              key={index}
              icon={item.icon}
              label={item.label}
              href={item.href}
              isActive={item.isActive}
              onClick={item.onClick}
              activeColor={activeColor}
            />
          ))}
        </div>
      </nav>
    )
  }
)

BottomNav.displayName = "BottomNav"