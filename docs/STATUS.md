# Status: Episode 1 port (Rust/WASM + TypeScript)

Where the real game stands against `ENGINE_SPEC.md` and `GAME_DESIGN.md`. The behavioural reference is the prototype in `design/melting/` (kept untouched).

## Layout
| Path | Role |
|---|---|
| `crates/sim` | Engine core (Rust, game-agnostic): tile map with per-tile properties, AABB body, slopes, one-way and switchable tiles, moving platforms, instance buffer, light selection, event queue, RNG |
| `episodes/episode-1/game` | Episode 1 sim (Rust, cdylib to WASM): levels, player, enemies, boss, overworld, scene drawing, raw C-ABI exports |
| `packages/engine` | Engine shell (TypeScript): pixel DSL and atlas builder, Three.js instanced renderer, input, audio, fixed-step accumulator, WASM loader |
| `episodes/episode-1` | Episode 1 app: sprites, cinematic, DOM overlay, story text, saves, game flow, Vite entry |
| `site/` | Static landing page, episodes listed in `site/episodes.json` |

## Run it
```sh
bun install
bun run dev            # builds the WASM, then Vite on http://localhost:5173 (add ?debug for window.__lf)
bun run build          # WASM + production bundle in episodes/episode-1/dist (base /lieutenant-fizz/episode-1/)
bun run build:site     # landing page + episodes assembled in dist-site/ (what Pages publishes)
bun run validate       # format, lint, typecheck, vitest, clippy, cargo test, build
```
The WASM is built with plain `cargo build --target wasm32-unknown-unknown` and raw exports, so no wasm-bindgen CLI is needed. It is about 119 kB (48 kB gzipped), well inside the 2 MB target.

## Done and verified
Verified by `cargo test`, `vitest` (including the real WASM) and a real browser pass (Chromium via Playwright: no console errors, only the headless GPU perf notices).

