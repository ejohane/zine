import {
  Link,
  createRootRoute,
  Outlet,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClerkProvider, SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/clerk-react'
import * as React from 'react'

export const Route = createRootRoute({
  component: RootComponent,
  beforeLoad: () => {
    return {
      auth: {
        isAuthenticated: false,
        userId: null,
        getToken: async () => null,
      },
    }
  },
})

function RootComponent() {
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  }))

  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION || import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV

  // Debug logging
  console.log('Environment variables:', {
    VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION,
    VITE_CLERK_PUBLISHABLE_KEY_DEV: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV,
    MODE: import.meta.env.MODE,
    PROD: import.meta.env.PROD,
    DEV: import.meta.env.DEV,
    allEnvVars: import.meta.env
  })
  
  // Test hardcoded value to see if the issue is with env var detection
  console.log('Process env during build:', {
    VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION || 'not set',
    testVar: import.meta.env.VITE_TEST_VAR || 'not set'
  })

  if (!publishableKey) {
    throw new Error('Missing Clerk publishable key')
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <QueryClientProvider client={queryClient}>
        <div className="p-2 flex gap-2 justify-between">
          <div className="flex gap-2">
            <Link
              to="/"
              activeProps={{
                className: 'font-bold',
              }}
              activeOptions={{ exact: true }}
            >
              Home
            </Link>
            <Link
              to="/bookmarks"
              activeProps={{
                className: 'font-bold',
              }}
            >
              Bookmarks
            </Link>
          </div>
          <div className="flex gap-2">
            <SignedOut>
              <SignInButton />
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </div>
        </div>
        <hr />
        <Outlet />
        <TanStackRouterDevtools position="bottom-right" />
      </QueryClientProvider>
    </ClerkProvider>
  )
}