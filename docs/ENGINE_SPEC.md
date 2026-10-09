# SPEC: Retro Rendering & Simulation Engine (v0.2)

Revision of the original spec after the first two test games. Sections marked **Proven** are working (in the prototype and, where noted, in the Rust/WASM port); **Planned** items are not yet built.

## 1. Overview
A cross-platform pipeline for vibrant, high-fidelity EGA-style pixel art at native display resolution. Simulation runs separately from rendering: a deterministic fixed-step core writes into a shared buffer that a thin WebGL layer draws in one instanced call. The engine is game-agnostic; see `GAME_DESIGN.md` for the first title built on it.

## 2. Architecture
| Layer | Target | Prototype stand-in |
|---|---|---|
| Simulation core | Rust → WASM (`wasm32-unknown-unknown`), raw C-ABI exports; **done** (`crates/sim` plus `episodes/episode-1/game`) | `melting/engine.js` (plain JS, same data layout and tick boundary) |
| Renderer | Three.js r160+ over WebGL2 (WebGPU later) | Same: one `InstancedBufferGeometry` + `ShaderMaterial` |
| Shell | Tauri v2 | Browser tab |
| Audio | Undertone (`@liminal-hq/undertone`) | `melting/audio.js`: tries Undertone, falls back to a built-in mini-notation synth |
| UI | DOM overlay (React) | Design Component shell |
| Memory | Shared linear `Float32Array` | Pre-allocated `Float32Array`, 120,000 × 20 floats (9.6 MB) |

## 3. Rendering
### 3.1 Camera — Proven
- One `OrthographicCamera` per mode. Zoom spans a 3× close-up to a whole-level overview without swapping assets.
- On resize the frustum is recalculated from the viewport height in world tiles (13 for levels, 12 for the map, 14 for cinematics).
- The camera position snaps to the canvas-pixel grid each frame, so sprites never shimmer.
- The canvas is backed by device pixels, not a fixed pixel-ratio cap. **Soft** (the desktop default) backs it with `floor(css × min(dpr, 2, √(budget / cssArea)))` and shows the target tiles. **Sharp** (touch, `?touch`, `?pixels=sharp`) backs it with the device size divided by a whole `k`, and draws at a whole scale `s = max(2, floor(H / (16 × target)))` showing `H / (16 × s)` tiles, so the leftover height shows more of the level (no bars; Soft fallback below 11 tiles, when the size is not divisible by `k`, or when zoomed).
- The **pixel budget** is 3840 × 2160 canvas pixels; larger desktop canvases are scaled down (Soft) or divided by `k` (Sharp). Width is not capped. The maths is in `packages/engine/src/view-scale.ts`.

### 3.2 Atlas — Proven
- Sprites are authored as palette-indexed grids (`sprites.js`, a small pixel DSL), then packed into one 2048² atlas at 4 texels per logical pixel.
- Filtering is `NearestFilter` for min and mag, with mipmaps off.
- Every sprite has a 1-pixel extruded border; tile sprites clamp edge height for seamless normals.
- A second atlas with the same layout holds the generated normal maps (§5.1).

