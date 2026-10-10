# Tauri spike: Episode 1 in the Android WebView

**Status: scaffolded, not yet run on a device.** This is the findings document for phase 2 of [APP.md](APP.md). The aim is to put the existing Episode 1 build, unchanged, into a Tauri v2 shell at `apps/player`, install a debug APK on a phone and measure what the WebView can do. The verdict feeds the launcher and lifecycle phases.

## How it is built

- **GitHub Actions is the default place to build.** The Android project is set up in the repository (`apps/player/src-tauri/gen/android`, tracked), and the APK is built in GitHub Actions: `gh workflow run android-apk.yml --ref <branch>`. The workflow also runs on pushes to `feat/tauri-player*` branches so it can run before it exists on `main`, and it is what builds releases. See [APP.md](APP.md#tooling-and-ci).
- **The one sanctioned local build** is `bun run build:android:dev` (`scripts/build-android-dev.sh`): it builds a `.dev` debug APK in the `tauri-dev-mobile` container, with parallelism capped (`FIZZ_DEV_JOBS`, default 4) and the heavy directories on another disk when `FIZZ_DEV_SCRATCH` is set. It restores `gen/android` afterwards and exits non-zero if it cannot. There is no local `tauri android dev`, emulator or bare Gradle run.
- **Frontend:** `bun run build:wasm && bun run build:app` assembles `apps/player/dist/`: a spike menu (`index.html`), a capability probe (`probe.html`) and the Episode 1 build under `episode-1/`, built with `--base ./` so every URL is relative. The Pages build is unchanged.
- **Probe:** `probe.html` reports the origin and secure context, user agent, pixel ratio, screen, viewport and safe-area insets, the WebGL2 renderer, the WASM fetch content type and timings, audio start, the gamepad list, and the availability of vibrate, fullscreen, orientation lock and wake lock. Buttons try each of those, and the page logs lifecycle events, `popstate` and touches, and keeps a launch counter in `localStorage`. `window.__probe` holds the whole report, and `window.__lfFrames(seconds)` (the "Idle refresh" button) records the display refresh cadence of the idle probe page. It runs no episode renderer, so it says nothing about Episode 1 frame times.
- **Vibration:** the manifest does not carry `android.permission.VIBRATE` yet. The haptics plugin adds it from its own `build.rs` once the app depends on that plugin, so the probe's vibrate test is expected to report no permission until then.
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
| E6 | Audio start (running after the first gesture, no crackle in Enhanced) | | | | |
| E7 | Gamepad (standard mapping, key events only, or nothing) | | | | |
| E8 | Touch (same as Chrome, no stuck buttons) | | | | |
| E9 | Safe areas and viewport (non-zero insets on the cutout side) | | | | |
| E10 | Vibrate (needs the haptics plugin's permission) | | | | |
| E11 | Fullscreen, orientation and wake lock | | | | |
| E12a | Persistence across restarts and a reboot | | | | |
| E12b | Persistence across in-place updates (needs the stable debug key) | | | | |
| E13 | Back (does it fire `popstate` or close the app) | | | | |
| E14 | Lifecycle (pause on hide, clean resume, no context loss) | | | | |
| E15 | Candidate CSP | | | | |
| E16 | Remote dev loop | | | | |
| E17 | Desktop WebKitGTK smoke (optional) | | | | |

**Go** if E1 to E5 pass, E6 works after a tap, E8 matches Chrome and E12a passes. **No-go** if WebGL2 is missing or under 45 fps where Chrome manages 60, or storage does not persist.

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
