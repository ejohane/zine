import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { LinkButton } from './components';
import { completeOAuthFlow } from './lib/oauth';
import { useAppSession, useAuthAvailability } from './lib/trpc';

export function OAuthCallbackPage() {
  const { getToken } = useAppSession();
  const { mode } = useAuthAvailability();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState('Finishing the provider connection...');

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

        navigate('/settings', { replace: true });
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
  }, [getToken, location.search, mode, navigate]);

  return (
    <main className="shell-loading">
      <div>
        <p className="eyebrow">
          {status === 'working' ? 'Connecting source' : 'Connection failed'}
        </p>
        <h1>{message}</h1>
        {status === 'error' ? (
          <div className="button-row">
            <LinkButton to="/settings">Back to settings</LinkButton>
          </div>
        ) : null}
      </div>
    </main>
  );
}
