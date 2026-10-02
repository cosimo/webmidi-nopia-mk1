import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs, so the build works under GitHub Pages' /webmidi-nopia-mk1/ path
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
