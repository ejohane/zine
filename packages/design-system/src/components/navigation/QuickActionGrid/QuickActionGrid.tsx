import * as React from "react"
import { cn } from "../../../lib/utils"
import { QuickActionButton } from "../QuickActionButton"
import type { QuickActionButtonProps } from "../QuickActionButton"

export interface QuickAction extends Omit<QuickActionButtonProps, 'className'> {
  id: string
}

export interface QuickActionGridProps {
  actions: QuickAction[]
  columns?: number | { sm?: number; md?: number; lg?: number }
  className?: string
}

export const QuickActionGrid = React.forwardRef<HTMLDivElement, QuickActionGridProps>(
  ({ actions, columns = { sm: 2, md: 4 }, className }, ref) => {
    const getGridColumns = () => {
      if (typeof columns === 'number') {
        return `grid-cols-${columns}`
      }
      
      const classes: string[] = ['grid-cols-2']
      if (columns.sm) classes.push(`sm:grid-cols-${columns.sm}`)
      if (columns.md) classes.push(`md:grid-cols-${columns.md}`)
      if (columns.lg) classes.push(`lg:grid-cols-${columns.lg}`)
      
      return classes.join(' ')
    }

    return (
      <div
        ref={ref}
        className={cn(
          "grid gap-2",
          getGridColumns(),
          className
        )}
      >
        {actions.map((action) => (
          <QuickActionButton
            key={action.id}
            icon={action.icon}
            label={action.label}
            onClick={action.onClick}
            variant={action.variant}
            loading={action.loading}
          />
        ))}
      </div>
    )
  }
)

QuickActionGrid.displayName = "QuickActionGrid"