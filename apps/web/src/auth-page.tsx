import { SignIn, SignUp } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';

import { AppWordmark } from './app-wordmark';
import { useAuthAvailability } from './lib/trpc';

const clerkAppearance = {
  variables: {
    colorBackground: 'transparent',
    colorPrimary: '#111111',
    colorText: '#111111',
    colorTextSecondary: '#6B7280',
    colorDanger: '#DC2626',
    colorSuccess: '#059669',
    colorInputBackground: '#F9FAFB',
    colorInputText: '#111111',
    colorNeutral: '#111111',
    borderRadius: '0.75rem',
  },
};

export function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { isEnabled, mode: authMode } = useAuthAvailability();

  if (!isEnabled) {
    return (
      <main className="shell-loading">
        <div>
          <p className="eyebrow">Configuration required</p>
          <h1>Set `VITE_CLERK_PUBLISHABLE_KEY` to use the web auth flow.</h1>
        </div>
      </main>
    );
  }

  if (authMode === 'development-bypass') {
    return <Navigate to="/bookmarks" replace />;
  }

  return (
    <main className="auth-screen">
      <div className="auth-screen__backdrop" />
      <section className="auth-panel">
        <AppWordmark />
        <div className="auth-panel__surface">
          {mode === 'sign-in' ? (
            <SignIn
              appearance={clerkAppearance}
              path="/sign-in"
              routing="path"
              signUpUrl="/sign-up"
              fallbackRedirectUrl="/bookmarks"
            />
          ) : (
            <SignUp
              appearance={clerkAppearance}
              path="/sign-up"
              routing="path"
              signInUrl="/sign-in"
              fallbackRedirectUrl="/bookmarks"
            />
          )}
        </div>
      </section>
    </main>
  );
}
