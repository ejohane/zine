import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { LinkButton } from './components';
import { getOnboardingOAuthContext } from './lib/onboarding';
import { completeOAuthFlow } from './lib/oauth';
import { useAppSession, useAuthAvailability } from './lib/trpc';

export function OAuthCallbackPage() {
  const { getToken } = useAppSession();
  const { mode } = useAuthAvailability();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState('Finishing the provider connection...');
  const pendingOnboardingContext = getOnboardingOAuthContext();
  const returnPath = pendingOnboardingContext?.origin === 'welcome' ? '/welcome' : '/settings';

  useEffect(() => {
    if (mode !== 'clerk') {
      setStatus('error');
      setMessage('OAuth connections are only available when Clerk auth is configured.');
      return;
    }

    let isCancelled = false;

    void completeOAuthFlow(new URLSearchParams(location.search), getToken)
      .then(() => {
        if (isCancelled) {
          return;
        }

        navigate(returnPath, { replace: true });
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Could not finish the OAuth flow.');
      });

    return () => {
      isCancelled = true;
    };
  }, [getToken, location.search, mode, navigate, returnPath]);

  return (
    <main className="shell-loading">
      <div>
        <p className="eyebrow">
          {status === 'working' ? 'Connecting source' : 'Connection failed'}
        </p>
        <h1>{message}</h1>
        {status === 'error' ? (
          <div className="button-row">
            <LinkButton to={returnPath}>
              {returnPath === '/welcome' ? 'Back to guided setup' : 'Back to settings'}
            </LinkButton>
          </div>
        ) : null}
      </div>
    </main>
  );
}
