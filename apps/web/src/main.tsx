import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PublicPage } from './public-publications/page';
import { ReaderDataSchema } from './public-publications/model';
import { isPublicPath } from './public-publications/paths';
import './public-publications/reader.css';

import App from './app';
import { registerPwaServiceWorker } from './lib/pwa-registration';
import { RootProviders } from './lib/trpc';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container not found');
}

const publicPage = isPublicPath(window.location.pathname);
const bootstrap = document.getElementById('zine-publication-data');
let initial;
try {
  initial = bootstrap
    ? ReaderDataSchema.parse(JSON.parse(bootstrap.textContent || 'null'))
    : undefined;
} catch {
  initial = undefined;
}
const application = (
  <StrictMode>
    <RootProviders>
      {publicPage ? (
        <BrowserRouter>
          <PublicPage initial={initial} />
        </BrowserRouter>
      ) : (
        <App />
      )}
    </RootProviders>
  </StrictMode>
);
if (publicPage && initial) hydrateRoot(container, application);
else createRoot(container).render(application);
if (!publicPage) void registerPwaServiceWorker();
