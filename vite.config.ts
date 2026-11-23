import { defineConfig } from 'vite';

// Relative base so the build works under any sub-path (PlayGrid hosting, iframes).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
