import {
  createRootRoute,
  Outlet,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { AnimatePresence } from 'framer-motion'
import * as React from 'react'
import { Header } from '@/components/navigation/Header'
import { TabBar } from '@/components/navigation/TabBar'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { SkipLink } from '../components/layout/SkipLink'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  }))
  
  const isMobile = useIsMobile()

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <SkipLink />
        <div className="flex flex-col h-full">
          <SignedOut>
            <Outlet />
          </SignedOut>

          <SignedIn>
            {!isMobile && <Header />}
            
            {isMobile ? (
              <>
                {/* Mobile layout with fixed positioning for iOS PWA */}
                <div className="flex flex-col h-full">
                  {/* Header area with safe area padding */}
                  <div className="flex-shrink-0 safe-top" />
                  
                  {/* Main content area */}
                  <main 
                    className="flex-1 overflow-y-auto overflow-x-hidden"
                    style={{ 
                      paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
                      WebkitOverflowScrolling: 'touch' 
                    }}
                  >
                    <AnimatePresence mode="wait">
                      <Outlet />
                    </AnimatePresence>
                  </main>
                </div>
                
                <TabBar />
              </>
            ) : (
              <main className="flex-1">
                <AnimatePresence mode="wait">
                  <Outlet />
                </AnimatePresence>
              </main>
            )}
          </SignedIn>
        </div>
        
        {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
      </ErrorBoundary>
    </QueryClientProvider>
  )
}