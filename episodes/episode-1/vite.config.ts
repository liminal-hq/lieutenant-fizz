import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The release version lives in the player app's package.json; the game reports it in a play sample's specs.
const gameVersion = (
  JSON.parse(readFileSync(new URL('../../apps/player/package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

// Production builds are served from GitHub Pages at /lieutenant-fizz/episode-1/
// (https://liminalhq.ca/lieutenant-fizz/episode-1/); dev serves from the root.
export default defineConfig(({ command, isPreview }) => ({
  define: { __GAME_VERSION__: JSON.stringify(gameVersion) },
  base: command === 'build' || isPreview ? '/lieutenant-fizz/episode-1/' : '/',
  // three.js dominates the bundle (~570 kB minified); a single chunk is fine for a game.
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 700 },
  server: { port: 5173 },
  preview: { port: 4173 },
}));
