import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react'

export const useAuth = () => {
  const { isSignedIn, getToken, signOut } = useClerkAuth()
  const { user } = useUser()

  return {
    isAuthenticated: isSignedIn || false,
    userId: user?.id || null,
    user,
    getToken: async () => {
      if (!isSignedIn) return null
      try {
        return await getToken()
      } catch (error) {
        console.error('Failed to get token:', error)
        return null
      }
    },
    signOut,
  }
}

export { useUser }