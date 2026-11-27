# Plan: the Lieutenant Fizz screensaver

**Status: planned, nothing built.** The build-ordered plan for issue #275: a Lieutenant Fizz screensaver that is a feature of the desktop app on Windows, Linux and macOS, with thin per-OS integrations so each system's own screensaver settings can pick it, and a native `FIZZ.SCR` that also runs on its own for the Liminal Installer's retro example. Decisions are `FZS-1` to `FZS-30` (reserved here; packages that refine one say so in the same change). Concept art is in [`screensaver/`](screensaver/) (SVG masters, PNGs from `screensaver/render.sh`).

![A concept frame: Crater Fields in EGA colours, Ben on the pogo stick over the Roller, soda cans, and a small title card in the corner](screensaver/scene-concept.png)

## Table of contents

- [1. What it shows](#1-what-it-shows)
- [2. Architecture](#2-architecture)
- [3. Pixels, scaling and monitors](#3-pixels-scaling-and-monitors)
- [4. Sound](#4-sound)
- [5. Settings](#5-settings)
- [6. Per OS](#6-per-os)
- [7. Installing it](#7-installing-it)
- [8. Cost, accessibility and safety](#8-cost-accessibility-and-safety)
- [9. Budgets](#9-budgets)
- [10. Testing and CI](#10-testing-and-ci)
- [11. Decisions](#11-decisions)
- [12. Owner decisions](#12-owner-decisions)
- [13. Work packages](#13-work-packages)
- [14. Sonnet briefs](#14-sonnet-briefs)
- [15. Risks](#15-risks)

## 1. What it shows

Looping, scripted attract-mode scenes: no simulation, no input, no physics. Every scene is a pure function of time (as the launcher's scenery already is, `apps/player/src/launcher/demo.ts`), so the same seed, settings, size and time always give the same frame, and a scene repeats exactly after its loop length.

| Scene | What happens | Source art | Music |
| --- | --- | --- | --- |
| **Title card** | The wordmark ("Ben Blaze in" over *Lieutenant Fizz*, "Episode 1: The Cocoa Caper") over the open-sky backdrop; Ben stands at its end, bobs, leans, hops up and pogoes across the top of it (the motions of `titleBen.ts`); the card drifts a pixel at a time | Fizz font, the title's own sprites (`ben-title.png`), `Theme::OpenSky` layers | `title` |
| **Crater Fields walk** | A real stretch of Crater Fields' tiles scrolls left under parallax mesas and hills; Ben runs, hops the gaps the tiles really have, grabs cream soda cans (they pop), stomps a gloop that is dazed by stars | `levels::build_level(CRATER)`, `BIOMES.crater`, `gloop`, `soda`, `stars` | `crater` |
| **Crystal Caves** | The caves' back wall at half speed, crystals pulsing through the palette's brightness levels, Ben climbing a vine and dropping onto a ledge while a bat flaps past | `CAVES`, `Theme::Caves` wall layer, `crysC`, `bat` | `caves` |
| **Meteor Mesa pogo** | Open sky, clouds and two rows of hills; Ben bounces along on the pogo stick and clears **the Roller** as it rolls downhill at him (the game's own answer to the rock roller: pogo over it) | `METEOR_MESA`, `Theme::OpenSky`, `roller` | `sky` |
| **Mildred's Citadel** | Purple walls and gold flecks; Ben fires fizz bubbles that stun a sentry, then walks under it | `CITADEL`, `sentry`, `bubble`, `stars` | `citadel` |
| **The Fizz wipe** (between scenes) | A big cream soda can tips into frame and its bubbles rise and fill the screen, carrying the next scene in | `soda` scaled 4x, `bubble` | the next scene's song fades in under it |

**Parade** (the default) plays them in turn with the Fizz wipe between each: title card, Crater Fields, Crystal Caves, Meteor Mesa, Mildred's Citadel, about 40 seconds each, about 3 minutes 40 in a loop (FZS-3). One scene can be chosen instead. With several monitors, each monitor starts at a different point of the parade by default (section 3).

Ben walks the ground the tiles really have: the core finds the top solid tile in each column of the strip and the script says only "walk from here to there"; a drop or a gap of one to three tiles becomes a hop arc, and a wall becomes a mantle. That keeps the scripts short and the motion honest to the level (FZS-4).

The overworld (Ben walking the map between landmarks with the pose workshop's eight-heading walk) and a **Live attract** scene (the game's own attract mode, through the real engine) are later scenes; see WP-FZS-12 and FZS-6.

## 2. Architecture

One portable core, one data pack per episode, and thin hosts.

```
crates/saver/                    lf-saver: no_std + alloc, game-agnostic. Indexed frame buffer, palettes and brightness levels,
                                 sprite and layer blitter, scene timeline player, ground finder, chip synth, settings table,
                                 pack reader (bounds-checked, never panics on bad input); raw C-ABI exports for WASM
episodes/episode-1/saver/        Episode 1's scene scripts (`scenes.ts`, data only) and the committed pack `fzsaver.pak`
episodes/episode-1/game/examples/saver-strips.rs
                                 dumps the chosen level stretches (tile ids) and each theme's parallax layers as JSON
scripts/build-saver-pack.ts      Bun: game sprites + level strips + pose-workshop frames + music notes + scenes -> the pack;
                                 `--check` (run by validate)
vendor/fizz-pose-workshop/       the subset of the workshop's frames the saver uses, with PROVENANCE.md (repo, commit, sums)
apps/player/saver.html           the app's saver page: full screen, preview and settings
apps/player/src/saver/           its TypeScript: boot, canvas presenter, exit rules, sound through GameAudio, settings screen
apps/player/src-tauri/src/saver.rs
                                 `--screensaver` modes: one window per monitor, cursor, exit, the idle helper on Linux and macOS
hosts/win32-scr/                 FIZZ.SCR: a no-C-runtime Win32 program (i586 and x86-64), its own Cargo workspace
hosts/linux-hack/                lieutenant-fizz-xscreensaver: the xscreensaver, XFCE and MATE hack (x11rb + ALSA)
hosts/macos-saver/               LieutenantFizz.saver: a ScreenSaver-framework bundle in Swift over lf-saver as a static library
docs/SCREENSAVER.md              the specification (behaviour, settings, the pack format, per-OS integration)
```

- **Why a Rust core and not the Three.js engine (FZS-5).** A saver runs on machines left alone, often on several monitors, and must idle cheap. The game's renderer shades every device pixel with WebGL lighting; the saver's scenes are 16-colour pixel art at 320 × 200-style logical sizes, which a CPU draws in well under a millisecond. A small `no_std` core is also the only thing every host can share: the app runs it as WASM (as it runs the simulation, raw C-ABI exports and shared memory, no `wasm-bindgen`), and `FIZZ.SCR`, the xscreensaver hack and the macOS `.saver` link it natively, so the picture is the same byte for byte on every OS, and none of the native hosts needs a web view.
- **Why not the launcher's DOM scenery as it is.** It is CSS layers moved by transforms, which a native host cannot run, and its art is pre-drawn wide strips rather than real level tiles. The saver keeps its ideas (whole-pixel scale, a time-only demo script, the episode's own art) and moves the drawing into the core. The launcher could later draw through the same core; not part of this plan.
- **Engine and episode rules hold.** `lf-saver` is game-agnostic, as `crates/sim` is; everything Episode 1 brings (scripts, art, music) is data in its pack. Episode 2 adds its own `episodes/episode-2/saver/` pack, and the parade takes scenes from every pack the host has.
- **Indexed colour, as the DOS port.** The frame is one byte per pixel: `level × 16 + colour`, the 16 EGA colours at 14 brightness levels (the DOS port's scheme, `lieutenant-fizz-dos` `docs/ARCHITECTURE.md`), with level 14 full. Fades, the caves' crystal pulse and the night palette are level changes, never blends. A palette setting is a 256-entry lookup from that byte to RGB, applied only when the frame is shown.
- **The pack.** One file per episode, little-endian, `FZSP` and a version, a section table, then: palettes; sprite sheets (4-bit indexed, transparent 0, run-length rows, anchor and size per frame); layers (a tile strip's ids and its tile set, or a parallax picture with speed, base and tint); scenes (a small bytecode of actors, animations, path segments and cues); music (note events per track: start step, length, MIDI note, voice, gain, filter, envelope); and the strings the title card needs. Specified in `docs/SCREENSAVER.md` before the reader is written; the reader checks every offset and length and returns an error, never a panic (FZS-7).
- **Ben.** The game's Ben (16 × 24, `characters.ts`) is the scale every tile and enemy agrees with, but he has only a two-frame run. The pose workshop's rig (`fizz-pose-workshop`, `docs/RIG.md`, "Reuse with another character") samples a continuous skeleton into any number of frames; the saver gets a twelve-frame run, a twelve-frame pogo, a hop and an idle (helmet tip, wrist check) by sampling that rig with a **game-scale skin** (16 × 24, Ben's game colours), exported in the workshop and vendored here with provenance. Until that art lands, scenes use the game's own frames (FZS-8; owner decision 1).

## 3. Pixels, scaling and monitors

- **Whole pixels, any shape (FZS-9).** For a window `W × H` the scale is `s = max(1, floor(min(W / 320, H / 200)))`. **Fill** (the default) draws a logical canvas of `ceil(W / s) × ceil(H / s)` so the scene covers the screen with whole pixels and no bars, showing more of the level on wide screens and more sky on tall ones (the ground sits on the bottom edge, the sky continues up), with under `s` device pixels cropped on the right and bottom, as the game's Fast pixels do. **Letterbox** draws exactly 320 × 200 at `s` and centres it on black.

| Screen | `s` | Fill's logical size |
| --- | --- | --- |
| 1024 × 768 | 3 | 342 × 256 |
| 1366 × 768 | 3 | 456 × 256 |
| 1920 × 1080 | 5 | 384 × 216 |
| 2560 × 1440 | 7 | 366 × 206 |
| 3440 × 1440 | 7 | 492 × 206 |
| 3840 × 2160 | 10 | 384 × 216 |
| 1080 × 1920 (portrait) | 3 | 360 × 640 |
| Preview pane, 152 × 112 | 1 | 152 × 112 (the scene is framed on Ben, not cropped from 320) |

- **Presenting.** The app copies the RGB frame into a canvas of the logical size with `putImageData` and lets CSS scale it by `s` with `image-rendering: pixelated`, so the GPU does one quad. `FIZZ.SCR` scales with `StretchDIBits` (`COLORONCOLOR`) at whole multiples; the hack with `XPutImage` of a frame the core scales by an integer; the `.saver` hands a `CGImage` to Core Animation with nearest filtering.
- **Monitors (FZS-10).** `Monitors`: **Different** (the default: each monitor its own scene, monitor `i` starting `i × loop / n` into the parade with seed `seed ⊕ i`), **Same** (one view drawn at each monitor's own size) or **Primary** (the others black). Each monitor gets its own scale, so a 4K and a 1080p screen side by side are both crisp. Sound comes from the primary monitor's view only. The app opens one borderless full-screen window per monitor; `FIZZ.SCR` standalone covers the virtual screen with one window and one viewport per monitor (`EnumDisplayMonitors`); xscreensaver and XFCE run one hack per monitor, and each finds its monitor from its window (as SAV-D74 does); macOS makes one `ScreenSaverView` per screen.

## 4. Sound

- **The episode's own music, quietly (FZS-11).** Each scene plays its level's song (table in section 1) at **Volume 25** of the app's Music level, on by default, fading up with the picture over two seconds and cross-fading at each wipe; it stops at once when the saver ends. Effects (the boing, the pop of a can, the crunch of a stomp) are a separate setting, **off** by default.
- **In the app** the music is the game's own: `GameAudio` playing the episode's patterns (Classic, or Enhanced where the app's Sound option says so), as the launcher already plays the title theme from `theme.json`. No new sound code in the app.
- **In the native hosts** (`FIZZ.SCR`, the hack, the `.saver`) there is no Web Audio, so the core carries a small **chip synth**: square, triangle, sawtooth, sine and noise voices with an ADSR envelope, one-pole low- and high-pass filters and a short feedback delay, which are the controls the game's voices use (`SfxVoice`, `MusicPart` in `packages/engine/src/audio.ts`). `build-saver-pack.ts` turns each song into note events with the engine's own mini-notation parser, so the notes are the game's notes; the timbre is close to Classic, not identical (FZS-12). It renders 16-bit stereo at 22,050 Hz (Pentium) or 48,000 Hz, deterministic from the sample clock.
- **Where it plays.** `waveOut` on Windows (the Afterglow savers' three-buffer path, SAV-D48), ALSA through `cpal` for the hack (PipeWire and PulseAudio answer through their ALSA plug-ins), `AVAudioEngine` with a source node on macOS. Silent in every preview and settings pane, silent with no message when no device opens, and silent as an xscreensaver hack unless `--sound` is given (a hack runs at a locked desktop as well).
- **Autoplay.** The app's web view must play without a gesture in saver mode: WebView2 and WebKitGTK allow it for app content; on macOS the app mode needs `mediaTypesRequiringUserActionForPlayback` cleared (checked in WP-FZS-4, risk R3).

## 5. Settings

One table in the core (`lf_saver::settings`: key, range, default), read by every host; a missing or out-of-range value is the default, and only a settings screen writes (FZS-13).

| Key | Meaning | Range | Default |
| --- | --- | --- | --- |
| `scene` | 0 Parade, 1 Title card, 2 Crater Fields, 3 Crystal Caves, 4 Meteor Mesa, 5 Mildred's Citadel | 0–5 | 0 |
| `speed` | Percent of normal | 25–200 | 100 |
| `music` | Play the scene's song | 0–1 | 1 |
| `volume` | Percent of the Music level | 0–100 | 25 |
| `effects` | Play the scene's sound effects | 0–1 | 0 |
| `palette` | 0 EGA, 1 Night (the game's night tints), 2 CGA (cyan, magenta, white), 3 Amber, 4 Green phosphor, 5 Grey | 0–5 | 0 |
| `pixels` | 0 Fill, 1 Letterbox 320 × 200 | 0–1 | 0 |
| `scanlines` | Darken every other device row inside each logical pixel (a CRT hint; only at `s` ≥ 3) | 0–1 | 0 |
| `monitors` | 0 Different, 1 Same, 2 Primary | 0–2 | 0 |
| `fps` | Frame cap | 15–60 | 30 |
| `motion` | 0 System, 1 Reduced, 2 Full (section 8) | 0–2 | 0 |
| `seed` | 0 for a new one each run | any | 0 |

- **Where they live.** The app keeps them as `lf-saver-v1` in its store (`lf-data.json` in the app data folder, with every other `lf-*` key). The hack reads the same file (its path is fixed per OS: `~/.local/share/ca.liminalhq.lieutenantfizz/lf-data.json`); `FIZZ.SCR` passes settings through to the app when the app is installed, and keeps its own under `HKCU\Software\Liminal HQ\Lieutenant Fizz\Screensaver` (`REG_DWORD`s by the same names) when it runs alone; the `.saver` uses `ScreenSaverDefaults` (the legacy host's sandbox cannot read the app's folder).
- **The settings screen (FZS-14).** In the app, a screen in the game's menu language (stepped plate, the can as bullet, Fizz font, keyboard, pad and mouse) laid out as the Afterglow dialogs are: a banner that is the saver's own scene at a fixed moment, darkened under the title; **Look** (scene, speed, palette as swatches, pixels, scanlines, monitors); **Sound** (music, volume, effects); a **live preview** at the pane's size; and **Try it full screen**, **Defaults** and **Done**. It opens from App settings in the launcher (a new **Screensaver** row) and from each OS's screensaver settings (section 6). Every string goes through the launcher's messages.

![The settings screen concept: banner, Look and Sound rows in the game's menu style, palette swatches, a live preview and three buttons, in a neutral window](screensaver/settings-concept.png)

- **Native settings** where the app is not there: `FIZZ.SCR` alone shows a plain Win32 dialog (Scene, Speed, Music, Volume, Palette; the Afterglow plain dialog's shape, built at run time from controls Windows 95 has); the `.saver` gives an AppKit sheet with the same rows; xscreensaver gets an XML dialog that writes command-line flags.

## 6. Per OS

The app's saver mode is the same everywhere; each OS gets the thinnest integration it allows.

### The app's saver mode (all three)

- `lieutenant-fizz --screensaver` opens one borderless, always-on-top, full-screen window per monitor on `saver.html`, hides the pointer and runs until input. `--screensaver-preview` runs one ordinary window (for trying it). `--screensaver-settings` opens the settings screen in one window. `--screensaver-idle` is the Linux and macOS idle helper (below).
- **Ending (FZS-15):** any key or mouse button, a pointer move of more than 10 device pixels from where the first move found it, losing focus after having had it, or the process being told to close. It ends the process at once (no fade out), never opening the launcher. In saver mode the app writes nothing to its store.
- **Another copy already running.** A saver run is its own process; it does not take over a running game. While the game is played full screen the OS screensaver should not start at all; the game holding the system awake during play is a separate change (risk R6).
- **In-app idle (the fallback everywhere):** App settings › Screensaver › **Start when idle** (Off, 5, 10, 15 minutes; Off by default) starts the same saver inside the running app after that long without input on the launcher or a menu, never during play.

### Windows (first)

- **`FIZZ.SCR`** is a real screensaver program (WP-FZS-6), built as the Afterglow savers are: Rust with no C runtime, `core` built from source for a Pentium (i586, x87) and for x86-64, ANSI imports on an allow list, its plumbing (the runtime glue, the system bindings, the command line, the registry, `waveOut`, the window and exit rules) copied from `afterglow-savers` `platforms/win32` with a `PROVENANCE.md` naming the commit (FZS-16). One file serves two roles:
  - **Launcher.** `/s`: when the app is installed (its path from `HKCU\Software\Liminal HQ\Lieutenant Fizz\Screensaver\App`, written by the app the first time its saver settings are saved, then the installers' uninstall key `InstallLocation`, then beside the `.scr`), it starts `lieutenant-fizz.exe --screensaver` in a job object that kills it when the job closes, shows a black topmost window at once so the desktop never flashes, and waits for the app to exit; Windows ends the saver by ending `FIZZ.SCR`, which takes the app with it, and "On resume, display logon screen" keeps working because the saver process lives as long as the picture. `/c` starts `--screensaver-settings` and waits.
  - **Saver on its own.** When the app is not there (Windows 95 to 8.1, ReactOS, or a machine with only the `.scr`), `/s` runs the scenes natively with the chip synth, from the pack embedded in the file, and `/c` shows the plain dialog.
  - **Preview.** `/p <hwnd>` always draws natively into the Display applet's pane (a web view cannot be a child of that window), at Low cost, 15 frames a second, silent.
- Listed as "Lieutenant Fizz" by string 1, with the game's icon as resource 101.
- **Windows 3.x** is a later, separate 16-bit program (WP-FZS-11), as `QUILLGW.SCR` was for Quill: the title card and one scene in the 16 VGA colours, which are nearly the EGA palette already.

### Linux

GNOME and KDE have no interface for a third-party screensaver; their lock screens draw their own picture (afterglow-savers `docs/linux-packages.md`, SAV-D69). What a package can do, following that plan:

| Desktop | How the saver starts | Settings |
| --- | --- | --- |
| xscreensaver (X11 window managers, LXQt) | `lieutenant-fizz-xscreensaver` as a hack, listed as "Lieutenant Fizz": by itself on Fedora (`hacks.conf.d`), after `lieutenant-fizz --screensaver-setup xscreensaver` (per user, no administrator) on Debian, Ubuntu and Arch | xscreensaver's dialog (installed XML), and the app's settings file |
| XFCE (`xfce4-screensaver`), MATE | A `.desktop` in `/usr/share/applications/screensavers/` running the hack with `-root` | The app's settings file |
| GNOME (Wayland), KDE Plasma, Cinnamon, Budgie | `lieutenant-fizz --screensaver-idle` as a user service (not enabled by the package): Mutter's IdleMonitor on GNOME, `org.freedesktop.ScreenSaver.GetSessionIdleTime` on KDE, `xprintidle` on X11; it starts the app's saver mode and skips while the session is inhibited | The app |
| sway, Hyprland and other wlroots compositors | `swayidle -w timeout 300 'lieutenant-fizz --screensaver'` (documented) | The app |

- The hack is a small native program (`hosts/linux-hack`, x11rb and `cpal`), not the app: xscreensaver hands it a window to draw into, which a web view cannot do. It draws the core's frames and needs no WebKitGTK.
- **Packaging (FZS-17).** The deb and rpm from `bun run tauri build --bundles deb,rpm` carry the hack as a Tauri `externalBin`, and the hack's XML, the XFCE and MATE `.desktop`, Fedora's `hacks.conf.d` line and the idle helper's user unit through `bundle.linux.deb.files` and `bundle.linux.rpm.files`. The AppImage carries the app's saver mode and the idle helper only (an AppImage has no fixed path for xscreensaver to run); a Flatpak is not built today, and when it is, the idle helper is its route.

### macOS

- **The only real route is a ScreenSaver-framework bundle** (`LieutenantFizz.saver`, WP-FZS-9). Since macOS 10.15 third-party savers run inside Apple's sandboxed `legacyScreenSaver` host, which brings known constraints that the bundle must work around: an instance may not be torn down when the saver ends (on 14 and later `stopAnimation` may never arrive), so the view stops and the process exits on the `com.apple.screensaver.willstop` distributed notification; each screen gets its own view, so sound plays from the main screen's only; the bundle must carry both `arm64` and `x86_64`; and the sandbox cannot read the app's data, so settings are `ScreenSaverDefaults`.
- **Native, not a web view (FZS-18).** The bundle links `lf-saver` as a static library and draws its frames as a `CGImage`; it does not host a `WKWebView` (a web content process inside `legacyScreenSaver` is heavy and has been unreliable) and does not launch the app (an app cannot draw above the screensaver window). Sound is the chip synth through `AVAudioEngine`.
- **Signing.** The release's `.dmg` is ad-hoc signed and not notarised, and the `.saver` would be the same: on a first install macOS refuses it until it is allowed in System Settings › Privacy & Security. That works, but it is not a good first experience; notarising needs an Apple Developer ID (owner decision 9). The `.saver` ships as a zip beside the `.dmg` and inside the app's Resources, with an **Install the screensaver** row in App settings that opens it (System Settings then installs it for the user).
- **Fallback:** the app's in-app idle saver, and `--screensaver-idle` as a login item that watches `CGEventSourceSecondsSinceLastEventType` (WP-FZS-9).

## 7. Installing it

- **The app's own installers (FZS-19).** The Windows release builds `FIZZ.SCR` (x86-64; arm64 Windows runs it emulated) before `tauri build` and adds it as a resource. The NSIS installer (per-user, Tauri's default) cannot write to the system folder, so it puts `FIZZ.SCR` beside the app, and the app's **Use as my screensaver** button sets `HKCU\Control Panel\Desktop` `SCRNSAVE.EXE` to its short path (the Display applet runs it unquoted) and `ScreenSaveActive` to 1. The MSI (per-machine) also installs it to `System32` through a WiX fragment, so it is listed by Screen Saver Settings for every user. Uninstalling removes it, and leaves `SCRNSAVE.EXE` alone when it names a removed file (Windows falls back to none).
- **The Liminal Installer's Lt. Fizz example.** Its unticked `screensaver` component (`examples/lt-fizz/installer/components.toml`, `{windows}/`, liminal-installer D97) carries a text stand-in today. WP-FZS-10 replaces it with the i586 `FIZZ.SCR` (standalone mode, pack embedded), copied into `examples/lt-fizz/installer/dist/screensaver/` with a `PROVENANCE.md` (this repository's commit and the file's SHA-256), as Quill vendors `AGQUILL.SCR`. The Windows 3.1 target keeps the stand-in until the Win16 edition exists (owner decision 13).
- **Linux and macOS:** section 6.

## 8. Cost, accessibility and safety

- **Idle cheap (FZS-20).** 30 frames a second by default; a frame whose picture would not change (a held title card, Reduced motion) is not drawn or presented again; the app's saver page stops its loop when hidden; one canvas per monitor, scaled by the compositor; no WebGL. The core draws a 384 × 216 frame in well under a millisecond on a current CPU; the budget in section 9 is measured in WP-FZS-4 and WP-FZS-6.
- **Reduced motion (FZS-21).** `motion` System follows the OS (`prefers-reduced-motion` in the app, `SPI_GETCLIENTAREAANIMATION` on Windows, `accessibilityDisplayShouldReduceMotion` on macOS, GNOME's `enable-animations`). Reduced shows **postcards**: still frames of each scene (Ben at a fixed pose, no parallax) cut with a slow two-second fade every 20 seconds, and a one-pixel drift so nothing burns in. Full ignores the OS.
- **No flashing.** Nothing changes brightness more than three times a second over a large area: the crystal pulse is under 1 Hz, the stun stars are small, the wipe's bubbles rise without strobing.
- **Burn-in.** Nothing is static for more than 30 seconds: the title card drifts, the parade moves on, and postcards drift.
- **Locking** stays the OS's: Windows' secure screensaver through the `.scr` process, Linux and macOS lock screens at their own timeouts. The saver never asks for or stores a password.

## 9. Budgets

Guards, checked by scripts and CI, not targets; raising one is a recorded decision with the measured cost.

| Item | Budget |
| --- | --- |
| Episode 1 pack `fzsaver.pak` | 160 KiB |
| `lf_saver.wasm` (after `wasm-opt -Oz`) | 64 KiB |
| `FIZZ.SCR`, i586 and x86-64, each, pack included | 384 KiB (the Afterglow guard, SAV-D29) |
| `lieutenant-fizz-xscreensaver`, stripped | 2 MiB |
| `LieutenantFizz.saver`, universal, zipped | 3 MiB |
| Core frame time, 384 × 216, host build | 1 ms (reported by a bench in CI, failing at 4 ms) |
| App saver, 1920 × 1080, one monitor, 30 fps | under 5% of one core and under 200 MB resident, measured on the owner's Linux machine and the Windows 11 VM |
| `FIZZ.SCR` standalone, 1920 × 1080, 30 fps | under 3% of one core (Wine and the VM) |
| `FIZZ.SCR` standalone, Pentium-class (86Box or real) | 20 frames a second at 640 × 480 at 22,050 Hz; not verified until a machine or 86Box is set up |
| `/s` to first frame through the app | black at once, scene within 1.5 s on the Windows 11 VM |

## 10. Testing and CI

| What | How | Where it runs |
| --- | --- | --- |
| Core | `cargo test -p lf-saver`: golden frame hashes per scene at fixed times and sizes, loop exactness, determinism, the ground finder, scale maths, settings ranges, the pack reader on truncated and corrupt packs (and a `cargo fuzz` target run locally) | CI `rust` job |
| Pack | `bun scripts/build-saver-pack.ts --check` (committed pack matches its inputs), size guard | CI `web` job, through `bun run validate` |
| Pictures | `cargo run -p lf-saver --example preview` writes PNG frames, an MP4 (ffmpeg) and a WAV of the chip score per scene into the evidence folder | Local; frames attached to PRs |
| App | Vitest for the boot, exit rules, scale and settings screen state; Playwright on `saver.html?host=fake-desktop` at 1280 × 720, 1920 × 1080, 3440 × 1440, 1024 × 768 and portrait, with reduced motion, screenshots compared by hash | CI Chromium shards |
| App on each OS | `--screensaver` on X11 (Xvfb with two RandR monitors), headless sway with two outputs, the Windows 11 VM (WebView2) and a Mac when one is available | Local; evidence |
| `FIZZ.SCR` | Host tests of the command line and app finding; build both arches, size guard, import allow list, Pentium instruction scan; Wine: `/s` standalone (frames captured), `/p` in the preview stand-in, `/c` dialog, `/s` with a stub app that records its arguments; ReactOS guest: Display applet lists and previews it | CI `saver-win32` job (container with Wine); ReactOS locally |
| Linux hack | Build, `-window-id` on Xvfb, `-root`, a two-monitor Xvfb, xscreensaver in a Debian container listing it after the setup command; packages install and uninstall in containers | CI `saver-linux` job; containers locally |
| macOS `.saver` | Build universal, an XCTest that makes a `ScreenSaverView` off screen and checks a frame's hash against the core's | CI `saver-macos` on `macos-latest`; real use on a Mac only |
| Installers | liminal-installer's Wine and Windows 3.11 e2e with the real `FIZZ.SCR` | liminal-installer CI |

CI follows the repository's rule of one job per check: `saver-win32`, `saver-linux` and `saver-macos` join `ci.yml` (the macOS one only on changes under `crates/saver/` and `hosts/macos-saver/`), and `release.yml` gains the `FIZZ.SCR`, hack and `.saver` builds in the existing Windows, Linux and macOS jobs. Nothing new is released until a tagged release does it.

All evidence goes to `~/Documents/Liminal HQ/Lieutenant Fizz/Screensaver/`, one numbered folder per package (`01 Core`, `02 Pack`, `03 Scenes`, `04 App`, `05 Chip synth`, `06 FIZZ.SCR`, `07 Windows installers`, `08 Linux`, `09 macOS`, `10 Liminal Installer`), each with a `README.md` saying what each file shows and what it does not verify. The concept art is in `00 Plan concept art`.

## 11. Decisions

The repository's plans keep a Decisions list; these use the `FZS-` prefix so parallel work never clashes (FZS-1 to FZS-30 reserved). **Assumed** means a default taken while the owner has not answered; each names where to swap it.

- **FZS-1 — Where it lives.** In this repository, as a feature of the app with thin per-OS hosts beside it: not in `afterglow-savers` and not a new repository. *Decided by the owner (2026-11-27).*
- **FZS-2 — Platforms.** Windows, Linux and macOS through the app; Windows 95 to 8.1 and ReactOS through `FIZZ.SCR` alone; Windows 3.x later through its own 16-bit program. *Decided by the owner (platforms); Assumed (the standalone role).*
- **FZS-3 — The parade.** Five scenes with the Fizz wipe, about 40 s each, the default scene. *Assumed.* Swap: `episodes/episode-1/saver/scenes.ts`.
- **FZS-4 — Ben walks real ground.** Scripts name stretches; the core derives hops and mantles from the tile strip. *Assumed.* Swap: the scene bytecode's `walk` op.
- **FZS-5 — A Rust core, WASM in the app.** Not the Three.js renderer, not a canvas port in TypeScript. *Assumed.* Swap: WP-FZS-12 adds the real engine as one more scene.
- **FZS-6 — Live attract is a later scene.** The episode's own attract mode in the app only, at Fast pixels. *Assumed.*
- **FZS-7 — One pack per episode, committed.** Built by a Bun script from the game, checked by `--check`, so no host build needs Bun or the other repositories (the DOS port's rule). *Assumed.*
- **FZS-8 — Ben's frames.** The game's Ben at game scale, with extra frames sampled from the pose workshop's rig with a game-scale skin; the workshop's 16 × 32 Ben is not used beside 16-pixel tiles. *Assumed.* Swap: `BEN_SOURCE` in `scripts/build-saver-pack.ts`.
- **FZS-9 — Whole-pixel scaling, Fill by default.** *Assumed.* Swap: the `pixels` default.
- **FZS-10 — Monitors: Different by default; sound from the primary.** *Assumed.* Swap: the `monitors` default.
- **FZS-11 — Music on at 25, effects off.** Following the Afterglow savers' choice to play quietly by default (SAV-D35). *Assumed.* Swap: the settings table.
- **FZS-12 — Two sound paths.** The app plays the game's real music; native hosts play the same notes on the core's chip synth. *Assumed.* Swap: the app can play the chip synth through an `AudioWorklet` for identical sound everywhere.
- **FZS-13 — One settings table, per-host storage.** *Assumed.*
- **FZS-14 — The settings screen is the app's, in the game's look with the Afterglow layout.** Not the Afterglow Win32 dialog. *Assumed.* Swap: section 5.
- **FZS-15 — Ending rules.** Key, button, a 10-pixel move, focus lost; no fade out. *Assumed* (Afterglow SAV-D10, SAV-D30).
- **FZS-16 — `FIZZ.SCR` copies the Afterglow Win32 plumbing with provenance.** Not a git dependency: `afterglow-savers`' shell is built around its own `SaverKind` and finishing chain, and copying with a `PROVENANCE.md` is the house pattern (the Win16 toolchain in `afterglow-savers`, Desk's foundation in the installer). *Assumed.* Swap: depend on a shared crate if `afterglow-savers` ever splits one out.
- **FZS-17 — Linux: hack and idle helper in the deb and rpm; the AppImage gets the app mode and idle helper.** *Assumed.*
- **FZS-18 — macOS: a native `.saver`, no web view; ad-hoc signed until there is a Developer ID.** *Assumed.*
- **FZS-19 — Windows: per-user NSIS sets `SCRNSAVE.EXE`; the per-machine MSI installs to `System32`.** *Assumed.*
- **FZS-20 — 30 frames a second, no redraw without change.** *Assumed.*
- **FZS-21 — Reduced motion shows postcards.** *Assumed.*
- **FZS-22 — Decision prefix `FZS-`.** *Assumed.* Swap: renumber in this file.

## 12. Owner decisions

Each as question, default taken, and where to swap it.

1. **Ben's art:** the game's 16 × 24 Ben with rig-sampled extra frames, or the pose workshop's 16 × 32 Ben outright? | Game scale, rig-sampled frames (FZS-8) | `BEN_SOURCE` in `scripts/build-saver-pack.ts`
2. **"The Fizz bottle":** the game has no bottle sprite; the saver uses the cream soda can (the ammo and the menu cursor) for the wipe. A bottle can be drawn. | The can | `episodes/episode-1/saver/scenes.ts` and a new sprite
3. **Which episode first:** Episode 1 (the only one out). | Episode 1 | one pack per episode
4. **Settings look:** the game's menu style with the Afterglow layout, or the Afterglow dialog itself? | Game style (FZS-14) | section 5
5. **Sound default:** on at 25 (as Afterglow), effects off | On, 25 | `crates/saver/src/settings.rs`
6. **The parade's order and length** | Title, Crater, Caves, Mesa, Citadel, 40 s each | `scenes.ts`
7. **One `FIZZ.SCR` for every Windows (no C runtime, i586 and x86-64), or a plain `windows-sys` stub for Windows 10 and 11 with the retro one separate?** | One program (FZS-16) | `hosts/win32-scr`
8. **Windows install:** NSIS per user plus **Use as my screensaver**, MSI per machine into `System32` | As stated (FZS-19) | `apps/player/src-tauri/tauri.conf.json` `bundle.windows`
9. **macOS signing:** ship the `.saver` ad-hoc signed (users allow it in Privacy & Security) or wait for a Developer ID and notarise? | Ad-hoc, with the in-app idle fallback | `release.yml` macOS job
10. **Linux:** hack and idle helper in deb and rpm, app mode in the AppImage, no Flatpak yet | As stated (FZS-17) | `tauri.conf.json` `bundle.linux`
11. **Identical sound everywhere** (the chip synth in the app too) or the game's real music in the app? | Real music in the app (FZS-12) | `apps/player/src/saver/sound.ts`
12. **Monitors default** | Different | settings table
13. **The Liminal Installer's Windows 3.1 target** keeps the text stand-in until the Win16 edition, or drops the component for that target | Keep the stand-in | liminal-installer `examples/lt-fizz/installer/components.toml`
14. **In-app idle start** default | Off | `apps/player/src/saver/settings.ts`

## 13. Work packages

Build order, in waves. At most three builders at once. Packages in the same wave do not touch the same files. Every package updates `docs/SCREENSAVER.md` and this plan's Decisions in the same change as the behaviour, opens one PR, and **never merges it**: every Lieutenant Fizz PR waits for the owner.

| Wave | Packages |
| --- | --- |
| 1 | WP-FZS-1 |
| 2 | WP-FZS-2, WP-FZS-5 |
| 3 | WP-FZS-3, WP-FZS-4 |
| 4 | WP-FZS-6, WP-FZS-8, WP-FZS-9 |
| 5 | WP-FZS-7, WP-FZS-10 |
| Later | WP-FZS-11, WP-FZS-12 |

### WP-FZS-1 — The specification and the core

- **Finish line:** `docs/SCREENSAVER.md` specifies sections 1 to 9 of this plan as behaviour, and the pack format byte by byte. `crates/saver` (`lf-saver`) builds `no_std` for the host, `wasm32-unknown-unknown` and `i586` (checked with `cargo check` on a custom target copied from the Afterglow savers), with the indexed frame, the 16 × 14 palette and the six palettes, the sprite blitter (flip, transparency), parallax and tile-strip layers, the ground finder, the scene timeline player, the scaler (Fill and Letterbox, section 3's table as a test), the settings table and the pack reader; a hand-written test pack in `crates/saver/tests/data/` with two sprites, one strip and one scene; golden frame hashes; a `preview` example writing PNGs.
- **Files owned:** `crates/saver/**`, `docs/SCREENSAVER.md`, `docs/README.md` (one line), root `Cargo.toml` (adds the member), `package.json` (nothing unless a script is needed).
- **Must not touch:** `crates/sim`, `episodes/**`, `apps/**`, `packages/**`.
- **Tests:** `cargo test -p lf-saver`, `cargo clippy -p lf-saver -- -D warnings`, `cargo fmt --check`, the no-std builds, the pack reader on every truncation of the test pack.
- **Evidence:** `01 Core/` frames from the test pack at three sizes.

### WP-FZS-2 — The Episode 1 pack

- **Finish line:** `episodes/episode-1/game/examples/saver-strips.rs` dumps the five stretches and each theme's layers; `scripts/build-saver-pack.ts` writes `episodes/episode-1/saver/fzsaver.pak` from the game's sprite grids (by catalogue name), the strips, the vendored workshop frames and the songs' note events (through the engine's mini-notation parser); `bun run check:saver-pack` is in `validate`; the pack is under 160 KiB.
- **Files owned:** that example, `scripts/build-saver-pack.ts`, `episodes/episode-1/saver/**`, `vendor/fizz-pose-workshop/**`, `package.json` (the two scripts and `validate`).
- **Must not touch:** `crates/saver` (report a format gap instead), the game's sprites, levels and music.
- **Tests:** a Bun test that the pack round-trips through `lf-saver`'s reader (through a tiny `cargo run` dump), `--check`.
- **Evidence:** `02 Pack/` a contact sheet of every sprite in the pack.

### WP-FZS-3 — The scenes

- **Finish line:** the five scenes and the wipe as scripts, each loops exactly, the parade loops; golden hashes at fixed times; preview videos with the chip score.
- **Files owned:** `episodes/episode-1/saver/scenes.ts`, the pack (regenerated), scene tests in `crates/saver/tests/episode1.rs`.
- **Must not touch:** the core's code beyond new bytecode ops agreed in `docs/SCREENSAVER.md` first.
- **Evidence:** `03 Scenes/` an MP4 per scene and the parade, and stills.

### WP-FZS-4 — The app's saver mode

- **Finish line:** `lf_saver.wasm` built by `scripts/build-wasm.sh` (size guard); `apps/player/saver.html` and `src/saver/`; `--screensaver`, `--screensaver-preview`, `--screensaver-settings` in `src-tauri/src/saver.rs` (one window per monitor, pointer hidden, ending rules); music through `GameAudio`; reduced motion; the settings screen and the launcher's Screensaver row; in-app idle; the measured cost in section 9.
- **Files owned:** `apps/player/saver.html`, `apps/player/src/saver/**`, `apps/player/src-tauri/src/saver.rs`, `apps/player/src-tauri/src/lib.rs` (registering it), `apps/player/src/launcher/` (the one row and its messages), `scripts/build-wasm.sh`, `scripts/build-app.sh`, `e2e/saver*.spec.ts`, `docs/APP.md` (a Screensaver section).
- **Must not touch:** `episodes/**`, `crates/sim`, `packages/engine` (except importing it).
- **Evidence:** `04 App/` screenshots per size and per palette, a two-monitor Xvfb capture, CPU and memory numbers.

### WP-FZS-5 — The chip synth

- **Finish line:** `crates/saver/src/synth/` renders a song's note events to 16-bit stereo deterministically; the preview example writes WAVs; a test compares note onsets and pitches against the events and loudness against a ceiling.
- **Files owned:** `crates/saver/src/synth/**`, its tests.
- **Must not touch:** the rest of the core.
- **Evidence:** `05 Chip synth/` a WAV per song beside the game's Classic render of it.

### WP-FZS-6 — `FIZZ.SCR`

- **Finish line:** `hosts/win32-scr` builds `FIZZ.SCR` for i586 and x86-64 under 384 KiB each; launcher and standalone roles; `/p`, `/c` and the plain dialog; `waveOut`; Wine smoke in CI; ReactOS lists and previews it.
- **Files owned:** `hosts/win32-scr/**`, `.github/workflows/ci.yml` (the `saver-win32` job).
- **Must not touch:** the core (report), `apps/**`.
- **Evidence:** `06 FIZZ.SCR/` Wine and ReactOS screenshots.

### WP-FZS-7 — Windows installers

- **Finish line:** the release's Windows job builds `FIZZ.SCR` and bundles it; NSIS places it beside the app; MSI also into `System32`; **Use as my screensaver** works; the Windows 11 VM shows it in Screen Saver Settings (MSI) and as the current saver (NSIS).
- **Files owned:** `.github/workflows/release.yml` (Windows job), `apps/player/src-tauri/tauri.conf.json` (`bundle.windows`, resources), `apps/player/src-tauri/windows/` (WiX fragment, NSIS hook), the app's Windows-only saver commands.
- **Evidence:** `07 Windows installers/`.

### WP-FZS-8 — Linux

- **Finish line:** `hosts/linux-hack` builds; the deb and rpm carry it with the XML, the XFCE and MATE entry, Fedora's line and the idle unit; `--screensaver-setup xscreensaver` and `--screensaver-idle`; the container tests in section 10.
- **Files owned:** `hosts/linux-hack/**`, `apps/player/src-tauri/linux/**`, `tauri.conf.json` (`bundle.linux`, `externalBin`), the Linux jobs in `release.yml` and `ci.yml`.
- **Evidence:** `08 Linux/` per desktop.

### WP-FZS-9 — macOS

- **Finish line:** `hosts/macos-saver` builds a universal, ad-hoc signed `LieutenantFizz.saver` over `lf-saver` as a static library; the `willstop` exit; `ScreenSaverDefaults` and the sheet; the XCTest; the release's macOS job zips it; App settings › Install the screensaver; the idle login item.
- **Files owned:** `hosts/macos-saver/**`, the macOS jobs, the app's macOS-only commands.
- **Evidence:** `09 macOS/` (CI artefacts; a Mac run when one is available).

### WP-FZS-10 — The Liminal Installer's example (liminal-installer repository)

- **Finish line:** `examples/lt-fizz/installer/dist/screensaver/FIZZ.SCR` is the i586 build with `PROVENANCE.md`; the Wine e2e installs it and starts `/s` once; Windows 3.1's target per owner decision 13.
- **Files owned:** those two files and the e2e script's Lt. Fizz case.
- **Must not touch:** the runtimes, budgets and goldens other than the file sum.

### Later

- **WP-FZS-11 — Windows 3.x edition:** a 16-bit `FIZZ.SCR` built with the vendored rust-win16 packer, title card and Crater Fields in 16 VGA colours, settings in `CONTROL.INI`.
- **WP-FZS-12 — Live attract:** the episode's own attract mode as a scene in the app only, through the real engine at Fast pixels, behind a measured cost.

## 14. Sonnet briefs

### Brief: WP-FZS-1 (in full)

> Sonnet builder, Lieutenant Fizz screensaver, WP-FZS-1: the specification and the core. Repository `liminal-hq/lieutenant-fizz`, checked out at `~/source/liminal-hq/lieutenant-fizz` (do not work there). Run `git -C ~/source/liminal-hq/lieutenant-fizz fetch`, then make your worktree with `git -C ~/source/liminal-hq/lieutenant-fizz worktree add -b feat/saver-core ~/source/worktrees/lieutenant-fizz/saver-core origin/main`. Read `AGENTS.md` in full, `docs/ENGINE_SPEC.md` sections 2 and 3, `docs/plans/screensaver.md` sections 1 to 3, 5, 8, 9 and 11, and `crates/sim` for the house style of a `no_std`-friendly crate with raw C-ABI exports. Read, but do not copy code from, `~/source/liminal-hq-labs/afterglow-savers/crates/savers-core/src/{frame.rs,rng.rs,saver.rs,settings.rs}` (a similar core, true colour) and `~/source/experiments/fizz-dos/docs/ARCHITECTURE.md` (the 16 × 14 indexed palette this core uses).
>
> **Do, in order.** (1) Write `docs/SCREENSAVER.md`: the behaviour of sections 1 to 9 of the plan as a specification (present tense, no "will"), and the pack format byte by byte: header (`FZSP`, version 1, section count), section table (kind, offset, length), and the palette, sprite sheet (4-bit indices, 0 transparent, run-length rows; width, height, anchor), layer (tile strip with tile-set index, or picture with speed, base, tint level), scene (the bytecode: `actor`, `anim`, `walk from to`, `hop`, `pogo`, `wait`, `cue`, `wipe`, `end`, with operand sizes) and string sections. Link it from `docs/README.md`. (2) Create `crates/saver` (`lf-saver`, `#![no_std]` with `alloc`, no dependencies, added to the root workspace) with modules `frame` (one byte per pixel, `level * 16 + colour`), `palette` (the 16 EGA colours from `packages/engine/src/palette.ts`, 14 levels, the six palettes of section 5, a 256-entry RGB lookup), `blit` (sprites with flip and transparency, clipped), `layer` (tile strips and parallax pictures, wrapping), `ground` (the top solid tile per column, and hop and mantle arcs from it), `scale` (section 3: `s`, Fill and Letterbox sizes; make section 3's table a test), `scene` (a timeline player that is a pure function of time and seed, with `loop_length`), `settings` (section 5's table, defaults for missing and out-of-range values), `pack` (the reader: every offset and length checked, `Result`, never a panic, never an out-of-bounds index), and `ffi` (raw `extern "C"` exports for WASM: create with a pack pointer and length, set a setting, resize, draw at a time, the RGBA output pointer; documented `unsafe` only at that boundary). (3) A hand-written test pack under `crates/saver/tests/data/` built by a test helper in Rust (two sprites, one strip, one parallax picture, one ten-second scene), golden FNV-1a hashes of frames at three times and three sizes, determinism, `loop_length` exactness, and a test that every truncation and every single-byte corruption of the pack returns an error or a valid pack without panicking. (4) An example `crates/saver/examples/preview.rs` (`std`, host only) writing PNGs with a minimal encoder of its own (no new dependency), run as `cargo run -p lf-saver --example preview -- --pack PATH --time 3.5 --size 384x216 --out DIR`. (5) Check `cargo build -p lf-saver --target wasm32-unknown-unknown --release` and report the size; check an i586 build with `RUSTC_BOOTSTRAP=1 cargo build -p lf-saver --release --target <copy of afterglow-savers platforms/win32/i586-win32.json under crates/saver/targets/> -Zbuild-std=core,alloc -Zjson-target-spec`, and add a header comment to the copied JSON naming where it came from.
>
> **Owner decisions already taken:** the saver lives in this repository; it covers Windows, Linux and macOS through the app; FZS-1 and FZS-2. Defaults in sections 11 and 12 stand unless the owner changes them; if you must choose something not covered, pick a swappable default and report it as `OWNER DECISION: question | default taken | where to swap`. Add any decision you make to the plan's section 11 as `FZS-23` onwards and to `docs/SCREENSAVER.md`.
>
> **Out of scope:** the Episode 1 pack and its exporter (WP-FZS-2), the chip synth (WP-FZS-5), the app (WP-FZS-4), every host. Do not touch `crates/sim`, `episodes/`, `apps/`, `packages/` or any workflow. No other builder is in this repository's saver files while you work.
>
> **Standing rules.** Canadian English, real em dashes, no hard-wrapped markdown. Licence headers on every `.rs` file (`bun run check:headers`). `cargo fmt`, `cargo clippy -p lf-saver --all-targets -- -D warnings`, `cargo test -p lf-saver`, and `bun run validate` before the PR. Stage named files only (never `git add -A` or `git commit -a`). Commits are Conventional (`feat(saver): …`, `docs(saver): …`), written to a file and made with `git commit -F`, the body in markdown with bold labels and no headings, hard-wrapped at 100 columns, ending `Co-Authored-By: Claude Sonnet <noreply@anthropic.com>` with your own model's name. Push only your branch. Open one PR, title capitalized and imperative with no prefix ("Add the screensaver core and its specification"), body `## Summary` with bold lead-in bullets and `## Test plan` with checkboxes and commands, ending with an unchecked "Not verified:" line; labels `enhancement`, `rust`, `rendering`, `design-docs`. **Do not merge, and do not ask anyone to merge: Lieutenant Fizz PRs wait for the owner.** Keep `df -h /home` above 20 GB; build output stays in the worktree's `target/`. Remove nothing with globs.
>
> **Evidence:** PNGs from the preview example at 320 × 200, 384 × 216 and 152 × 112 into `~/Documents/Liminal HQ/Lieutenant Fizz/Screensaver/01 Core/` with a `README.md` saying what they show and that they come from the test pack, not Episode 1.
>
> **Report:** the PR URL, the WASM and i586 sizes, the test count, what was not verified, and any `OWNER DECISION:` lines.

### The shared block for later briefs

Every later brief starts from WP-FZS-1's **standing rules**, **evidence** and **report** paragraphs, its worktree pattern (`~/source/worktrees/lieutenant-fizz/<topic>`, branch from `origin/main` after its inputs have merged; rebase onto `main` if they merge while working, never merge `main` in), and the line that the PR is never merged by an agent. Then:

- **WP-FZS-2** (`feat/saver-pack`): read `docs/SCREENSAVER.md`, `scripts/build-launcher-art.ts` (the pattern: import the episode's own modules, write committed outputs, `--check`), `episodes/episode-1/src/sprites/catalog.ts`, `episodes/episode-1/game/src/{levels.rs,render.rs}` and `packages/engine/src/audio.ts`. Copy the needed frames from `~/source/liminal-hq-labs/fizz-pose-workshop/assets.json` at its current commit into `vendor/fizz-pose-workshop/` with `PROVENANCE.md` (commit, file, SHA-256). Labels `enhancement`, `episode-1`, `art`, `audio`.
- **WP-FZS-3** (`feat/saver-scenes`): section 1's table is the script; each scene's loop is exact; wipe timing in the spec. Labels `enhancement`, `episode-1`, `art`.
- **WP-FZS-4** (`feat/saver-app`): read `docs/APP.md`, `apps/player/src/launcher/{scene.ts,main.ts,music.ts}`, `apps/player/src-tauri/src/lib.rs`, `packages/engine/src/host.ts`; test with `?host=fake-desktop`; Xvfb with two RandR monitors on a display number of your own, `DISPLAY` set on every command, `WAYLAND_DISPLAY` unset, never the host display. Labels `enhancement`, `ui`, `frontend`, `audio`.
- **WP-FZS-5** (`feat/saver-synth`): read `packages/engine/src/audio.ts` (voices) and the Classic render path; may run beside WP-FZS-2. Labels `enhancement`, `audio`, `rust`.
- **WP-FZS-6** (`feat/saver-scr`): read `~/source/liminal-hq-labs/afterglow-savers/SPEC.md` sections 1 to 5 and 9, `platforms/win32/` and `docs/reactos-scr.md`; copy the plumbing with `hosts/win32-scr/PROVENANCE.md`; Wine in a prefix of your own; ReactOS through the reactos-liminal guest tools. Labels `enhancement`, `build`.
- **WP-FZS-7, 8, 9, 10** are written when their inputs are on `main`, from sections 6 and 7.

## 15. Risks

- **R1 — Display applet folders.** Which folders Windows 10 and 11's Screen Saver Settings lists (`System32` certainly; `SysWOW64` for a 32-bit file on 64-bit Windows; the Windows folder) is not yet checked on real machines (liminal-installer's system-folders plan has the same open item). The NSIS route does not depend on it.
- **R2 — WebView start-up.** A WebView2 cold start may take more than a second on a slow disk; `FIZZ.SCR` shows black at once so nothing flashes, and the budget is measured.
- **R3 — Autoplay.** If a web view refuses to start audio without a gesture in saver mode, the saver is silent there; the app has `GameAudio` unlock paths already, and macOS's `WKWebView` setting is checked in WP-FZS-4.
- **R4 — macOS host changes.** Apple has changed `legacyScreenSaver` in recent releases; the `.saver` is verified only on the Macs available, and the in-app idle mode is the fallback.
- **R5 — Two processes of the app.** A saver run beside an open game shares the app's data folder; saver mode never writes the store, and WebView2 allows two processes on one user data folder with the same options.
- **R6 — The OS saver starting during play.** Not caused by this plan, but more visible with it: the game should hold the display awake while a level is played (a small separate change in the app shell).
- **R7 — Chip timbre.** The native hosts' music is the game's notes on a simpler synth; the WAVs beside the Classic renders show how close it is before anyone signs it off.
