import * as React from "react"
import { cn } from "../../../lib/utils"

export interface NavItemProps {
  icon: React.ReactNode
  label: string
  href?: string
  isActive?: boolean
  onClick?: () => void
  className?: string
  activeColor?: string
}

export const NavItem = React.forwardRef<HTMLButtonElement, NavItemProps>(
  ({ icon, label, isActive = false, onClick, className, activeColor = "text-primary" }, ref) => {
    return (
      <button
        ref={ref}
        onClick={onClick}
        className={cn(
          "flex flex-col items-center justify-center gap-1 p-2",
          "transition-colors duration-200",
          "hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          "min-w-[64px] min-h-[56px]",
          isActive ? activeColor : "text-muted-foreground",
          className
        )}
      >
        <div className="w-6 h-6 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-xs font-medium">{label}</span>
      </button>
    )
  }
)

NavItem.displayName = "NavItem"