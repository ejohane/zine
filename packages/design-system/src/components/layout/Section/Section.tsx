import * as React from "react"
import { cn } from "../../../lib/utils"

export interface SectionProps {
  children: React.ReactNode
  title?: string
  action?: string
  onAction?: () => void
  headerContent?: React.ReactNode
  className?: string
}

export const Section = React.forwardRef<HTMLElement, SectionProps>(
  ({ children, title, action = "See all", onAction, headerContent, className }, ref) => {
    return (
      <section ref={ref} className={cn("py-6 md:py-8", className)}>
        {(title || headerContent) && (
          <div className="flex items-center justify-between mb-4">
            {headerContent ? (
              headerContent
            ) : (
              <>
                <h2 className="text-lg md:text-xl font-semibold">{title}</h2>
                {onAction && (
                  <button
                    onClick={onAction}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {action}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {children}
      </section>
    )
  }
)

Section.displayName = "Section"