#!/usr/bin/env bash
# Builds an isolated "Lieutenant Fizz Dev" debug APK for side-by-side testing.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# Builds a debug APK with the application id ca.liminalhq.lieutenantfizz.dev, installable beside a real
# install, inside the shared tauri-dev-mobile container so no local Android SDK or NDK setup is needed.
# gen/android is tracked for the real app's identifier, so this regenerates it for the `.dev` identifier
# (scripts/prepare-android-dev.sh, which GitHub Actions runs too), builds, then always restores it to
# the committed state afterwards, even on failure. The dev build carries a distinct launcher icon (the
# real mark plus a small "Dev" ribbon), so it is never mistaken for the real app on a home screen.
#
# GitHub Actions (android-apk.yml) is the default way to get an APK. This script is the one sanctioned
# local path, so it keeps the machine's load down: parallelism is capped (FIZZ_DEV_JOBS, default 4) and
# the heavy directories can live on another disk (FIZZ_DEV_SCRATCH).
#
# Builds a single-ABI APK by default (aarch64, virtually every modern Android phone) to keep the install
# small; a universal all-ABI debug build easily runs 800 MB or more unstripped. Override with:
#   FIZZ_DEV_TARGET=universal scripts/build-android-dev.sh
#
# Other settings:
#   FIZZ_DEV_APK_DIR   where the APK is copied (default ~/fizz-dev-builds)
#   FIZZ_DEV_JOBS      cargo jobs, Gradle workers and container CPUs (default 4)
#   FIZZ_DEV_SCRATCH   a host directory for the Rust build output, the cargo registry, the Gradle cache and
#                      the SDK extras (for example a games disk instead of /home). It is created if
#                      needed. Without it these live in Docker volumes.
#
# The Android debug keystore is persisted in its own volume. Without it each `docker run --rm` would
# generate a new random debug key, so every build would be signed differently and `adb install -r` over
# a previous install would fail with a signature mismatch instead of updating in place.
#
# The Android SDK directory is persisted too: the image bakes in the Build-Tools and Platform versions
# the project needs, but AGP's dependency checks can still reach for an older baseline that is not in the
# image, and without a persistent directory `--rm` throws the download away on every run.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="ghcr.io/liminal-hq/tauri-dev-mobile:latest"
OUT_DIR="${FIZZ_DEV_APK_DIR:-$HOME/fizz-dev-builds}"
GEN_ANDROID="apps/player/src-tauri/gen/android"
TARGET="${FIZZ_DEV_TARGET:-aarch64}"
JOBS="${FIZZ_DEV_JOBS:-4}"
SCRATCH="${FIZZ_DEV_SCRATCH:-}"

if [ -t 1 ]; then
  COLOUR_RESET=$'\033[0m'
  COLOUR_GREEN=$'\033[32m'
  COLOUR_RED=$'\033[31m'
  COLOUR_CYAN=$'\033[36m'
  COLOUR_YELLOW=$'\033[33m'
else
  COLOUR_RESET=""
  COLOUR_GREEN=""
  COLOUR_RED=""
  COLOUR_CYAN=""
  COLOUR_YELLOW=""
fi

restore_gen_android() {
  echo "${COLOUR_YELLOW}Restoring ${GEN_ANDROID} to its committed (real-app) state...${COLOUR_RESET}"
  git -C "$REPO_ROOT" checkout -- "$GEN_ANDROID" 2>/dev/null || true
  git -C "$REPO_ROOT" clean -fdx "$GEN_ANDROID" >/dev/null 2>&1 || true
}

# The restore below force-resets gen/android to HEAD, which would silently discard any real uncommitted
# work under that tree, not just the regeneration. Refuse to run rather than risk losing an edit.
if [ -n "$(git -C "$REPO_ROOT" status --porcelain -- "$GEN_ANDROID")" ]; then
  echo "${COLOUR_RED}${GEN_ANDROID} has uncommitted changes: commit, stash or discard them before running this script.${COLOUR_RESET}" >&2
  echo "This script force-restores that directory to HEAD when it finishes, which would discard them." >&2
  exit 1
fi

trap restore_gen_android EXIT

mkdir -p "$OUT_DIR"

if [ "$TARGET" = "universal" ]; then
  BUILD_TARGET_ARG=""
  RUST_TARGETS="aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android"
else
  BUILD_TARGET_ARG="--target $TARGET"
  RUST_TARGETS="$TARGET-linux-android"
fi

# Caches: Docker volumes by default, host directories under FIZZ_DEV_SCRATCH when it is set.
CACHE_ARGS=(-e "CARGO_BUILD_JOBS=$JOBS" -e "GRADLE_OPTS=-Dorg.gradle.workers.max=$JOBS" --cpus "$JOBS")
BUILD_ENV=""
if [ -n "$SCRATCH" ]; then
  mkdir -p "$SCRATCH/cargo-target" "$SCRATCH/cargo-registry" "$SCRATCH/gradle"
  CACHE_ARGS+=(
    -v "$SCRATCH/cargo-target:/scratch/cargo-target"
    -v "$SCRATCH/cargo-registry:/home/vscode/.cargo/registry"
    -v "$SCRATCH/gradle:/home/vscode/.gradle"
    # The SDK stays on a named volume: Docker fills it from the image on first use, while a host
    # directory would start empty and hide the image's SDK and NDK.
    -v fizz-android-sdk-extras:/home/vscode/Android/Sdk
  )
  # Only the Android build moves: `build:wasm` copies from the repository's own target directory.
  BUILD_ENV="CARGO_TARGET_DIR=/scratch/cargo-target"
else
  CACHE_ARGS+=(
    -v fizz-android-gradle-cache:/home/vscode/.gradle
    -v fizz-android-cargo-cache:/home/vscode/.cargo/registry
    -v fizz-android-sdk-extras:/home/vscode/Android/Sdk
  )
fi

docker run --rm \
  -v "$REPO_ROOT:/workspace" \
  -v fizz-android-keystore:/home/vscode/.android \
  "${CACHE_ARGS[@]}" \
  -w /workspace \
  "$IMAGE" \
  bash -c "
    set -e
    rustup target add $RUST_TARGETS
    bun install --frozen-lockfile
    bun run build:wasm
    bun run build:app
    bash scripts/prepare-android-dev.sh
    $BUILD_ENV bun run android:build --debug $BUILD_TARGET_ARG --apk --config src-tauri/tauri.conf.dev.json
  " < /dev/null

APK_SRC="$(find "$REPO_ROOT/$GEN_ANDROID/app/build/outputs/apk" -type f -name '*.apk' | head -1)"
if [ -z "$APK_SRC" ] || [ ! -f "$APK_SRC" ]; then
  echo "${COLOUR_RED}Build reported success, but no debug APK was found under:${COLOUR_RESET} $REPO_ROOT/$GEN_ANDROID/app/build/outputs/apk" >&2
  exit 1
fi

APK_DEST="$OUT_DIR/fizz-dev-$(date +%Y%m%d-%H%M).apk"
cp "$APK_SRC" "$APK_DEST"
echo "${COLOUR_GREEN}Dev APK ready:${COLOUR_RESET} $APK_DEST"

if command -v adb >/dev/null 2>&1 && adb devices 2>/dev/null | grep -q "device$"; then
  echo "${COLOUR_CYAN}Device detected, installing...${COLOUR_RESET}"
  adb install -r "$APK_DEST"
else
  echo "${COLOUR_YELLOW}No device detected. Install manually with:${COLOUR_RESET} adb install $APK_DEST"
fi
