import {
  Link,
  createRootRoute,
  Outlet,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SignedIn, SignedOut, UserButton } from '@clerk/clerk-react'
import * as React from 'react'

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
      <div className="min-h-screen">
        <SignedOut>
          <Outlet />
        </SignedOut>

        <SignedIn>
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
              <Link
                to="/test1"
                activeProps={{
                  className: 'font-bold',
                }}
              >
                Test 1
              </Link>
              <Link
                to="/test2"
                activeProps={{
                  className: 'font-bold',
                }}
              >
                Test 2
              </Link>
              <Link
                to="/profile"
                activeProps={{
                  className: 'font-bold',
                }}
              >
                Profile
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
          <hr />
          <Outlet />
        </SignedIn>
      </div>
      
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </QueryClientProvider>
  )
}