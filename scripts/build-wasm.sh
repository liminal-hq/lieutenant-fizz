#!/usr/bin/env bash
# Builds the Episode 1 WASM sim into episodes/episode-1/src/wasm/sim.wasm.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# Raw C-ABI exports (no wasm-bindgen needed); Vite imports the output as a URL.
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE="${WASM_PROFILE:-release}"
if [ "$PROFILE" = "release" ]; then FLAG="--release"; else FLAG=""; fi

cargo build --target wasm32-unknown-unknown $FLAG -p lf-episode-1

mkdir -p episodes/episode-1/src/wasm
cp "target/wasm32-unknown-unknown/$PROFILE/lf_episode_1.wasm" episodes/episode-1/src/wasm/sim.wasm

# Optional size pass when binaryen is installed.
if command -v wasm-opt >/dev/null 2>&1 && [ "$PROFILE" = "release" ]; then
  wasm-opt -Oz --enable-bulk-memory --enable-sign-ext --enable-nontrapping-float-to-int \
    episodes/episode-1/src/wasm/sim.wasm -o episodes/episode-1/src/wasm/sim.wasm
fi
echo "sim.wasm: $(wc -c < episodes/episode-1/src/wasm/sim.wasm) bytes"
