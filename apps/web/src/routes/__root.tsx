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

  // Fallback navigation component when Clerk is not available
  const NavigationFallback = () => (
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
        <Link
          to="/sign-in"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          Sign In
        </Link>
      </div>
    </div>
  )

  // With Clerk navigation component
  const NavigationWithClerk = () => (
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
  )

  if (!publishableKey) {
    // Render without Clerk when publishable key is missing
    return (
      <QueryClientProvider client={queryClient}>
        <NavigationFallback />
        <hr />
        <Outlet />
        {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
      </QueryClientProvider>
    )
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <QueryClientProvider client={queryClient}>
        <NavigationWithClerk />
        <hr />
        <Outlet />
        {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
      </QueryClientProvider>
    </ClerkProvider>
  )
}