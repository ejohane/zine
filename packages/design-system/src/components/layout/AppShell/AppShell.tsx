import * as React from "react"
import { cn } from "../../../lib/utils"

export interface AppShellProps {
  children: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
  className?: string
  fullHeight?: boolean
  noPadding?: boolean
}

export const AppShell = React.forwardRef<HTMLDivElement, AppShellProps>(
  ({ children, header, footer, className, fullHeight = true, noPadding = false }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col bg-background text-foreground",
          fullHeight && "min-h-screen",
          className
        )}
      >
        {header && (
          <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            {header}
          </header>
        )}
        
        <main
          className={cn(
            "flex-1 w-full",
            !noPadding && "px-4 py-6 md:px-6 md:py-8",
            "safe-area-inset-padding"
          )}
        >
          {children}
        </main>
        
        {footer && (
          <footer className="w-full border-t bg-background">
            {footer}
          </footer>
        )}
      </div>
    )
  }
)

AppShell.displayName = "AppShell"