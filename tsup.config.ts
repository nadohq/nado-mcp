import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/index-v2.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  loader: {
    '.md': 'text',
  },
});
