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
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router': ['@tanstack/react-router'],
          'ui-vendor': ['framer-motion', 'lucide-react'],
          'clerk': ['@clerk/clerk-react'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@tanstack/react-router', 'framer-motion'],
  },
  plugins: [
    react(),
    TanStackRouterVite(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
})