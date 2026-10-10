#!/usr/bin/env bash
# Assembles the Tauri app's frontend into apps/player/dist/.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# The player pages are built first (Vite empties dist/), then each episode is built with a relative
# base into dist/episode-N/ so it loads from the app's bundled assets. The Pages build is unchanged:
# it keeps the episode's own base, because only this script passes --base. Run `bun run build:wasm`
# first so the episode can import sim.wasm.
set -euo pipefail
cd "$(dirname "$0")/.."

bun run --cwd apps/player build
bun run --cwd episodes/episode-1 vite build --base ./ --outDir ../../apps/player/dist/episode-1 --emptyOutDir
echo "app frontend assembled in apps/player/dist/"
