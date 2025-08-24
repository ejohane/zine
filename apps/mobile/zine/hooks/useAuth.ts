import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo'
import { useCallback } from 'react'
import { authStorage } from '@/lib/secure-storage'

// Custom auth hook wrapping Clerk
export function useAuth() {
  const { isLoaded, isSignedIn, signOut, getToken } = useClerkAuth()
  const { user } = useUser()

  // Get fresh token and store it
  const refreshToken = useCallback(async () => {
    try {
      const token = await getToken()
      if (token) {
        await authStorage.setTokens(token)
        return token
      }
      return null
    } catch (error) {
      console.error('Error refreshing token:', error)
      return null
    }
  }, [getToken])

  // Sign out and clear storage
  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
      await authStorage.clearAll()
      // Clear other app data if needed
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }, [signOut])

  // Store user info when signed in
  const storeUserInfo = useCallback(async () => {
    if (user) {
      await authStorage.setUserInfo(
        user.id,
        user.primaryEmailAddress?.emailAddress || ''
      )
    }
  }, [user])

  return {
    isLoaded,
    isSignedIn,
    user,
    signOut: handleSignOut,
    refreshToken,
    storeUserInfo,
    userId: user?.id,
    userEmail: user?.primaryEmailAddress?.emailAddress,
    userFullName: user?.fullName,
    userImageUrl: user?.imageUrl,
  }
}