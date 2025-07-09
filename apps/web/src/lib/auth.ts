import { redirect } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'

export interface AuthContext {
  isAuthenticated: boolean
  userId: string | null
  getToken: () => Promise<string | null>
}

export const createAuthContext = (): AuthContext => {
  const { isSignedIn, userId, getToken } = useAuth()
  
  return {
    isAuthenticated: !!isSignedIn,
    userId: userId || null,
    getToken,
  }
}

export const requireAuth = async (context: { location: { href: string } }) => {
  const { isSignedIn } = useAuth()
  
  if (!isSignedIn) {
    throw redirect({
      to: '/sign-in',
      search: {
        redirect: context.location.href,
      },
    })
  }
}