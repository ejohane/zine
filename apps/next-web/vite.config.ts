import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: '/next/',
  plugins: [react()],
  build: { sourcemap: false, cssMinify: false },
});
