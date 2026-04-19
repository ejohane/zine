import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isStorybookBuild =
  process.env.STORYBOOK === 'true' ||
  process.argv.some((argument) => argument.toLowerCase().includes('storybook'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.1'),
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(!isStorybookBuild
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: false,
            includeAssets: [
              'favicon.png',
              'zine-logo.png',
              'pwa/apple-touch-icon.png',
              'pwa/pwa-192x192.png',
              'pwa/pwa-512x512.png',
              'pwa/pwa-maskable-512x512.png',
            ],
            manifest: {
              id: '/',
              name: 'Zine',
              short_name: 'Zine',
              description:
                'A calm editorial workspace for triaging, saving, and revisiting the things you care about.',
              theme_color: '#000000',
              background_color: '#000000',
              display: 'standalone',
              display_override: ['standalone', 'browser'],
              orientation: 'portrait',
              scope: '/',
              start_url: '/bookmarks',
              categories: ['productivity', 'news', 'utilities'],
              icons: [
                {
                  src: '/pwa/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: '/pwa/pwa-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: '/pwa/pwa-maskable-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              navigateFallback: '/index.html',
              navigateFallbackDenylist: [/^\/trpc\//],
              runtimeCaching: [
                {
                  urlPattern: ({ request }) => request.destination === 'image',
                  handler: 'StaleWhileRevalidate',
                  options: {
                    cacheName: 'zine-images',
                    cacheableResponse: {
                      statuses: [0, 200],
                    },
                    expiration: {
                      maxEntries: 96,
                      maxAgeSeconds: 7 * 24 * 60 * 60,
                    },
                  },
                },
                {
                  urlPattern: ({ url }) => url.pathname.startsWith('/trpc/'),
                  handler: 'NetworkOnly',
                },
              ],
            },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    host: '0.0.0.0',
  },
  preview: {
    port: Number(process.env.WEB_PORT ?? 4173),
    host: '0.0.0.0',
  },
});
