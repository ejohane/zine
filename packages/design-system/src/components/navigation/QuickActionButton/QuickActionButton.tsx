import * as React from "react"
import { cn } from "../../../lib/utils"

export interface QuickActionButtonProps {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  variant?: "default" | "primary" | "secondary"
  loading?: boolean
  className?: string
}

export const QuickActionButton = React.forwardRef<HTMLButtonElement, QuickActionButtonProps>(
  ({ icon, label, onClick, variant = "default", loading = false, className }, ref) => {
    return (
      <button
        ref={ref}
        onClick={onClick}
        disabled={loading}
        className={cn(
          "flex flex-col items-center justify-center gap-2",
          "min-h-[80px] md:min-h-[100px] p-4",
          "rounded-lg border bg-card",
          "transition-all duration-200",
          "hover:bg-accent hover:scale-[1.02]",
          "active:scale-[0.98]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          loading && "opacity-50 cursor-not-allowed",
          variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
          variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          className
        )}
      >
        <div className="w-8 h-8 flex items-center justify-center">
          {loading ? (
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            icon
          )}
        </div>
        <span className="text-sm font-medium text-center">{label}</span>
      </button>
    )
  }
)

QuickActionButton.displayName = "QuickActionButton"