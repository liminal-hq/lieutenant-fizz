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
- The camera position snaps to the device-pixel grid each frame, so sprites never shimmer.

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
- Moving platforms carry riders by their per-tick delta, and can rest for a set time at each end (lifts that wait at every floor). A body standing on a conveyor is carried along it on top of its own velocity.
- **Done:** the Rust port with f64 state (`crates/sim` and `episodes/episode-1/game`).
- **Planned:** sparse grid or quadtree for entity–entity tests (currently O(n) per level).

### 4.3 Culling — Proven
- Tiles iterate only the visible rectangle; entities, items and platforms are skipped when outside the view plus a margin.
- The stress test adds a 400 × 125 back wall (50,000 tiles). Culling on writes ~1–2k instances; culling off writes ~54k.

### 4.4 Save state — Proven
- Autosave (meta progress) on every overworld visit.
- Quick-save is progress-level in the Rust port: it stores lives, score, ammo, cleared levels and map position in `localStorage`. F5 saves, F9 loads. The prototype serialised the full simulation (tile map, entities, items, shots, keys, platforms); restoring that in the port needs a serialisable world in Rust and is **Planned**.

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

## 7. Input
- Keyboard:
  - Keen-style layout: Ctrl jump, Alt pogo, Space fire.
  - Modern layout: Z, X, C.
  - Arrows or WASD move.
- Gamepad via the standard mapping: A jump, B/Y pogo, X/RT fire, Start menu.
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
