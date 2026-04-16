import type { PropsWithChildren } from 'react';
import { vi } from 'vitest';

type AuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
};

type AuthWidgetProps = {
  path: string;
  routing: string;
  fallbackRedirectUrl: string;
  signInUrl?: string;
  signUpUrl?: string;
};

const authState: AuthState = {
  isLoaded: true,
  isSignedIn: true,
  getToken: async () => null,
};

export const signOutMock = vi.fn(async () => {});

export function resetClerkMocks() {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  authState.getToken = async () => null;
  signOutMock.mockReset();
  signOutMock.mockResolvedValue(undefined);
}

export function setClerkAuthState(nextState: Partial<AuthState>) {
  Object.assign(authState, nextState);
}

export function ClerkProvider({ children }: PropsWithChildren<{ publishableKey: string }>) {
  return <>{children}</>;
}

export function useAuth() {
  return authState;
}

export function useClerk() {
  return {
    signOut: signOutMock,
  };
}

export function SignIn({ path, routing, fallbackRedirectUrl, signUpUrl }: AuthWidgetProps) {
  return (
    <div data-testid="clerk-sign-in">
      SignIn {path} {routing} {fallbackRedirectUrl} {signUpUrl}
    </div>
  );
}

export function SignUp({ path, routing, fallbackRedirectUrl, signInUrl }: AuthWidgetProps) {
  return (
    <div data-testid="clerk-sign-up">
      SignUp {path} {routing} {fallbackRedirectUrl} {signInUrl}
    </div>
  );
}
