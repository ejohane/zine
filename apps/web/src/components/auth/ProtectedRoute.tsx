import * as React from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { AuthLoadingSpinner } from './AuthLoadingSpinner'

interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isLoaded, isSignedIn } = useAuth()
  const { isLoaded: userLoaded } = useUser()

  // Show loading spinner while Clerk is initializing
  if (!isLoaded || !userLoaded) {
    return fallback || <AuthLoadingSpinner message="Checking authentication..." />
  }

  // If user is not signed in, they'll be redirected by the root component
  if (!isSignedIn) {
    return null
  }

  // User is authenticated, render the protected content
  return <>{children}</>
}