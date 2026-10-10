# The Tauri app and the launcher

**Status: spike scaffolded.** `apps/player` exists as a spike: a menu, a capability probe and the Episode 1 build with a relative base, in a Tauri v2 shell with a tracked Android project and the app icons (see [TAURI_SPIKE.md](TAURI_SPIKE.md)); the launcher, shared options and everything else below are still planned. This document is the working plan for an Android and desktop app that plays every episode, and for the launcher that picks the episode. It follows the Claude Design export in `design/` (`Launcher.dc.html`, `Mobile Design.dc.html`, `App Icons.dc.html`) and is iterated in pull requests. `docs/STATUS.md` links here. Touch controls, the phone layout and haptics are in [MOBILE.md](MOBILE.md).

## Goals
- **One app for the whole series.** Episodes share the engine and are small (the art is generated in code, and the Episode 1 WASM is about 65 kB gzipped), so every episode is bundled in one install: one icon, one Settings screen, one place for saves.
- **A shared launcher that replaces each episode's title screen** when an episode is started from the app. Played from the website, an episode keeps its own title screen (and on a phone browser, the mobile title in MOBILE.md).
- **Reuse the Liminal HQ app pattern.** Cadence and Threshold are Tauri v2 Android apps with a React frontend, an `apps/<name>/src-tauri` layout, a tracked `gen/android` project and a side-by-side dev build. Fizz follows the same shape.

## Layout
```
apps/
└── player/                      the Tauri app
    ├── package.json  index.html  vite.config.ts
    ├── src/                     the React launcher
    │   ├── main.tsx
    │   ├── routes/              Carousel (episodes + App settings), Settings, Saves, About
    │   ├── components/          the game's menu language: scrim, stepped plate, soda cursor
    │   └── lib/                 episodes.ts, saves.ts, options.ts, launch.ts
    └── src-tauri/               Cargo.toml, build.rs, tauri.conf.json (+ tauri.conf.dev.json),
                                 capabilities/, icons/, src/, gen/android (tracked)
plugins/                         Tauri plugins written in this repo, if any (see The Tauri shell)
assets/icon/                     icon sources (see Icon)
```
- The app depends on the engine and on the episode builds. Nothing in `crates/`, `packages/` or `episodes/` imports from `apps/`.
- `site/` stays static HTML: it must work without JavaScript, carry the social card and load fast. The launcher and the website share `site/episodes.json` and the Fizz fonts, not code.

## The launcher design
The launcher is a game-style screen, not a web page: the same menu language as the game (a soft scrim over art, a stepped plate that slowly cycles colour, a can of cream soda as the cursor), set in Fizz. Two directions were designed and **1a was chosen**: the launcher is the episode's title screen, so there is one layer and you go straight into play. The hub that hands off to each episode's own title menu (1b) was not chosen.

### The carousel
- **Episode stops.** A header reads `← Episode 1 · The Cocoa Caper →` with a pip per stop. Swipe the demo or tap the arrows to change stop, and the menu below follows. Each episode stop stands in for that episode's own title screen.
- **Menu rows:** Continue (with the source on the right, such as "Autosave" or "Slot 2"), New game, Load game, Options. An episode with no saves leaves out Continue.
- **Touch:** a tap moves the cursor to a row and chooses it, as on any Android list (the artboards show select-then-choose, which is replaced to match Android). **Keyboard and pad:** ↑↓ select, ←→ change episode or value, Enter plays, Esc goes back.
- **Behind the menu:** one tileable 640×144 demo strip per episode (sky, hills, crystals, platforms, pickups) with Ben running across it. It is pre-drawn sprite art, generated from the game's sprites (`design/melting/launcher-art.js` is the prototype of it), so **the launcher loads no WASM and no game code**.
- **Footer:** a hint bar in the same keycap style as the game's.

