#!/usr/bin/env bash
# Regenerates gen/android as the side-by-side "Lieutenant Fizz Dev" project.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# The tracked gen/android is the real app (ca.liminalhq.lieutenantfizz). A dev build needs the `.dev`
# identifier and its own launcher icon, so this deletes the project, runs `tauri android init` with
# `tauri.conf.dev.json`, re-applies the player's Android settings and stamps the dev icon. It changes
# the working tree on purpose: the caller restores gen/android afterwards (scripts/build-android-dev.sh
# does it locally; CI throws the checkout away). It runs inside a build container, after `bun install`.
set -euo pipefail
cd "$(dirname "$0")/.."

GEN="apps/player/src-tauri/gen/android"
ICONS="$PWD/assets/icon"

rm -rf "$GEN"
bun run --filter @lieutenant-fizz/player tauri android init --ci --config src-tauri/tauri.conf.dev.json
bash scripts/apply-android-settings.sh "$GEN"

# `tauri icon` has an undocumented side effect: when its -o directory resolves inside the Tauri project
# tree, it also patches the launcher icons of any initialised mobile project in place (gen/android's
# res/mipmap-*), as well as writing the requested output. The dev ribbon icon relies on that, so the
# output directory must stay under src-tauri. It is removed straight away.
MANIFEST="$(mktemp --suffix=.json)"
cat > "$MANIFEST" <<EOF
{
  "default": "$ICONS/fizz-icon-dev.svg",
  "bg_color": "#0A0A0D",
  "android_bg": "$ICONS/ic_launcher_background.svg",
  "android_fg": "$ICONS/fizz-icon-android-dev.svg",
  "android_monochrome": "$ICONS/ic_launcher_monochrome.svg"
}
EOF
bun run --filter @lieutenant-fizz/player tauri icon "$MANIFEST" -o src-tauri/icons-dev-tmp
rm -rf apps/player/src-tauri/icons-dev-tmp "$MANIFEST"

echo "dev project ready in $GEN"
