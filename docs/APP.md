# The Tauri app and the React launcher

**Status: planned.** Nothing here exists yet. This document is the working plan for an Android app (with desktop builds for free) that plays every episode, and for the React launcher that picks the episode. It is iterated in pull requests, and `docs/STATUS.md` links here. Touch controls, the mobile UI layout and haptics are in [MOBILE.md](MOBILE.md).

## Goals
- **One app for the whole series.** Episodes share the engine and are small (the art is generated in code, and the Episode 1 WASM is about 65 kB gzipped), so every episode is bundled in one install. One icon, one Settings screen, one place for saves.
- **A shared launcher that replaces each episode's title screen** when an episode is started from the app. Played from the website, an episode keeps its own title screen.
- **Reuse the Liminal HQ app pattern.** Cadence and Threshold are Tauri v2 Android apps with a React frontend, an `apps/<name>/src-tauri` layout, a tracked `gen/android` project and a side-by-side dev build. Fizz follows the same shape.

## Layout
```
apps/
└── player/                      the Tauri app
    ├── package.json  index.html  vite.config.ts
    ├── src/                     the React launcher
    │   ├── main.tsx
    │   ├── routes/              Episodes, Settings, About
    │   ├── components/          the BBS look: status bar, boxes, menu rows
    │   └── lib/                 episodes.ts, saves.ts, launch.ts
    └── src-tauri/               Cargo.toml, build.rs, tauri.conf.json (+ tauri.conf.dev.json),
                                 capabilities/, icons/, src/, gen/android (tracked)
plugins/                         Tauri plugins written in this repo, if any (see Plugins)
```
- The app depends on the engine and on the episode builds. Nothing in `crates/`, `packages/` or `episodes/` imports from `apps/`.
- `site/` stays static HTML: it must work without JavaScript, carry the social card and load fast. The launcher and the website share `site/episodes.json`, `site/css/bbs.css` and the Fizz fonts, not code.

## The React launcher
The launcher is the app's front door: the BBS release log from the website, as screens.
- **Episodes:** playable episodes first (newest first), then locked "coming soon" rows, driven by `episodes.json`. A **Continue** entry loads the newest save across episodes.
- **Settings:** the options that are shared across episodes (music and sound volume, captions, controls layout, text size, motion, haptics), kept in one shared storage key.
- **About:** version, licences (the Fizz font is OFL-1.1), links.
- The look reuses `bbs.css` and the Fizz fonts. The whole-pixel type rule applies (font size is 11px × a whole number), so no component library may set its own type sizes.
- Navigation is a screen stack. The Android Back gesture goes through the `predictive-back` plugin that Cadence and Threshold use.

## Launching an episode
The launcher navigates the WebView to the episode's own page with a launch contract in the URL, for example `episode-1/index.html?launch=…`. Each episode's `main.ts` reads it through a small `parseLaunch()` in `packages/engine`.
- **Embedded mode:** `Game.start` skips the title screen and goes straight to a new game, the newest save or a chosen slot. "Quit to title" in the pause menu becomes "Back to launcher" and navigates to `returnTo`.
- **Normal mode:** with no launch parameters nothing changes, so the website's Play button still opens the episode's own title screen.
- Other ways to launch were considered and rejected for now: mounting the episode inside the launcher (needs a `mount`/`unmount` contract and careful WebGL and audio cleanup) and embedding an iframe (focus, audio unlock, fullscreen and gamepad all get awkward).

## Shared storage
- **Options** are stored under `lf-ep1-options-v1`, which ties them to one episode. They move to one shared key that the launcher's Settings and every episode read, with a migration from the per-episode key.
- **Saves** stay per episode (`lf-ep1-save-v1` and `lf-ep1-slot-1…4`). The launcher reads their metadata (location, score, time played, date) as plain JSON, without loading any game code.
- **Save thumbnails** are drawn by the episode's own sim, which the launcher does not load. First version: the launcher shows text rows, and "Slots…" opens the episode's own Load screen (`?launch=load`). Later option: store a small thumbnail in each slot (a save-format bump) so the launcher can draw it.

## The Tauri shell
- The sim stays WASM inside the WebView. Calling a native sim over IPC every frame would cost more than it saves.
- **Plugins:** `predictive-back` (from Cadence and Threshold) for the Back gesture, and a haptics plugin (see [MOBILE.md](MOBILE.md#haptics)). The haptics plugin lives in `haptics-lab-app` today. The plan is to move it into `tauri-plugins-workspace` and consume it as a versioned dependency, so the lab and Fizz share one source. A `plugins/` folder here is only for plugins authored in this repo.
- **Android project:** orientation lock (landscape) and fullscreen are native Android settings, not Tauri plugins, so they live in the tracked `src-tauri/gen/android`.

## Identity
- Application id `ca.liminalhq.lieutenantfizz`, with a side-by-side dev build `ca.liminalhq.lieutenantfizz.dev` and its own launcher icon, as Cadence does with `ca.liminalhq.cadence.dev`.
- The dev build uses the shared `tauri-dev-mobile` container, so no local Android SDK or NDK is needed, and `gen/android` is regenerated for the dev id and restored afterwards.

## Tooling and CI
- **Cargo workspace:** the Tauri crate joins the workspace but stays out of the default checks (`default-members`, or a separate workflow), so `cargo test --workspace` and clippy do not need WebKit system libraries or the Android targets.
- **`bun run validate` does not build the app.** The Android build (SDK, NDK, signing, an AAB for the Play Store) is its own heavy workflow, like the e2e job.
- **Generated files:** Prettier, ESLint and the licence-header check ignore `gen/android`.
- **Build order:** a `scripts/build-app.sh` assembles the launcher and the episode bundles into the app's `frontendDist` after the WASM and episode builds.
- The Pages deploy is unaffected.

## Phasing
1. **Spike:** scaffold `apps/player`, run the existing episode build in an Android emulator, and see how WebGL2, WASM, audio and the gamepad behave in the WebView.
2. **Touch controls and the mobile layout** (see MOBILE.md). They are web UI, so the website and phone browsers get them too.
3. **Launcher and launch contract:** the React launcher, `parseLaunch()`, embedded mode in Episode 1, the shared options key.
4. **Android lifecycle and release:** orientation and fullscreen, the Back button, pausing on background, signing, the heavy CI job and the dev-build script.
5. **Haptics** once the touch controls exist.

## Open questions
- Is the Play Store a goal, or is installing a signed APK or AAB enough for now?
- Will any episode ever be paid or separately priced? That is the one thing that would favour separate apps.
- Fully offline play is free (everything is bundled). Are cloud saves wanted, or is local-only fine?
- Should the launcher open straight into "Continue", or always show the episode list first?
- Thumbnails in the launcher: text rows only, or a save-format bump to carry a thumbnail?

## Decisions
- One app for all episodes rather than an app per episode (bundles are small, settings and saves are shared).
- Tauri rather than a PWA wrapper, so saves live in app storage that the browser cannot evict, and native plugins (haptics, Back gesture) are first class. The web build keeps working as before.
- Episodes are launched by navigating to their own page with a launch contract, not by mounting them in the launcher.
- The website stays static HTML.
