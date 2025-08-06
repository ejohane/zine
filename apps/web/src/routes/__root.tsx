import {
  createRootRoute,
  Outlet,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { AnimatePresence } from 'framer-motion'
import * as React from 'react'
import { Navigation } from '../components/layout/Navigation'
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

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <SkipLink />
        <div className="min-h-screen">
          <SignedOut>
            <Outlet />
          </SignedOut>

          <SignedIn>
            <Navigation />
            <AnimatePresence mode="wait">
              <Outlet />
            </AnimatePresence>
          </SignedIn>
        </div>
        
        {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
      </ErrorBoundary>
    </QueryClientProvider>
  )
}