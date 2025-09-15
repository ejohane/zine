// @ts-nocheck
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-expo';
import { tokenCache } from '../lib/tokenCache';

interface AuthContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null | undefined;
  user: any;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken: getClerkToken, signOut: clerkSignOut } = useClerkAuth();
  const { user } = useUser();
  const [cachedToken, setCachedToken] = useState<string | null>(null);

  useEffect(() => {
    if (isSignedIn && userId) {
      getClerkToken()
        .then(token => {
          if (token) {
            tokenCache.saveToken('session', token);
            setCachedToken(token);
          }
        })
        .catch(error => {
          console.error('Error caching token:', error);
        });
    }
  }, [isSignedIn, userId, getClerkToken]);

  const getToken = async (): Promise<string | null> => {
    try {
      const freshToken = await getClerkToken();
      if (freshToken) {
        await tokenCache.saveToken('session', freshToken);
        setCachedToken(freshToken);
        return freshToken;
      }

      const cached = await tokenCache.getToken('session');
      return cached;
    } catch (error) {
      console.error('Error getting token:', error);
      return cachedToken || tokenCache.getToken('session');
    }
  };

  const signOut = async () => {
    try {
      await tokenCache.clearToken();
      setCachedToken(null);
      await clerkSignOut();
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    isLoaded,
    isSignedIn: !!isSignedIn,
    userId,
    user,
    getToken,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}