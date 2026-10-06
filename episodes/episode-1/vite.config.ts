import { defineConfig } from 'vite';

// Production builds are served from GitHub Pages at /lieutenant-fizz/episode-1/
// (https://liminalhq.ca/lieutenant-fizz/episode-1/); dev serves from the root.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/lieutenant-fizz/episode-1/' : '/',
  // three.js dominates the bundle (~570 kB minified); a single chunk is fine for a game.
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 700 },
  server: { port: 5173 },
  preview: { port: 4173 },
}));
