// Vite config for the player app's own pages (the spike menu, the capability probe and the haptics page).
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';

// The app loads its pages from a bundled asset folder (`http://tauri.localhost/` on Android), so every
// URL is relative. The episode builds are copied under `dist/episode-N/` by `scripts/build-app.sh`.
// The haptics page shows which commit of each plugin the app was built with: the `rev` in Cargo.toml.
const cargo = readFileSync(resolve(import.meta.dirname, 'src-tauri/Cargo.toml'), 'utf8');
const revOf = (crate: string): string | undefined =>
  new RegExp(`${crate}\\s*=\\s*\\{[^}]*rev\\s*=\\s*"([0-9a-f]+)"`).exec(cargo)?.[1];
const pluginRev = revOf('tauri-plugin-haptics');
const gamepadRev = revOf('tauri-plugin-gamepad-haptics');

// The gamepad plugin's guest package (`@liminal-hq/plugin-gamepad-haptics`) lives in a subfolder of the plugin
// workspace, which a dependency on the repository cannot install. The game itself calls the plugin by raw IPC and
// does not need it; the haptics page uses the guest's own `createBackend`, `resolvePad` and `playFrames` to test the
// plugin as shipped. `GAMEPAD_HAPTICS_GUEST` names the guest's `index.ts` in a checkout of the plugin at the
// pinned commit; without one the page's "Gamepad rumble" section says the guest is missing and the rest works.
const guestEntry =
  process.env.GAMEPAD_HAPTICS_GUEST ??
  resolve(
    homedir(),
    'source/liminal-hq/tauri-plugins-workspace/plugins/gamepad-haptics/guest-js/index.ts',
  );
const guestFound = existsSync(guestEntry);

export default defineConfig({
  base: './',
  define: {
    __HAPTICS_PLUGIN_REV__: JSON.stringify(pluginRev ?? 'unknown'),
    __GAMEPAD_PLUGIN_REV__: JSON.stringify(gamepadRev ?? 'unknown'),
    __GAMEPAD_GUEST_MISSING__: JSON.stringify(!guestFound),
  },
  resolve: {
    alias: {
      '@liminal-hq/plugin-gamepad-haptics': guestFound
        ? guestEntry
        : resolve(import.meta.dirname, 'src/gamepad-guest-missing.ts'),
    },
    // The guest sits outside the workspace; it must use the one `@tauri-apps/api` the app has.
    dedupe: ['@tauri-apps/api'],
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
    fs: { allow: [resolve(import.meta.dirname, '../..'), dirname(guestEntry)] },
  },
});
