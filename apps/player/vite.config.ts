import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The app loads its pages from a bundled asset folder (`http://tauri.localhost/` on Android), so every
// URL is relative. The episode builds are copied under `dist/episode-N/` by `scripts/build-app.sh`.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        probe: resolve(import.meta.dirname, 'probe.html'),
      },
    },
  },
  server: { port: 5174 },
});
