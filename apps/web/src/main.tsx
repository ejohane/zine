import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './app';
import { registerPwaServiceWorker } from './lib/pwa-registration';
import { RootProviders } from './lib/trpc';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container not found');
}

void registerPwaServiceWorker();

createRoot(container).render(
  <StrictMode>
    <RootProviders>
      <App />
    </RootProviders>
  </StrictMode>
);
