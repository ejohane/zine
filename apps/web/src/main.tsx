import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './app';
import { RootProviders } from './lib/trpc';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container not found');
}

createRoot(container).render(
  <StrictMode>
    <RootProviders>
      <App />
    </RootProviders>
  </StrictMode>
);
