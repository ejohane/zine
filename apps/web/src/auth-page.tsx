import { SignIn, SignUp } from '@clerk/clerk-react';

import { StatCard, Surface } from './components';
import { AppWordmark } from './app-wordmark';
import { useAuthAvailability } from './lib/trpc';

export function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { isEnabled } = useAuthAvailability();

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

  return (
    <main className="auth-screen">
      <div className="auth-screen__backdrop" />
      <section className="auth-hero">
        <p className="eyebrow">Web channel</p>
        <h1>A single calm place for everything you bookmarked.</h1>
        <p>
          The web app is focused on one surface for now: browse saved items, open one in context,
          and return to the original source without switching views.
        </p>
        <div className="auth-hero__grid">
          <StatCard label="Surface" value="1" detail="Bookmarks only" />
          <StatCard label="Route" value="/bookmarks" detail="The default signed-in landing page" />
        </div>
      </section>
      <section className="auth-panel">
        <AppWordmark />
        <Surface className="auth-panel__surface">
          {mode === 'sign-in' ? (
            <SignIn
              path="/sign-in"
              routing="path"
              signUpUrl="/sign-up"
              fallbackRedirectUrl="/bookmarks"
            />
          ) : (
            <SignUp
              path="/sign-up"
              routing="path"
              signInUrl="/sign-in"
              fallbackRedirectUrl="/bookmarks"
            />
          )}
        </Surface>
      </section>
    </main>
  );
}