- **Simulation (Rust, f64, 60 Hz fixed step):** run, variable-height jump, pogo (high bounce with jump held, about 6.6 tiles), fizz shots (aim up, aim down in the air, ammo), stomps, lives and extra lives every 100 points, snacks, keys and matching doors, switchable bridge, hover platforms that carry riders, spikes and chocolate, exit and level completion, deterministic given the same inputs.
- **Enemies:** all eleven kinds ported (gloop, hopper, marshmallow, beetle, bat, spore pod, phantom, roller, sentry, drone, Cocoa Colossus with hover, globs, slam, charge and open-dome phases), plus the switch, terminal and caged Billy.
- **Overworld:** four regions (Crater Fields, Marshmallow Meadows, Rock Candy Reach, Frosting Frontier) cut by the rivers, each with its own ground and scatter sprites, a lake with an island at the centre, teleporter pairs gated on sets of cleared levels, a locked Citadel point, and a hidden teleporter pad that appears once the secret mural has been found. Teleporters drop Ben on the partner pad's own tile, which is always ground. Saves are versioned (the save key never changes): a version 1 save keeps its progress but loses its map position, which belongs to the old layout. Map points are checked by flood fill: each region connects to the next only through its teleporter, and the island cannot be walked to.
- **Levels:** Crater Fields, Crystal Caves and Mildred's Citadel built by a port of the level builder, plus Meteor Mesa, the first open-sky level (a new tile set, drifting cloud layers and cloud-ledge platforms), Zarg Lookout, the first building level (ladders, stairs, a waiting lift, a tower camera), Marshmallow Meadows (a second open-sky level), Bonbon Playhouse, the first theatre level (hidden rooms behind fading painted flats) Fudge Bog (a harder crater) Mirror Shafts (a tall shaft of mirrors, a swivel mirror, crystal switches and three gates) the Sugar Glass Gallery (a long theatre with a secret mural room that records the secret-found bit), Frosting Flats (the hardest open-sky level, with hover chains) Frosting Spire (twelve floors, three lifts and the third key colour, green) and the Cocoa Foundry (conveyor belts, crushing presses and molten metal); overworld with rivers, teleporter pairs that power up as levels are cleared, level prompts. Levels come from a `LEVELS` table (builder, theme, area, overworld icon) indexed by id, so a level's look is a `Theme` rather than its id. Map points carry a requirement mask: a teleporter or level point works only once every listed level is cleared.
- **Rendering:** one instanced draw call per frame; instance buffer is a zero-copy view over WASM memory; 2048 atlas with extruded borders and generated normal maps; Lambert lighting with up to 16 nearest-first point lights; day and night profiles; posterise, normals and culling toggles; 50k-tile stress mode; pixel-grid camera snapping; parallax layers per biome.
- **Shell:** title with attract mode, controls screen, eight-panel opening cinematic (drawn in TypeScript into the shared buffer), HUD, boss pips, map prompts, toasts, dialogue with typewriter text, pause menu, level-cleared, death and game-over cards, four-panel ending, skippable credits roll (with a paged reduced-motion form), floating sound captions, engine panel (backtick), zoom (wheel, `-`, `=`, `0`).
- **Input:** Keen-style and modern keyboard layouts, standard gamepad, edge detection per fixed tick in the sim.
- **Audio:** `@liminal-hq/undertone` 0.2.0 plays all sound effects (one-shot stacks, including high-pass voices) and music (looped stacks at each track's BPM, with `room` and `delay` sends). The built-in mini-notation synth is kept only as a fallback, used when Undertone fails to load or throws while building or starting a sound. Audio unlocks on the first click or key press, and sound captions still trigger their effects. Tests cover the Undertone routing and the fallback against a mocked `AudioContext`. Audible output has not been checked, so mixing, loop timing and the fallback's sound are unverified.
- **Saves:** progress (lives, score, ammo, cleared levels, map position) autosaves on every overworld visit; F5 and F9 save and load it. Cleared levels are one bitmask (levels in bits 0 to 14, the secret-found flag in bit 15), so saves from before more levels were added still load.
- **Pages:** `.github/workflows/pages.yml` builds the WASM and Vite app and assembles the site; `ci.yml` runs format, lint, typecheck, vitest, clippy and cargo test.

- **Credits and stinger:** the credits roll runs after the ending panels and before the score card (Esc or Start skips, Jump speeds up then continues). The stinger scene (silence, `stinger` low sting with a `♪ low sting` caption, slit of light into a doorway, `billyAlt` Mortimer sprite, typed line) is an engine capability configured per episode; Episode 1 sets `stinger: null` and `?previewStinger` shows it for review. Covered by unit tests for the sequencing and timing state machines and for the `stinger` audio pattern. Checked in Chromium with screenshots at 1000x615 and 390x700 (roll positions, hold, reduced-motion pages, stinger stages). The sting has not been heard and the gamepad path (Start and A) has not been tried on hardware.

- **Playtest bot:** `playtest.rs` (test-only) searches for a winning input sequence through the real simulation, branching worlds with `World::fork`. It removes hostile enemies, so a pass proves the platforming, keys, switches and exit work, not that the level is easy. Crater Fields, Crystal Caves, Meteor Mesa, Zarg Lookout (up to the roof key and back down), Marshmallow Meadows, Bonbon Playhouse, Fudge Bog, Mirror Shafts (which it solves by firing at the right moment, including the swivel's two-shot puzzle) the Sugar Glass Gallery (including its mural alcove), Frosting Flats, Frosting Spire (all three keys, up the tower and back down) and the Cocoa Foundry pass (the bot removes enemies, so press timing is tested separately); the Citadel's boss fight is not covered.

## Known gaps and deviations
- **Quick-save is progress-only.** The prototype serialised the whole simulation mid-level; the port saves progress at map granularity (F5 in a level saves progress, F9 returns to the map). Full mid-level snapshots need a serialisable world in Rust (planned).
- **Playability is only partly tested.** The playtest bot proves Crater Fields, Crystal Caves, Meteor Mesa, Zarg Lookout, Marshmallow Meadows, Bonbon Playhouse, Fudge Bog, Mirror Shafts, the Sugar Glass Gallery, Frosting Flats, Frosting Spire and the Cocoa Foundry can be finished without enemies. No human has played them, difficulty tuning and secret areas are still open questions, and the boss fight is untested.
- **Overworld simulation** lives in the same Rust world, but its light is flat (no lighting), like the prototype.
- **Cinematic text** uses the prototype's eight panels, which `STORY.md` records in full.
- **Fonts:** the overlay uses a system font stack (Space Grotesk, then system-ui) rather than loading webfonts, and does not yet use the Liminal HQ design-system tokens or components.
- **Sparse spatial grid / quadtree** for entity-entity tests is not built (O(n) per level, as in the prototype). Entities are cloned per tick; shots and effects still allocate, so the "no GC / no allocation in play" target is not met yet.
- **Cast shadows, WebGPU, Tauri shell, React overlay** from the spec are not started.
- **Gamepad** mapping is unit-tested but not exercised against real hardware.
- **Mobile and touch controls** are not implemented.
- **Bundle:** three.js dominates (~590 kB minified); no code splitting.
