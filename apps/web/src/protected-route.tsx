import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useAppSession, useAuthAvailability } from './lib/trpc';

function ClerkProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAppSession();

  if (!auth.isLoaded) {
    return (
      <main className="shell-loading">
        <div>
          <p className="eyebrow">Authenticating</p>
          <h1>Checking your session.</h1>
        </div>
      </main>
    );
  }

  if (!auth.isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  return <>{children}</>;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isEnabled } = useAuthAvailability();

  if (!isEnabled) {
    return (
      <main className="shell-loading">
        <div>
          <p className="eyebrow">Configuration required</p>
          <h1>Set `VITE_CLERK_PUBLISHABLE_KEY` to use the web app.</h1>
        </div>
      </main>
    );
  }

  return <ClerkProtectedRoute>{children}</ClerkProtectedRoute>;
}
