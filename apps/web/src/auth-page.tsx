import { SignIn, SignUp } from '@clerk/clerk-react';
import { Navigate, useLocation } from 'react-router-dom';

import { Colors } from '@zine/design-system';

import { AppWordmark } from './app-wordmark';
import { bookmarkReturnDestination } from './lib/bookmark-return';
import { useAuthAvailability } from './lib/trpc';

const clerkAppearance = {
  variables: {
    colorBackground: 'transparent',
    colorPrimary: Colors.light.accent,
    colorText: Colors.light.textPrimary,
    colorTextSecondary: Colors.light.textSecondary,
    colorDanger: Colors.light.statusError,
    colorSuccess: Colors.light.statusSuccess,
    colorInputBackground: Colors.light.surfaceCanvas,
    colorInputText: Colors.light.textPrimary,
    colorNeutral: Colors.light.textPrimary,
    borderRadius: '0.75rem',
  },
};

export function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const location = useLocation();
  const bookmarkDestination = bookmarkReturnDestination(location.search);
  const destination = bookmarkDestination ?? '/welcome';
  const authQuery = bookmarkDestination
    ? `?returnTo=${encodeURIComponent(bookmarkDestination)}`
    : '';
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
    return <Navigate to={destination} replace />;
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
              signUpUrl={`/sign-up${authQuery}`}
              fallbackRedirectUrl={destination}
              forceRedirectUrl={destination}
            />
          ) : (
            <SignUp
              appearance={clerkAppearance}
              path="/sign-up"
              routing="path"
              signInUrl={`/sign-in${authQuery}`}
              fallbackRedirectUrl={destination}
              forceRedirectUrl={destination}
            />
          )}
        </div>
        <nav aria-label="About Zine" className="flex flex-wrap gap-4 text-sm">
          <a href="/about/">About Zine</a>
          <a href="/privacy/">Privacy</a>
          <a href="/terms/">Terms</a>
        </nav>
      </section>
    </main>
  );
}
