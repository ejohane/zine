import {
  createRootRoute,
  Outlet,
  Link,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { AnimatePresence } from 'framer-motion'
import * as React from 'react'
import { Header } from '@/components/navigation/Header'
import { TabBar } from '@/components/navigation/TabBar'
import { Fab } from '@/components/ui/fab'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { SkipLink } from '../components/layout/SkipLink'
import { Plus } from 'lucide-react'

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
        <div className="min-h-screen flex flex-col">
          <SignedOut>
            <Outlet />
          </SignedOut>

          <SignedIn>
            {!isMobile && <Header />}
            
            <main className={cn(
              "flex-1",
              isMobile && "pb-16" // Add padding for mobile tab bar
            )}>
              <AnimatePresence mode="wait">
                <Outlet />
              </AnimatePresence>
            </main>
            
            {isMobile && <TabBar />}
            
            <Link to="/save">
              <Fab position="bottom-right" aria-label="Add bookmark">
                <Plus className="h-6 w-6" />
              </Fab>
            </Link>
          </SignedIn>
        </div>
        
        {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
      </ErrorBoundary>
    </QueryClientProvider>
  )
}