### 3.3 Instancing — Proven
- Everything is drawn in one draw call per frame: parallax, tiles, items, enemies, shots, effects and player.
- Instance stride is 20 floats: `iM0–iM3` hold the 4×4 matrix, with UV width and height packed into the spare w components of the first two rows, and `iData` holds (u, v, tint RGB packed as 24-bit, alpha + 2·emissive).
- Draw order is buffer order (painter's algorithm, no depth test).

## 4. Simulation
### 4.1 Bridge — Proven
- The buffer is allocated once at boot and written front-to-back each frame.
- Only `[0, n × 20)` is uploaded (`addUpdateRange`), and `instanceCount = n`.
- There is no JSON or object creation in the render loop. A light pool, uniforms and vectors are pre-allocated.

### 4.2 Physics — Proven
- 60 Hz fixed step with an accumulator (max 0.25 s catch-up) and render interpolation between the previous and current state.
- AABB versus tile grid, with separate X then Y resolution.
- Tile types: solid, one-way platform, 45° and 22.5° slopes (two tiles per 22.5° rise), spike, chocolate (liquid hazard), keyed doors, switchable tiles on up to 32 independent switch channels, conveyors (left and right, 3 tiles/s), ladders (a ladder top is a one-way ladder tile).
- 0.55-tile step-up when grounded; slope snapping keeps walking downhill glued to the surface.
- Moving platforms carry riders by their per-tick delta, and can rest for a set time at each end (lifts that wait at every floor). A body standing on a conveyor is carried along it as a step of its own, on top of its own velocity, so a belt that pushes it into a wall never cancels its own motion and it can still walk away.
- **Done:** the Rust port with f64 state (`crates/sim` and `episodes/episode-1/game`).
- **Planned:** sparse grid or quadtree for entity–entity tests (currently O(n) per level).

### 4.3 Culling — Proven
- Tiles iterate only the visible rectangle; entities, items and platforms are skipped when outside the view plus a margin.
- The stress test adds a 400 × 125 back wall (50,000 tiles). Culling on writes ~1–2k instances; culling off writes ~54k.

### 4.4 Save state — Proven
- Autosave (meta progress) on every overworld visit.
- Saves are progress-level in the Rust port: lives, score, ammo, cleared levels, map position and time played, in `localStorage`. The prototype serialised the full simulation (tile map, entities, items, shots, keys, platforms); restoring that in the port needs a serialisable world in Rust and is **Planned**.
- **Slots:** the autosave keeps the original key (`lf-ep1-save-v1`) and is read-only in the save screen; four manual slots live under `lf-ep1-slot-1` to `lf-ep1-slot-4`. Each stores `{ v, at, progress }`. F5 saves to the most recently used manual slot (Slot 1 if none), F9 and Continue load the newest save of any slot, and the pause menu's Save game and Load game open the slot screen.
- **Versions:** the save version is 3, which adds `played` (seconds). Version 1 and 2 saves still load: version 1 loses its map position (it belongs to the old map) and both start with no time played.
- **Options:** music and sound volume (8 blocks each), captions, controls layout, text size and motion are saved separately under `lf-ep1-options-v1`; missing or invalid fields fall back to their defaults.
- **Slot thumbnails** are not stored. The sim exports the overworld as one byte per tile (`thumb_ptr`, `thumb_w`, `thumb_h`: grass with its area, river, or a level node) and `area_of`; the shell paints the mini map at 1 pixel per tile from those and the saved cleared levels and map position.

## 5. Visuals
### 5.1 Lighting — Proven
- Normal maps are generated from sprite luminance height (Sobel-style, strength 2.2).
- Up to 16 point lights per frame are chosen nearest-first from a pool of 256, with Lambert diffuse and quadratic falloff.
- Light sources: player lantern, crystals (flicker), hazard rows (pulse), pickups (soft glow by type), shots, sentries, spore puffs, terminal, boss weak point.
- Two ambient profiles per biome:
  - **Day** (default): bright ambient, lights at 55–60%.
  - **Night**: low ambient, full-strength lights, and a gradient sky drawn behind a transparent canvas.
- Emissive flag (alpha + 2) bypasses lighting for UI-like sprites (crystals, exit, items, effects).
- Optional posterise step: lighting is quantised to quarter steps.
- **Planned:** cast shadows (2D shadow-volume or SDF pass).

### 5.2 DOM overlay — Proven
- HUD, menus, dialogue, cinematic text and world-anchored "sound captions" render in the DOM at native resolution.
- The engine emits events (`hud`, `stats`, `toast`, `levelComplete`, `dialogue`, …); the shell never reads simulation state directly.
- **Typography:** every overlay surface is set in the Fizz pixel font family (see `docs/FONT.md`). Text is only crisp at whole-pixel sizes, so `font-size` is always `11px × n` for a whole number `n` from 2 to 6, and each glyph pixel is exactly `n` CSS pixels. Pixel text never uses `clamp()`, viewport units or fractional sizes, and spacing around it is written as multiples of `n` pixels.
- **Scale selection:** the shell picks the item scale from the window height (2 under 480 px tall, 3 up to 900 px, 4 above; Options › Text size › Large adds one) with `pixelScale` in `packages/engine/src/font/scale.ts`, and writes the derived scales to CSS custom properties (`--lf-n`, `--lf-n-small`, `--lf-n-head`, `--lf-n-hint`, `--lf-n-logo`) on resize. Small text is one step below the items and never under 2; headings are one step above and never over 6; hints and notes are always 2. A component sets `--n` to the scale it uses and everything under it takes its font size, line height and spacing from that.
- **Rendering:** overlay text sets `-webkit-font-smoothing: none`, `font-smooth: never` and `text-rendering: optimizeSpeed`, and the faces load with `font-display: block`. Long text wraps at word boundaries.
- **Title attract mode:** the title screen runs the sim in `Mode::Attract` and pans a deterministic camera across Crater Fields, then Crystal Caves, then Mildred's Citadel, and round again. `load_attract(idx, still)` loads one level; the camera position is a function of the tick count alone (2.2 tiles/s back and forth across at most 46 tiles, from just inside the left wall), and its bottom edge sits on row 0, so it never shows below the bottom tile row. `State.ATTRACT_T`, `ATTRACT_PERIOD` and `ATTRACT_IDX` let the shell fade a black layer over the last and first half second and call `load_attract` for the next level; with reduced motion `still` holds the camera and the loop does not advance. A small "Attract · {level}" label sits bottom-right from 560 px wide.
- **Ben on the title** is presentational (`titleBen.ts`): he stands at the end of the wordmark with a one-pixel bob, leans on it now and then, hops up and pogoes across the top of it on a 14 second loop, faces the menu for 1.6 s when the selection moves, and does the shoot pose as a wave for 0.9 s when an item is picked (the choice takes effect 0.65 s later). He only stands under reduced motion and is hidden when the window is under 420 px tall.
- **Menus:** left-aligned and unboxed over a scrim. The selected row is a stepped-corner plate (4 px notches) in `#ffaa40` with dark ink, cycling through four warm steps; the bullet is the soda sprite, drawn once from the sprite grid and shown pixelated in a fixed gutter so rows never shift. Both stop under `prefers-reduced-motion`. Meter rows show 8 blocks, and choice rows show `◄ value ►` while selected.

### 5.3 Credits and stinger — Done (shell logic and Episode 1 credits); Episode 3 stinger content Planned
- **Flow:** ending panels, then the credits, then (only if the episode has one) the stinger, then the score card. Both scenes are skippable with Esc or gamepad Start. Screen state lives in the TypeScript shell; the Rust simulation is not involved and stays deterministic.
- **Content:** an episode supplies an `EpisodeConfig` (`packages/engine/src/episode.ts`) with `credits` (title card, sections of role and name, a closing heading, a closing line and a final return line) and `stinger` (`null` for no stinger). Episode 1's credits are data in `episodes/episode-1/src/credits.ts`; its config sets `stinger: null`.
- **Credits roll:** `CreditsRoll` (`packages/engine/src/credits.ts`) is a pure state machine driven by frame times. The text scrolls up from below the viewport over the Afterglow wash and faint stars at the larger of 40 px/s and 10% of the viewport height per second, and holds with the closing card centred. Jump (or Enter, or a click) speeds up to four times and slows back down; once held it continues. Esc or Start skips. Frame steps are capped at 50 ms. Music is the ending track.
- **Reduced motion:** with `prefers-reduced-motion: reduce` the roll does not scroll; it shows one page at a time (title card, each section, the close), and Jump turns the page, then continues.
- **Stinger:** `StingerScene` (`packages/engine/src/stinger.ts`) is a pure timing state machine: silence until 1.2 s, then the low sting (the `stinger` effect, with the sound caption `♪ low sting`) and a slit of light, at 2.6 s the slit opens into a doorway with the figure, at 4.6 s the name and line type out at 83 characters per second. Jump is ignored until the line appears, then completes the typing, then continues. Esc or Start skips at any time. Music is off from the credits' end until the score card. The Mortimer figure is the `billyAlt` sprite.
- **Preview:** Episode 1 does not show the stinger (it belongs to Episode 3). Add `?previewStinger` to the page URL to see the Mortimer stinger after the Episode 1 credits.
- **Planned:** Episode 3's own stinger content and a gamepad-only pass on real hardware.

## 6. Audio (new)
- **Target:** Undertone 0.2 patterns (`@liminal-hq/undertone` ^0.2.0). Each sound effect is a `stack` of voices (`note|sound`, ADSR, `lpf/hpf`, `slide`, `nudge`); music is a looped `stack` of mini-notation parts at a fixed BPM, with `room` and `delay` sends.
- **Fallback:** the built-in synth parses the same subset of mini-notation (`[ ]`, `< >`, `,`, `*n`, `~`) and schedules voices 300 ms ahead.
- The audio context unlocks on the first click or key press. Audio is a single global instance, disposed on unmount (prevents doubled loops on hot reload).
- Caption events double as sound-effect triggers, so audio and captions always agree.
- **Classic and Enhanced:** `GameAudio.mode` is `classic` or `enhanced`. Enhanced is the game's default (`AUDIO_DEFAULT` in `sound-field.ts`, applied through `resolveAudioMode`), and `?audio=classic` (`GameOptions.audio`) forces Classic until the Options row (Auto, Classic, Enhanced) lands; `?audio=enhanced` is accepted and does nothing extra. `GameAudio` itself still starts in Classic, so the engine changes nothing until a game asks for a mode. `__lf.debugAudio('classic' | 'enhanced')` under `?debug` switches live, and its report says whether the mode was forced by `?audio=` or is the default. Classic is the sound as it has always been: effects play with `play({ ctx })` and music loops with `loop({ ctx, bpm })` on the real context, straight to `ctx.destination`, and no panner or other node is ever created for them. The mode only affects sounds that start after it changes, and switching back to Classic restores that path exactly.
- **Sound field (Enhanced, first stage):** `packages/engine/src/sound-field.ts` holds the pure maths. `placeSound(x, y, camera, half)` measures the offset from the camera in half-screens (1 is the edge of the view), sets the pan to `FIELD.width` (0.6) times the horizontal offset clamped to ±1, and the loudness to 1 out to `FIELD.near` (one half-screen on the further axis), falling by `FIELD.slope` (0.5) per half-screen beyond and never below `FIELD.floor` (0.4), so a far sound is quieter but never lost. Sounds with no position (menu and click sounds, cinematic captions) sit at the centre. The sim already reports a position for every sound (the `CAPTION` event carries the world `x` and `y`), so nothing in the simulation changed.
- **Routing:** each Enhanced effect gets its own emitter (a gain, then a stereo panner, then `ctx.destination`) and Undertone is given a routed context (`routedContext` in `sound-graph.ts`: the real context with `destination` replaced by the emitter). Undertone's voices connect to `ctx.destination`, so they end up in the emitter, and no change to Undertone is needed. The routed context is a new object, so Undertone's per-context reverb and delay buses are separate from the real context's (effects have none today). The built-in synth is given the emitter as its output.
- **Loudness at the centre:** a mono voice through a stereo panner at pan 0 is 3 dB quieter than the same voice sent straight to a stereo output (0.707 on each side against 1), so the emitter's gain includes `PANNED_MAKEUP` (√2). A centred Enhanced sound is as loud as Classic; at pan 0.6 the sides are 0.44 and 1.34 with the same total power.
- **Not yet built:** music panning, a mastering chain (compressor, limiter, equalisation, room reverb), an Options row and surround. Enhanced currently means positional sound effects only: music and the master level are unchanged from Classic until they are.
- **What the tests prove:** unit tests with a recording fake `AudioContext` check the pan and falloff maths, the graph edges, the exact `play`/`loop` arguments, that each call's voices connect to that call's emitter, and that Classic never builds a panner. They cannot show that Enhanced sounds better; that takes listening on headphones and on a phone speaker (which is often mono in landscape, so the field mostly shows on headphones).

## 7. Input
- Keyboard:
  - Keen-style layout: Ctrl jump, Alt pogo, Space fire.
  - Modern layout: Z, X, C.
  - Arrows or WASD move.
- Gamepad via the standard mapping: A jump, B/Y pogo, X/RT fire, Start menu.
- **Touch** (`touch.ts`, `touch-layout.ts`, `touch-ui.ts` in the engine): on-screen controls in a level. The pure `TouchState` tracks every finger by pointer id (so moving and jumping work together), a sliding D-pad turns a thumb's offset into directions (with a dead zone and a rule that drops the weaker axis), and a fresh Jump, Pogo or Fizz press is held for at least 50 ms so a tap shorter than one fixed step still reaches the sim. `placeControls` lays the controls out from the window size and the safe-area insets (every hit area at least 48 dp, the glass face inside it); `TouchControls` is the thin DOM layer; it can show a reduced set of controls (a hidden control takes no new touch) and reports `sideGutters`, the room menu content leaves for the controls showing. Touch bits count whenever the controls show, so on menu-style screens they drive the menus as a gamepad does: the shell shows the D-pad where there is something to move, relabels Jump as Select and Pogo as Back, hides Fizz and keeps Pause where it has a job. Choosing and going back need a fresh press, so a button already held when a menu opens chooses nothing until it is pressed again. The shell's touch mode follows the last-used device (touch, keyboard or gamepad); `?touch` pins it on.
- **Browser Back** (`back-guard.ts` in the engine): `BackGuard(onBack, history, target)` holds one history entry (`pushState({ lfBack: 1 })`, same URL) while the game wants Back, however many screens open, and exposes `set(want)`, `armed` and `dispose()`. `set(false)` calls `history.back()` and counts the `popstate` it causes so it is swallowed; wants made while removals are landing are deferred, and the latest wins. A user Back disarms the guard and calls `onBack`, then re-arms if the want stands. A page that opens on a leftover entry clears it with `replaceState(null, '')`. The shell decides when to want it (fullscreen, an installed app, or `?back`) and what Back does on each screen.
- **Menu repeat** (`repeat.ts` in the engine): a held direction fires on the press, again after 350 ms and then every 90 ms. `HeldRepeat` works on input bits, so keys, the gamepad and the touch D-pad repeat alike, fires at most once per frame, and makes a direction held across a screen change wait for a release.
- Edge detection happens per fixed tick.
- **Planned:** in the Tauri shell, capture Ctrl/Alt so they don't trigger browser shortcuts.

## 8. Performance targets
| Target | Spec | Prototype status |
|---|---|---|
| Frame rate | 60 fps, paced up to 144 Hz | Interpolated; 60 fps typical |
| Instances | 50–100k on integrated GPU | 120k capacity; 54k stress test |
| GC | None during play | No per-frame allocation in render; sim allocates for shots/effects (pooling in the Rust port is Planned) |
| WASM size | < 2 MB | About 119 kB (48 kB gzipped) for Episode 1 |

## 9. Modules (prototype)
| File | Role |
|---|---|
| `melting/sprites.js` | EGA palette, pixel DSL, all sprites and tiles, atlas and normal-map builder |
| `melting/levels.js` | Tile IDs, slope maths, level builder, overworld |
| `melting/engine.js` | Renderer bridge, input, simulation, enemies, boss, lighting, save/load |
| `melting/audio.js` | Sound-effect and music patterns, Undertone adapter, fallback synth |
| `Melting Adventures.dc.html` | Game shell: title, cinematic, HUD, menus, dialogue, ending |
| `Last Light.dc.html` | First engine test scene (kept as reference) |
