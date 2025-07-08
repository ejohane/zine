import {
  Link,
  createRootRoute,
  Outlet,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClerkProvider, SignInButton, SignedIn, SignedOut, UserButton, useAuth } from '@clerk/clerk-react'
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

  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

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