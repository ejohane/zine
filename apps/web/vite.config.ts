import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsConfigPaths from 'vite-tsconfig-paths'
import { readFileSync } from 'fs'
import { join } from 'path'
// import { createRouterPlugin } from '@tanstack/router-vite-plugin'

// Read port offset from .env.worktree
let portOffset = 0
try {
  const envWorktree = readFileSync(join(__dirname, '../../.env.worktree'), 'utf-8')
  const match = envWorktree.match(/PORT_OFFSET=(\d+)/)
  if (match) {
    portOffset = parseInt(match[1], 10)
  }
} catch {
  // No worktree config, use default ports
}

const webPort = 3000 + portOffset
const apiPort = 8787 + portOffset

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: webPort,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: webPort,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@tanstack/react-router', 'framer-motion'],
  },
  plugins: [
    react(),
    // TanStackRouterVite(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    // Temporarily disabled due to Rollup compatibility issue
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
    //   manifest: {
    //     name: 'Zine - Your Content Hub',
    //     short_name: 'Zine',
    //     description: 'Save and organize your favorite content from across the web',
    //     theme_color: '#000000',
    //     background_color: '#000000',
    //     display: 'standalone',
    //     orientation: 'portrait',
    //     scope: '/',
    //     start_url: '/',
    //     icons: [
    //       {
    //         src: 'pwa-192x192.png',
    //         sizes: '192x192',
    //         type: 'image/png'
    //       },
    //       {
    //         src: 'pwa-512x512.png',
    //         sizes: '512x512',
    //         type: 'image/png'
    //       },
    //       {
    //         src: 'pwa-512x512.png',
    //         sizes: '512x512',
    //         type: 'image/png',
    //         purpose: 'any maskable'
    //       }
    //     ]
    //   },
    //   workbox: {
    //     globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    //     runtimeCaching: [
    //       {
    //         urlPattern: /^https:\/\/api\.myzine\.app\/api\/.*/i,
    //         handler: 'NetworkFirst',
    //         options: {
    //           cacheName: 'api-cache',
    //           expiration: {
    //             maxEntries: 50,
    //             maxAgeSeconds: 60 * 60 * 24 // 24 hours
    //           },
    //           cacheableResponse: {
    //             statuses: [0, 200]
    //           }
    //         }
    //       }
    //     ]
    //   },
    //   devOptions: {
    //     enabled: false
    //   }
    // }),
  ],
})