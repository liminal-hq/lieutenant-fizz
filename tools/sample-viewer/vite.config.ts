// Vite config for the play sample viewer, a developer tool that is not part of any shipped build.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { defineConfig } from 'vite';

// A developer tool: it is served by `bun run dev:viewer` or opened from `dist`, and it is never part of the
// game's build or the site. It reads zips in the page and sends nothing anywhere.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5175 },
  preview: { port: 4175 },
});
