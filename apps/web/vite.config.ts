import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
    historyApiFallback: true,
  },
  plugins: [
    react(),
    TanStackRouterVite(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
})