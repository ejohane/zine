import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local development talks to the local API (`bun run local:dev` in apps/api) with the token
// `bun run local:pull` seeded into a cleaned copy of production data. The token is added here,
// in the dev server, so it never reaches the browser or a production build.
function localToken() {
  try {
    return readFileSync(new URL('../api/.local-data/dev/token', import.meta.url), 'utf8').trim();
  } catch {
    return undefined;
  }
}

export default defineConfig(({ command }) => {
  const token = command === 'serve' ? localToken() : undefined;
  if (command === 'serve' && !token)
    console.warn('No local data yet: run `bun run local:pull` in apps/api, then restart.');
  return {
    base: '/next/',
    plugins: [react()],
    build: { sourcemap: false, cssMinify: false },
    server: {
      // Reachable from your own devices over Tailscale (MagicDNS names end in .ts.net).
      allowedHosts: ['.ts.net'],
      proxy: {
        '/v1': {
          target: 'http://localhost:8890',
          configure: (proxy) =>
            proxy.on('proxyReq', (request) => {
              request.removeHeader('origin');
              if (token) request.setHeader('authorization', 'Bearer ' + token);
              else request.removeHeader('authorization');
            }),
        },
      },
    },
  };
});
