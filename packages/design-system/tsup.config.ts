import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/tokens/index.ts',
    'src/lib/platform.ts',
    'src/lib/cn.ts',
    'src/lib/variants.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'react-native'],
  esbuildOptions(options) {
    options.platform = 'neutral';
    options.jsx = 'automatic';
  },
});