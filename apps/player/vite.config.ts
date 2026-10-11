// Vite config for the player app's own pages (the spike menu, the capability probe and the haptics page).
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The app loads its pages from a bundled asset folder (`http://tauri.localhost/` on Android), so every
// URL is relative. The episode builds are copied under `dist/episode-N/` by `scripts/build-app.sh`.
// The haptics page shows which commit of the plugin the app was built with: the `rev` in Cargo.toml.
const cargo = readFileSync(resolve(import.meta.dirname, 'src-tauri/Cargo.toml'), 'utf8');
const pluginRev = /tauri-plugin-haptics\s*=\s*\{[^}]*rev\s*=\s*"([0-9a-f]+)"/.exec(cargo)?.[1];

export default defineConfig({
  base: './',
  define: { __HAPTICS_PLUGIN_REV__: JSON.stringify(pluginRev ?? 'unknown') },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        probe: resolve(import.meta.dirname, 'probe.html'),
        haptics: resolve(import.meta.dirname, 'haptics.html'),
      },
    },
  },
  server: { port: 5174 },
});
