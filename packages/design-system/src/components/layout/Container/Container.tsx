import * as React from "react"
import { cn } from "../../../lib/utils"

export interface ContainerProps {
  children: React.ReactNode
  size?: "sm" | "md" | "lg" | "full"
  noPadding?: boolean
  className?: string
}

const containerSizes = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-7xl",
  full: "max-w-full",
}

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ children, size = "lg", noPadding = false, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "mx-auto w-full",
          containerSizes[size],
          !noPadding && "px-4 md:px-6",
          className
        )}
      >
        {children}
      </div>
    )
  }
)

Container.displayName = "Container"