### The App settings stop
The last stop is App settings, with three rows:
- **Settings:** Sound, Display and Controls tabs, with a Reset button. The Sound tab carries Style (Classic or Enhanced, starting on Auto), Music and Effects, the same three settings as the game's Options > Sound screen (which also has a Sound lab switch; the app does not) (later also Night mode and Mono, 8c.5).
- **Saves:** export every episode's saves to one file and import them back. The file is `.fizzsave`, a versioned JSON bundle of each episode's autosave and slots, and is written through the Tauri dialog and fs plugins in the app.
- **About:** version, licences (the Fizz font is OFL-1.1), links. Tapping Version seven times unlocks the engine panel.

### Options model: global plus per-episode overrides
- Options are shared, and each row can be set for **All episodes** or for **Episode N**. A value that is overridden for one episode is marked `*`.
- Options opened from inside an episode get the per-row scope switch. Options at the launcher stop are global (there is no switch on the App settings stop).
- **Reset** needs a second tap within three seconds. On an episode it clears that episode's overrides, and in App settings it restores every default.
- **Storage (proposed):** one shared options key holds the global values, and each episode keeps a sparse overrides object. The current `lf-ep1-options-v1` is migrated into the shared key, with no overrides.
- **Touch settings** (size, opacity, hand, haptic strength and moved controls) belong to the device, not to an episode: they are in `lf-touch-v1`, reached on a touch device from Options > Touch controls (the Move controls row there is the drag editor) and, for the haptic strength, Options > Haptics, and fold into the shared key with the launcher work (the same migration as `lf-ep1-options-v1`). **Rumble** (the controller's strength, Off to Strong) and the Haptics lab switch are stored in `lf-ep1-options-v1` as `rumble` and `hapticsLab`, so they move with the options. The launcher's Settings > Controls tab shows the same rows.

### Desktop
The desktop window (1280×720) is the same carousel with a frameless title bar. Hovering a row selects it and a click chooses it, and Tab switches section. Desktop swaps the touch settings for its own:
- **Display** adds **Window** (windowed, fullscreen or borderless) through the Tauri window APIs, with F11 for fullscreen.
- Haptics becomes **Rumble**, driven by the same cue table through the controller (see [MOBILE.md](MOBILE.md#haptics)). On the web it is the Rumble row of Options > Haptics, shown once a pad that can rumble has been seen; the desktop app shows it from the start.
- **Controls** has keyboard layouts and shows the connected controller.
- App settings gets a **Quit** row.
- The fullscreen design (3840×2160) drops the title bar, so the launcher gets the whole 16:9 panel and the art scales up. It is shown at 4.8×, which is not a whole number: see "Pixel scale in the launcher" under Open questions.

#### Window, fullscreen and Quit
Built for the desktop app only; the web, Android and iOS builds have none of it. The page finds out where it runs through `HostBackend` (`packages/engine/src/host.ts`): `createHostBackend()` reads `__TAURI_INTERNALS__` (or `isTauri`), the user agent and `navigator.maxTouchPoints` (an iPad in desktop content mode reports a Macintosh user agent, so a Macintosh agent with a touch screen counts as iOS), and gives `web`, `tauri-desktop`, `tauri-android` or `tauri-ios`. `quit()` is defined only for `tauri-desktop`, and `main.ts` hands the backend to the game (`GameOptions.hostBackend`) the way it hands over storage.
- **Fullscreen** is the native window's. `nativeFullscreenBackend` (`packages/engine/src/native-fullscreen.ts`) implements `FullscreenBackend` over `getCurrentWindow().setFullscreen()` and `isFullscreen()`, follows the window's resize events for `onChange`, and sets `escapeCaptured` to true, so the Esc rules are the ones in `docs/MOBILE_PLAN.md` ("Built in the Esc and Pause keys in fullscreen"): the first Esc in a level pauses, Esc at the top of the pause menu or the title leaves fullscreen. The Tauri window API is imported lazily, so the web bundle is unchanged. The web Fullscreen button is hidden in the app (it is a browser-page control); `F` and `F11` toggle the window instead, and the hint bar and Controls table list `F`.
- **Options > Display > Fullscreen** appears in the desktop app with the same Auto, On and Off values, saved as `fullscreen`. It is read once, when the app starts: **On** starts the window fullscreen, **Off** never does, and **Auto** leaves the window as it opens (windowed), because a desktop has no "touch device" rule to follow. `?fullscreen` and `?fullscreen=off` still win over the saved choice. Changing the row does not move the window; it applies the next time the app starts. The row does not appear on the web, where it governs the browser's automatic request on a tap, or on Android, which is always fullscreen natively.
- **Quit game** is the last row of the title menu and the pause menu, shown only when `host.quit` exists, so never on the web, Android or iOS (a page cannot close its tab; Android leaves a game with Back and Home, and the predictive-back plugin handles Back at the title). It leaves fullscreen first and writes the store file out before closing. The title quits on one tap. The pause menu asks twice so a stray tap does not close a game with unsaved progress: the first tap arms the row, which then reads `Quit game  Tap again`, and the second within three seconds (the same `RESET_ARM_MS` as Reset on the Sound and Touch controls screens) quits; moving the selection, tapping another row, leaving the pause menu (Resume, a sub-screen, reopening it) or waiting disarms it. Esc and the Pause key keep their meaning and never quit.
- **The quit command** is a small app-defined Rust command in `apps/player/src-tauri/src/lib.rs`, `quit`, that calls `app.exit(0)`, invoked as `invoke('quit')`. An app-defined command needs no capability entry, so it widens nothing; the process plugin would add a crate and an `allow-exit` permission any page script could use. The capability file adds only `core:window:allow-set-fullscreen` and `core:window:allow-is-fullscreen`.
- **Trying it without the app:** `?debug&host=fake-desktop` pretends to be the desktop app with a window that has no OS behind it, and counts Quit game in `window.__lfQuits` instead of closing the page. `e2e/desktop-host.spec.ts` and `e2e/touch-desktop-host.spec.ts` use it. Not run in the real app: the window API, the `quit` command and the F11 key against a window manager have only been type-checked and built (`cargo check`), not exercised.

### Settings in scope
The designs show settings the game does not have today. In scope for the first app release:
- **Pixels: Sharp or Soft.** Sharp keeps whole pixels and shows a slightly taller view (more of the level) instead of bars. Soft ("Fill") stretches to the edges, a little soft. Touch defaults to Sharp and desktop to Soft; until the option is built, `?pixels=sharp|soft` sets it. A later display settings slice (6b in `docs/MOBILE_PLAN.md`) adds Auto, a render-scale step for slower GPUs and CPUs, and the choice on desktop.
- **Desktop window mode** and **controller rumble**, as above.
- **Scanlines** (a CRT scanline overlay) and **Screen shake** (on or off). Both are new presentation features, and Screen shake must stay out of the sim.

Not in scope for now: the **Language** row (the game has no localisation) and **V-sync** (a WebView cannot control it; a frame cap would be the nearest thing).

## Launching an episode
The launcher navigates the WebView to the episode's own page with a launch contract in the URL, for example `episode-1/index.html?launch=continue`. Each episode's `main.ts` reads it through a small `parseLaunch()` in `packages/engine`.
- **Values:** `continue` (the newest save, or the one the Continue row named), `new`, or `load` followed by a slot, matching the carousel's rows.
- **Embedded mode:** `Game.start` skips the title screen and goes straight to the requested start. "Quit to title" in the pause menu becomes "Back to launcher" and navigates to `returnTo`.
- **Normal mode:** with no launch parameters nothing changes, so the website's Play button still opens the episode's own title screen.
- Other ways to launch were considered and rejected for now: mounting the episode inside the launcher (needs a `mount`/`unmount` contract and careful WebGL and audio cleanup) and an iframe (focus, audio unlock, fullscreen and gamepad all get awkward).

## Shared storage
- **Where it lives:** in the app, every `lf-*` key (saves, options, touch settings) is kept in the `tauri-plugin-store` file `lf-data.json` in the app data directory, which the OS does not evict and which also suits desktop. On the web it stays in `localStorage`. The game talks to a storage adapter (`KeyValueStorage`, see ENGINE_SPEC section 4.4) and the entry point picks the backend before the game starts. The app starts with an empty store; nothing is copied over from an earlier `localStorage`.
- **Options:** see the options model above.
- **Saves** stay per episode (`lf-ep1-save-v1` and `lf-ep1-slot-1…4`). The launcher reads their metadata (location, lives, score, time played, date) as plain JSON, so Load game shows text rows such as "Slot 1 · Lives 4 · 8,150 pts · 0:41 played". The design has no thumbnails in the launcher, so no save-format change is needed for it.

## The Tauri shell
- The sim stays WASM inside the WebView. Calling a native sim over IPC every frame would cost more than it saves.
- **Plugins:** `predictive-back` (from Cadence and Threshold) for the Back gesture; it calls `Game.back()`, which does what Back means on the screen showing (the same rules the browser's Back button follows in fullscreen or installed mode, via `BackGuard`), and the haptics plugin once it has the upgrade in [MOBILE.md](MOBILE.md#haptics). The haptics plugin lives in `haptics-lab-app` today. The plan is to move it into `tauri-plugins-workspace` and consume it as a versioned dependency, so the lab and Fizz share one source. A `plugins/` folder here is only for plugins authored in this repo.
- **Android project:** orientation lock (landscape) and fullscreen are native Android settings, not Tauri plugins, so they live in the tracked `src-tauri/gen/android`: `screenOrientation="sensorLandscape"` on the activity, a fullscreen theme with the display cutout in `shortEdges` mode, and `MainActivity` hiding the system bars (immersive, transient bars on swipe). `compileSdk` and `targetSdk` are 36 (the template says 37) and `minSdk` is 26. The tracked project is a fresh `tauri android init` for the real identifier plus `scripts/apply-android-settings.sh`, which makes those edits idempotently and fails if an anchor in the generated files has moved; `init` regenerates the files, so every regeneration (the dev build) runs it again.
- **Native WebView settings:** `MainActivity` overrides `WryActivity.onWebViewCreate(webView)` (Wry calls it from `setWebView` once the WebView exists; `TauriActivity` does not override it) and sets `settings.textZoom = 100` and `settings.mediaPlaybackRequiresUserGesture = false`. The Android WebView applies the system font scale to all text by default, unlike Chrome and Firefox on the same phone, which breaks the pixel-art layout; the game has its own Text size option, so it must not scale. The second setting lets audio start right away in the app, without the first tap a browser needs; the game then creates and resumes its `AudioContext` at boot when it runs in the app (`GameAudio`'s `unlockAtBoot`, set from `isAppHost`), and keeps the first-input handlers as the fallback. The web build still creates no context before a gesture. Both come from `scripts/apply-android-settings.sh`, so the tracked project and the regenerated dev project get them. The probe page reports the root font size (expect 16 px) and the `AudioContext` state before any gesture (expect `running`) to confirm them on a device.
- **Vibration permission:** the manifest does not declare `android.permission.VIBRATE`. The haptics plugin adds it from its own `build.rs` (`tauri_plugin::mobile::update_android_manifest`) once the app depends on that plugin, so until then the probe's `navigator.vibrate` test is expected to report no permission.

## Identity
- Application id `ca.liminalhq.lieutenantfizz`, with a side-by-side dev build `ca.liminalhq.lieutenantfizz.dev` and its own launcher icon, as Cadence does with `ca.liminalhq.cadence.dev`.
- The dev build follows Cadence and Threshold: the tracked `gen/android` stays the real app, and a dev build deletes it, runs `tauri android init --config src-tauri/tauri.conf.dev.json` (the `.dev` identifier and the 'Lieutenant Fizz Dev' name), re-applies the Android settings and stamps the dev ribbon icon with `tauri icon` (`scripts/prepare-android-dev.sh`). GitHub Actions runs those steps in the `tauri-ci-mobile` container and is the default way to get an APK. The one sanctioned local path is `bun run build:android:dev` (`scripts/build-android-dev.sh`), which runs the same steps in the `tauri-dev-mobile` container, refuses to run when `gen/android` has uncommitted changes, always restores `gen/android` to HEAD afterwards (and exits non-zero if that restore does not leave the tree clean, even when the build succeeded), builds one ABI (aarch64; `FIZZ_DEV_TARGET=universal` for all), caps parallelism (`FIZZ_DEV_JOBS`, default 4), puts the heavy directories (the Rust build output, the cargo registry and the Gradle cache) under `FIZZ_DEV_SCRATCH` when it is set, so they can live on another disk (the Android SDK and NDK extras always stay on the Docker named volume `fizz-android-sdk-extras`, in Docker storage, because a host directory would start empty and hide the image's SDK and NDK), and copies the APK to `FIZZ_DEV_APK_DIR` (default `~/fizz-dev-builds`) and installs it when a device is attached. No other local Android build, emulator or `tauri android dev` is used.

## Icon
- **Chosen: 2g, "Fizz ring · Zargoth"** (`design/App Icons.dc.html`, `design/assets/fizz-icon.svg`): Ben in the fizz ring, in EGA magenta, the colours of Planet Zargoth. It reads at 24 px, and the art stays inside the Android 66 dp safe zone.
- The source is a 512×512 pixel-art SVG. The design export's copy carries embedded generator metadata; `assets/icon/fizz-icon.svg` is the stripped copy (same shapes, no `<metadata>` block) and is the committed source. The web build already uses it: `bun run build:icons` draws the PNGs the web manifest and page head use into `episodes/episode-1/public/icons/` (see MOBILE_PLAN.md, slice 7.3), and `check:icons` keeps them in step with the SVG. `bun run tauri icon ../../assets/icon/tauri-icon.json` (from `apps/player`, an image-only step) regenerates `apps/player/src-tauri/icons/` and patches the tracked Android launcher icons in place.
- `assets/icon/` follows Cadence's naming: the source SVG, the adaptive-icon layers (`ic_launcher_foreground.svg`, `ic_launcher_background.svg`, `ic_launcher_monochrome.svg`), a notification icon (`ic_notification.svg`) and the **dev variant** with a small "Dev" ribbon (`fizz-icon-dev.svg`, `fizz-icon-android-dev.svg`), so it is never mistaken for the release build; `assets/icon/README.md` describes each file. `tauri icon` generates the Android adaptive, iOS (kept, as Cadence and Threshold do), Windows, macOS and Linux sets from it.
- `design/assets/liminalhq-mark.svg` is the Liminal HQ mark for About and the splash.

## Tooling and CI
- **Two Cargo workspaces:** the root workspace holds the simulation (`crates/sim` and the episode game crates) and excludes `apps/player/src-tauri`, which is its own workspace root with its own `Cargo.lock` and release profile. The app's heavy dependencies and its WebKitGTK and GTK system libraries stay out of the simulation's checks, so `cargo test --workspace`, `bun run test:rust` and `bun run validate` are unchanged. The app's Rust is checked by its own job, `.github/workflows/ci-app.yml`, which runs on pull requests that touch `apps/player/` or the shared `rust-toolchain.toml` (the app inherits that pinned toolchain) in the desktop CI image: `cargo fmt --check`, `cargo clippy --locked` and `cargo test --locked` on the desktop target, with a stub frontend directory (`tauri::generate_context!` needs `apps/player/dist` to exist). `bun run check:app-rust` and `bun run test:app-rust` run the same checks locally; they are not part of `validate`.
- **`bun run validate` does not build the app.** The Android build (SDK, NDK, signing, an AAB for the Play Store) is its own heavy workflow, like the e2e job. **GitHub Actions is the default place to build Android** (`.github/workflows/android-apk.yml`, started by hand or on pushes to `feat/tauri-player*` branches). The only sanctioned local build is `scripts/build-android-dev.sh` (see Identity); there is no local `tauri android dev`, emulator or bare Gradle run.
- **Generated files:** Prettier, ESLint and the licence-header check ignore `gen/android`.
- **Build order:** `bun run build:wasm`, then `bun run build:app` (`scripts/build-app.sh`), which builds the player pages and then each episode with `--base ./` into `apps/player/dist/episode-N/`, the app's `frontendDist`. Only this script passes `--base`, so the Pages build keeps the episode's own base. Prettier, ESLint and the licence-header check skip the generated `apps/player/src-tauri/gen/`.
- The Pages deploy is unaffected.

## Phasing
The mobile experience on the web comes first, because it is an extension of the game as it is today and needs no new app. It is planned in slices in [MOBILE_PLAN.md](MOBILE_PLAN.md). The app work follows.
1. **Touch controls, the phone layout and basic haptics on the web** (MOBILE_PLAN.md, slices 0 to 9). They are web UI, so the website and phone browsers get them, and everything below reuses them.
2. **Spike (built and run on a Pixel device once; measurements still to do):** `apps/player` runs the existing episode build in the Tauri WebView, and a probe page reports how WebGL2, WASM, audio, the gamepad and the rest behave. Findings go in [TAURI_SPIKE.md](TAURI_SPIKE.md).
3. **Shared options and the launch contract:** the shared options key with per-episode overrides, `parseLaunch()`, and embedded mode in Episode 1.
4. **The launcher:** the carousel, App settings, Saves export and import, and the demo-strip art.
5. **Android lifecycle and release:** orientation and fullscreen, the Back button, pausing on background, the icon set, signing, the heavy CI job and the dev-build script.
6. **Desktop extras:** window mode, rumble and the fullscreen scale.
7. **Haptics** once the plugin upgrade and the touch controls exist.

## Open questions
- Is the Play Store a goal, or is installing a signed APK or AAB enough for now?
- Will any episode ever be paid or separately priced? That is the one thing that would favour separate apps.
- **Placeholder content in the artboards:** the artboards estimate content (episode titles, save values, the art), and the current implementation wins where they differ.
- **Placeholder episodes:** the designs name Episode 2 "Chocolate Raid" and Episode 3 "Last Stand" in mock-ups. No episode title beyond Episode 1 is decided, so the real launcher shows later episodes as locked stops with no title and no teaser text.
- **Pixel scale in the launcher:** the fullscreen design scales the art 4.8×. The type and art rule everywhere else is whole-pixel scales. Should the launcher follow the same rule (an integer scale with margins), or is a fractional scale acceptable for the demo strip behind the menu?
- **Does the demo strip animate beyond Ben running?** The art generator draws a static strip with Ben's two run frames and the soda cursor.

## Decisions
- One app for all episodes rather than an app per episode (bundles are small, settings and saves are shared).
- Tauri rather than a PWA wrapper, so saves live in app storage that the browser cannot evict, and native plugins (haptics, Back gesture) are first class. The web build keeps working as before.
- The launcher is the episode's title screen (design 1a), not a hub that hands off.
- The launcher is pre-drawn art and loads no game code.
- Episodes are launched by navigating to their own page with a launch contract, not by mounting them in the launcher.
- Options are global with per-episode overrides.
- Icon 2g (Fizz ring · Zargoth).
- The website stays static HTML.
