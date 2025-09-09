import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts', 
    'src/tokens/index.ts',
    'src/web/index.ts',
    'src/native/index.ts'
  ],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    'react', 
    'react-dom', 
    'react-native',
    '@heroui/react', 
    'heroui-native'
  ],
});