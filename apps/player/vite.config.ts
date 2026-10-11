// Vite config for the player app's own pages (the spike menu, the capability probe and the haptics page).
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The app loads its pages from a bundled asset folder (`http://tauri.localhost/` on Android), so every
// URL is relative. The episode builds are copied under `dist/episode-N/` by `scripts/build-app.sh`.
// The haptics page shows which version of each plugin the app was built with: the one `Cargo.lock` resolved.
const lock = readFileSync(resolve(import.meta.dirname, 'src-tauri/Cargo.lock'), 'utf8');
const versionOf = (crate: string): string | undefined =>
  new RegExp(`name = "${crate}"\\nversion = "([^"]+)"`).exec(lock)?.[1];
const pluginVersion = versionOf('tauri-plugin-phone-haptics');
const gamepadVersion = versionOf('tauri-plugin-gamepad-haptics');

export default defineConfig({
  base: './',
  define: {
    __HAPTICS_PLUGIN_VERSION__: JSON.stringify(pluginVersion ?? 'unknown'),
    __GAMEPAD_PLUGIN_VERSION__: JSON.stringify(gamepadVersion ?? 'unknown'),
  },
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
  server: {
    port: 5174,
    fs: { allow: [resolve(import.meta.dirname, '../..')] },
  },
});
