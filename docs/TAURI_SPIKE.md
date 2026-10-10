# Tauri spike: Episode 1 in the Android WebView

**Status: built and run on a device once; the measurements are still to do.** The dev APK has been built in the `tauri-dev-mobile` container and installed on a Pixel 8 Pro, and the first device run is recorded under "Findings from the first device run". The GitHub Actions workflow (`android-apk.yml`) has not been run yet, and the results table is still empty. This is the findings document for phase 2 of [APP.md](APP.md). The aim is to put the existing Episode 1 build, unchanged, into a Tauri v2 shell at `apps/player`, install a debug APK on a phone and measure what the WebView can do. The verdict feeds the launcher and lifecycle phases.

## How it is built

- **CI is the default build.** The real Android project is tracked in `apps/player/src-tauri/gen/android`. The APK is built in GitHub Actions: `gh workflow run android-apk.yml --ref <branch>`. The one sanctioned local build is `bun run build:android:dev` (`scripts/build-android-dev.sh`): it runs the same steps in the `tauri-dev-mobile` container, with parallelism capped (`FIZZ_DEV_JOBS`, default 4) and the heavy directories under `FIZZ_DEV_SCRATCH` (a host directory, for example on another disk). No emulator, `tauri android dev` or bare Gradle run is used, and the script exits non-zero if it cannot restore `gen/android`. The workflow also runs on pushes to `feat/tauri-player*` branches so it can run before it exists on `main`. See [APP.md](APP.md#tooling-and-ci).
- **Workflow details:** `android-apk.yml` runs in the `tauri-ci-mobile` image, builds the WASM and the app frontend, regenerates `gen/android` as the dev app (`scripts/prepare-android-dev.sh`: `tauri android init` with `tauri.conf.dev.json`, the Android settings re-applied, the dev ribbon icon stamped), then runs `bun run android:build --debug --target aarch64 --apk --config src-tauri/tauri.conf.dev.json` and uploads `fizz-player-debug-apk` (14 days). The result is the side-by-side `ca.liminalhq.lieutenantfizz.dev` app, labelled 'Lieutenant Fizz Dev'. With the `ANDROID_DEBUG_KEYSTORE_BASE64` secret the debug key is stable and `adb install -r` updates in place; without it each build has a throwaway key and the previous install must be removed first. The `publish_draft_release` input also attaches the APK to a draft pre-release for a direct phone download.
- **Frontend:** `bun run build:wasm && bun run build:app` assembles `apps/player/dist/`: a spike menu (`index.html`), a capability probe (`probe.html`) and the Episode 1 build under `episode-1/`, built with `--base ./` so every URL is relative. The Pages build is unchanged.
- **Probe:** `probe.html` reports the origin and secure context, user agent, pixel ratio, screen, viewport and safe-area insets, the WebGL2 renderer, the WASM fetch content type and timings, audio start, the gamepad list, and the availability of vibrate, fullscreen, orientation lock and wake lock, the root font size in px, `__TAURI_INTERNALS__`, and the `AudioContext` state before any gesture. Buttons try each of those, and the page logs lifecycle events, `popstate` and touches, and keeps a launch counter in `localStorage`. `window.__probe` holds the whole report, and `window.__lfFrames(seconds)` (the "Idle refresh" button) records the display refresh cadence of the idle probe page. It runs no episode renderer, so it says nothing about Episode 1 frame times.
- **Vibration:** the app depends on `tauri-plugin-phone-haptics`, from crates.io (version 0.1.0 in `apps/player/src-tauri/Cargo.toml`). The plugin's `build.rs` adds `android.permission.VIBRATE` to the manifest and the capability file grants `phone-haptics:default`, so the probe's `navigator.vibrate` test no longer needs a permission added by hand.
- **Haptics page:** `haptics.html` (linked from the spike menu) is for feeling the game's haptics on the phone and for smoke-testing the plugin. The header shows the plugin version it was built with, the device, Android release and API level, WebView version and the plugin's `capabilities()` (vibrator, amplitude control, supported primitives, envelope, `topTier`, touch feedback). Master strength (Light, Medium, Strong, as in the game's settings) and a tier cap (Auto, 0 to 4; the cap also goes to the plugin as `maxTier`) apply to the cue buttons. Below are a button for every cue in the game's real table (grouped as the haptics lab groups them), which plays the real pattern through the plugin backend; the six UI-lane kinds through `plugin:phone-haptics|ui`; and the plugin's smoke cases. Cases 1 to 8 are raw IPC and case 9 goes through the JS guest `window.__TAURI__.phoneHaptics` (the page says so when `withGlobalTauri` is off, as it is in the release config). Case 4 is adapted to the default duration limit (a step 50 ms before `maxDurationMs`), because the plan's `maxDurationMs: 100` conflicts with case 1. Each log line shows the request, the tier compiled, the plugin's tier, downgrade reason or rejection text and, for a smoke case, an as-expected or CHECK verdict. "Copy log as JSON" puts the device, API level, plugin version, capabilities and every request and result on the clipboard (or in a box above the log if the clipboard refuses) to hand to the plugin author.
- **Fast iteration:** the menu links to `http://localhost:5173/`. With `adb reverse tcp:5173 tcp:5173` and `bun run dev:phone`, the WebView loads the live Vite server.
- **Automation:** debug builds include `tauri-plugin-mcp-bridge` (pinned to 0.12; 0.13 does not compile for Android). With `adb forward tcp:9223 tcp:9223` the MCP tools can run the probe, the idle refresh recorder, screenshots and logs.

## Measurement protocol

```sh
gh run download <run> -n fizz-player-debug-apk -D ~/fizz-apks/<run>
adb install -r ~/fizz-apks/<run>/*.apk      # uninstall first only if the debug key changed
adb shell monkey -p ca.liminalhq.lieutenantfizz.dev -c android.intent.category.LAUNCHER 1
adb forward tcp:9223 tcp:9223               # MCP bridge
adb reverse tcp:5173 tcp:5173               # Remote dev loop
```

`chrome://inspect` on desktop Chrome attaches to the debug WebView. Repeat the key experiments in Chrome and Firefox on the same phone for a baseline.

## Reading the logs

Rust's `log` records and the page's `console.*` calls, uncaught errors and unhandled rejections go through `tauri-plugin-log` (`apps/player/src-tauri/src/lib.rs`; the permission is in `capabilities/logging.json`, apart from `default.json`). Every line is `[local time with UTC offset][LEVEL][target] message`, the format Threshold and Waypoint use. Debug builds log at Debug and release builds at Info (`jni` is held to Warn, `tao` to Info, and the debug MCP bridge's websocket crates to Warn). The first line of a run is the app name, version, identifier and platform.

Page lines come from `packages/engine/src/tauri-log.ts`, started by the Episode 1 entry and the probe and haptics pages, only inside the app, from a tiny `log-boot` module each page imports before its others (ES modules evaluate in import order, so an error thrown while the page's other modules load is logged too), and carry the page as a prefix (`[episode-1]`, `[probe]`, `[haptics]`) and the call site as a trailing `(file:line)`. `console.log` is written at Info. The menu page has no script of its own, so it logs nothing.

- **Desktop terminal:** the stdout target prints every line to the terminal that started the app.
- **Log file:** a file in the app's log directory, rotated at 40 KB (the plugin's default size), keeping one dated old file (`RotationStrategy::KeepSome(1)`, set in `lib.rs`; the plugin's own default, `KeepOne`, deletes the file at the limit and keeps nothing). Linux: `$XDG_DATA_HOME/ca.liminalhq.lieutenantfizz/logs` or `~/.local/share/ca.liminalhq.lieutenantfizz/logs`; macOS: `~/Library/Logs/ca.liminalhq.lieutenantfizz`; Windows: `%LOCALAPPDATA%\ca.liminalhq.lieutenantfizz\logs`; Android: `/data/data/ca.liminalhq.lieutenantfizz/files/logs` (private to the app, so read it with `adb shell run-as <id> cat files/logs/<file>` on a debug build, or just use logcat). The file is named after the app. The dev build uses `.dev` ids and a different product name.
- **Devtools console:** Rust's records are also shown in the WebView's console (the WebView target; the page's own output is already there, so it is not echoed). Use `chrome://inspect` on Android or the desktop's inspector.
- **Android logcat:** the stdout target goes to logcat through `android_logger`, with the record's target as the tag: Rust lines are tagged `lieutenant_fizz_player_lib` (or the crate's module path) and page lines `webview::...` (the plugin appends the caller's location to the tag). An exact tag filter such as `adb logcat -s webview` will miss the suffixed tags, so filter by process instead: `adb logcat --pid=$(adb shell pidof ca.liminalhq.lieutenantfizz)` (use `ca.liminalhq.lieutenantfizz.dev` for the dev build), or `adb logcat | grep -E 'lieutenant_fizz|webview'`. Verified on a Pixel 8 Pro: the startup line and the page's console lines, prefixed `[episode-1]`, reached `adb logcat` in the unified format. The log file and the rotation have not been checked on a device.

## Checking persistence on the phone

In the app, persistence means the `tauri-plugin-store` file `lf-data.json`, not the WebView's `localStorage`. The probe and the game open it through the same storage adapter.

- Open the probe and press Run all. `persistence.backend` must be `tauri` (`local` or `memory` means the store plugin did not load: check the capability `store:default` and `adb logcat` for the warning "The tauri storage is unavailable"), with `launches` and `firstSeen`.
- Force-stop the app (`adb shell am force-stop ca.liminalhq.lieutenantfizz.dev`), start it and run the probe again: `launches` goes up by one and `firstSeen` is unchanged. Repeat after a reboot (E12a) and after `adb install -r` of a newer build (E12b).
- In the game, save to a slot, press Home so the app goes to the background (this flushes the store), swipe it away, start it and check Load game. In a debug page (`?debug`), `__lf.debugState.storage` is `tauri`.
- The file is under the app's data directory, `files/lf-data.json` on a debug build: `adb shell run-as ca.liminalhq.lieutenantfizz.dev cat files/lf-data.json` (the path can differ by Tauri version; `find` for the name if it is not there).

## Setup

To fill in: workflow run, commit, Tauri and CLI versions, NDK version, APK size, CI time; phone, Android version, WebView version, display size and refresh rate; controller; headphones; origin and secure context.

## Results

| E | Area | Tauri WebView | Chrome | Firefox | Verdict |
| --- | --- | --- | --- | --- | --- |
| E1 | Boot and environment (title within 3 s, secure context true) | | | | |
| E2 | WebGL2 (hardware GPU, not SwiftShader) | | | | |
| E3 | WASM (`application/wasm`, streaming, under 150 ms) | | | | |
| E4 | Episode 1 frame rate, measured on the episode page with `?debug` (median at least 58 fps at 60 Hz, p95 at most 20 ms, under 1% over 33 ms) | | | | |
| E4i | Idle display refresh from the probe page (reports the refresh rate the WebView delivers with no renderer; context for E4, not a pass or fail) | | | | |
| E5 | Pixel scale (same `s`, `k` and tiles as Chrome) | | | | |
| E6 | Audio start (running before any gesture: the probe's `audioBeforeGesture` is `running` and the game's title music plays at boot in the app; no crackle in Enhanced; a pass that needs a tap first is a fail) | | | | |
| E7 | Gamepad (standard mapping, key events only, or nothing) | | | | |
| E8 | Touch (same as Chrome, no stuck buttons) | | | | |
| E9 | Safe areas and viewport (non-zero insets on the cutout side) | | | | |
| E10 | Vibrate (the haptics page: cues play and the smoke cases match; copy the log) | | | | |
| E11 | Fullscreen, orientation and wake lock | | | | |
| E12a | Persistence across restarts and a reboot (the store file, `persistence.backend` is `tauri`) | | | | |
| E12b | Persistence across in-place updates (the store file, needs the stable debug key) | | | | |
| E13 | Back (does it fire `popstate` or close the app) | | | | |
| E14 | Lifecycle (pause on hide, clean resume, no context loss) | | | | |
| E15 | Candidate CSP | | | | |
| E16 | Remote dev loop | | | | |
| E17 | Desktop WebKitGTK smoke (optional) | | | | |

**Go** if E1 to E5 pass, E6 runs before any gesture, E8 matches Chrome and E12a passes. **No-go** if WebGL2 is missing or under 45 fps where Chrome manages 60, or storage does not persist.

## Findings from the first device run

Pixel 8 Pro, Android 17, WebView 153, system font scale 1.15.

- **Font scale (bug, fixed):** the Android WebView applied the system font scale to all text, so `getComputedStyle(document.documentElement).fontSize` was `18.4px` instead of `16px`, and the touch button labels computed to 37.95 px instead of 33 px. The labels overflowed their circles, the pause hint wrapped into the map and menu rows crowded. Chrome and Firefox on the same phone were fine. The cause is the WebView's `textZoom`, which follows the system font scale by default. The fix is `webView.settings.textZoom = 100` in `MainActivity.onWebViewCreate`, applied by `scripts/apply-android-settings.sh`. The game is pixel-art with its own px layout and Text size option, so it must not scale. The probe now reports `rootFontSizePx`; expect 16.
- **Audio:** a browser needs a first tap before audio starts. The app sets `mediaPlaybackRequiresUserGesture = false` in the same hook so it can start right away, and the game creates its context at boot in the app (the web build still waits for a gesture). The probe creates an `AudioContext` at load and reports `audioBeforeGesture` after 500 ms; expect `running`.
- **Safe area:** `env(safe-area-inset-left)` computed to `60px` on the cutout side, so the insets work in the WebView.
- **WASM:** served as `application/wasm`.
- **APIs present:** vibrate, wake lock, fullscreen and orientation lock are all available in the WebView.
- **To confirm on the next run:** `rootFontSizePx` is 16, `audioBeforeGesture` is `running`, and `window.__TAURI_INTERNALS__` is present (`tauriInternals` and `tauriInternalsType` in the environment section).

## Frame timing

Measure E4 on the episode, not on the probe page. Open Episode 1 with `?debug` (for example `episode-1/index.html?debug&level=0`), play for at least 30 seconds, call `__lf.debugPerfReset()` after any change of setting, then read `__lf.debugState.perf`: `p50` and `p95` are milliseconds per frame, `long` counts frames over 25 ms and `frames` counts frames since the reset (see [MOBILE_PLAN.md](MOBILE_PLAN.md), "Reading frame times"). Record the idle refresh from the probe page separately as E4i, so a low E4 can be told apart from a display that refreshes slowly.

To fill in: results.

## Pixel scale

To fill in.

## Screenshots

To fill in.

## Decisions this settles

To fill in: origin scheme (keep `http://tauri.localhost` if it is a secure context; changing it later orphans saved `localStorage`), WASM serving, fullscreen and orientation (native or web), gamepad route, haptics route, Back, CSP.

## Follow-ups for APP.md phases 3 to 7

To fill in.

## Could not verify

To fill in.
