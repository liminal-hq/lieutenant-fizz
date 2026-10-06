import { defineConfig } from 'vite';

// Production builds are served from GitHub Pages at /lieutenant-fizz/episode-1/
// (https://liminalhq.ca/lieutenant-fizz/episode-1/); dev serves from the root.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/lieutenant-fizz/episode-1/' : '/',
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 0 },
  server: { port: 5173 },
  preview: { port: 4173 },
}));
