import * as React from "react"
import { cn } from "../../../lib/utils"

export interface GridProps {
  children: React.ReactNode
  cols?: number | { sm?: number; md?: number; lg?: number; xl?: number }
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12
  variant?: "fixed" | "autoFit" | "autoFill"
  minChildWidth?: string
  className?: string
}

const gapClasses = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
  10: "gap-10",
  12: "gap-12",
}

export const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  ({ 
    children, 
    cols = 1, 
    gap = 4, 
    variant = "fixed",
    minChildWidth = "250px",
    className 
  }, ref) => {
    const getGridClasses = () => {
      if (variant === "autoFit") {
        return `grid-cols-[repeat(auto-fit,minmax(${minChildWidth},1fr))]`
      }
      
      if (variant === "autoFill") {
        return `grid-cols-[repeat(auto-fill,minmax(${minChildWidth},1fr))]`
      }
      
      // Fixed variant
      if (typeof cols === "number") {
        return `grid-cols-${cols}`
      }
      
      // Responsive cols object
      const classes: string[] = []
      if (cols.sm) classes.push(`sm:grid-cols-${cols.sm}`)
      if (cols.md) classes.push(`md:grid-cols-${cols.md}`)
      if (cols.lg) classes.push(`lg:grid-cols-${cols.lg}`)
      if (cols.xl) classes.push(`xl:grid-cols-${cols.xl}`)
      
      return `grid-cols-1 ${classes.join(" ")}`
    }

    return (
      <div
        ref={ref}
        className={cn(
          "grid",
          getGridClasses(),
          gapClasses[gap],
          className
        )}
        style={
          variant !== "fixed" 
            ? { gridTemplateColumns: variant === "autoFit" 
                ? `repeat(auto-fit, minmax(${minChildWidth}, 1fr))`
                : `repeat(auto-fill, minmax(${minChildWidth}, 1fr))`
              }
            : undefined
        }
      >
        {children}
      </div>
    )
  }
)

Grid.displayName = "Grid"