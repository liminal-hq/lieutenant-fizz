# Lieutenant Fizz

<p align="center">
  <img src="assets/hero.svg" alt="Lieutenant Fizz — a spaghetti with meatballs flying saucer over the crystals and chocolate rivers of Planet Zargoth" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-early%20development-f97316" alt="Status: early development">
  <img src="https://img.shields.io/badge/platform-web%20(WebGL2)-1f6feb" alt="Platform: web, WebGL2">
  <img src="https://img.shields.io/badge/licence-Apache--2.0%20OR%20MIT-3fb950" alt="Licence: Apache-2.0 OR MIT">
</p>

*The Melting Adventures of Ben "Lieutenant Fizz" Blaze* — a series of Keen-style platformers with a 16-colour EGA palette, bright and fun in the spirit of *Goodbye, Galaxy!* and *Aliens Ate My Babysitter*. Every episode runs on the Liminal Retro Engine: a deterministic Rust simulation core compiled to WebAssembly, drawn by a thin Three.js WebGL2 layer in a single instanced draw call, with music and sound written for [Undertone](https://github.com/liminal-hq/undertone).

The first episode is **Episode 1: The Cocoa Caper**.

> **Status:** early development. The game and engine are fully playable as a browser prototype (kept in [`design/`](design/) for reference), and the specification records which parts of it are proven. This repository is where that prototype becomes the real thing: the shared engine and the Rust → WASM simulation core at the root, with each episode under `episodes/`. There are no releases yet. When the Pages deploy is live, the series lands at [liminalhq.ca/lieutenant-fizz](https://liminalhq.ca/lieutenant-fizz/) and Episode 1 at [liminalhq.ca/lieutenant-fizz/episode-1](https://liminalhq.ca/lieutenant-fizz/episode-1/).

## Episode 1: The Cocoa Caper

Billy, 14, has vanished. His cousin Ben, 10, finds a secret lab under their treehouse, a prototype spaghetti with meatballs flying saucer, and Billy's map with an X marked *Planet Zargoth*. He straps on his bicycle helmet and follows him.

The saucer has a noodle-upholstered seat, a breadstick yoke, meatball thrusters and marinara exhaust. Zargoth has shining, twinkling crystals, chocolate rivers, mechanical hover platforms, frozen chocolate spikes, and cake buildings with cookie doors. The Zargs are stealing Earth's cocoa beans to refill the planet's drying chocolate rivers, and Billy went after them and was captured. Somewhere behind it all is Mildred McMire, 10, who is building the galaxy's largest chocolate castle to live in.

The full opening cinematic, boss dialogue and ending are in [`docs/STORY.md`](docs/STORY.md).

### The journey

1. Title screen, then a six-panel opening cinematic (skippable).
2. **The overworld:** a top-down crystal forest split by chocolate rivers. Teleporter pairs power up as levels are cleared, and the game autosaves on every visit.
3. **Crater Fields:** the tutorial biome — slopes, pogo, fizz, chocolate pools and a red gumdrop door.
4. **Crystal Caves:** darker tunnels lit by crystals and Ben's lantern, with hover platforms, a bridge switch, bats and a blue gumdrop door.
5. **Mildred's Citadel:** a boulder ramp, sentries and phantoms, then the boss arena, the security terminal and Billy's cage.
6. A four-panel ending and a score card.

## How it plays

- **Run and jump.** Variable-height jump (release early to cut it short), a 7 tiles/s top speed, and momentum on the ground and in the air.
- **Pogo.** Toggle it on and Ben bounces automatically; hold jump for a high bounce of about 6.6 tiles. Stomping enemies while pogoing bounces higher.
- **Fizz Blaster.** Cream soda bubbles stun enemies for 6 seconds and never kill. Aim up, or down while airborne. Cream soda cans refill it.
- **Stomp.** Landing on most enemies stuns them for 3 seconds.
- **Keys and doors.** Red and blue gumdrops open matching cookie doors.
- **Snacks and lives.** Cheezies, chocolate bars and fudge cookies are worth points; every 100 earns an extra life.
- **A rogues' gallery.** Eleven enemy types, from gloop slugs and crystal bats to Zarg phantoms and gravity drones, each built on a reusable behaviour template, ending with Mildred's Cocoa Colossus.
- **Two control layouts.** Keen-style (Ctrl jump, Alt pogo, Space fire) or modern (Z, X, C), with arrows or WASD to move and standard gamepad support.
- **Quick-save.** F5 saves the full simulation and F9 loads it.

The complete mechanics, collectibles, enemy roster and controls are in [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

## The Liminal Retro Engine

The engine is game-agnostic. Simulation runs separately from rendering: a deterministic fixed-step core writes into a shared buffer, and a thin WebGL layer draws everything in one instanced call, with lighting from generated normal maps and a DOM overlay (using the Liminal HQ design system) for the HUD, menus, dialogue and sound captions.

| Layer           | Target                                                    | Prototype stand-in                                                                |
| --------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Simulation core | Rust → WASM (`wasm32-unknown-unknown`), ECS               | `melting/engine.js` (plain JS, same data layout and tick boundary)                |
| Renderer        | Three.js r160+ over WebGL2 (WebGPU later)                 | Same: one `InstancedBufferGeometry` + `ShaderMaterial`                            |
| Shell           | Tauri v2                                                  | Browser tab                                                                       |
| Audio           | Undertone (`@liminal-hq/undertone`)                       | `melting/audio.js`: tries Undertone, falls back to a built-in mini-notation synth |
| UI              | DOM overlay (React)                                       | Design Component shell                                                            |
| Memory          | Shared linear `Float32Array`                              | Pre-allocated `Float32Array`, 120,000 × 20 floats (9.6 MB)                        |

The full specification — camera, atlas, instancing, physics, culling, lighting, audio, input and performance targets — is in [`docs/ENGINE_SPEC.md`](docs/ENGINE_SPEC.md).

## Repository layout

The repository is a monorepo for every Lieutenant Fizz episode. The layout below is the plan, and it fills in as the port from the prototype lands.

| Path                   | What it is                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `crates/sim`           | The Rust simulation core, compiled to WebAssembly — physics, collision, entity rules and timing |
| `packages/engine`      | The shared TypeScript engine: Three.js renderer bridge, input, audio and the DOM overlay        |
| `episodes/episode-1`   | *The Cocoa Caper*: its levels, sprites, music and story                                         |
| `docs/`                | The engine specification, game design and story text — the ground truth for implementation      |
| `design/`              | The original playable prototype and the Liminal HQ design system, kept for reference            |
| `.github/workflows/`   | CI and the GitHub Pages deploy                                                                  |

The split is one sentence: deterministic simulation lives in the Rust core behind a narrow `wasm-bindgen` surface; TypeScript renders, handles input and audio, and reacts to simulation state without re-deriving its rules. [`AGENTS.md`](AGENTS.md) (mirrored for Claude Code in [`CLAUDE.md`](CLAUDE.md)) covers contributor conventions.

## Getting started

You will need [Bun](https://bun.sh) and a Rust toolchain with the `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`), plus [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) for the simulation build.

```bash
bun install
bun run dev      # Vite dev server
bun run build    # production build: WASM, TypeScript and Vite
bun run test     # tests
bun run lint     # lint
```

The `package.json` scripts are the source of truth for exact commands. The Rust core also tests natively with `cargo test`.

Until the port catches up, you can play the prototype by opening [`design/Melting Adventures.dc.html`](design/Melting%20Adventures.dc.html); [`design/Last Light.dc.html`](design/Last%20Light.dc.html) is the first engine test scene.

## Status and roadmap

[`docs/ENGINE_SPEC.md`](docs/ENGINE_SPEC.md) marks every engine feature as **Proven** (working in the prototype) or **Planned** (not built yet), and that is the roadmap:

- **Proven in the prototype:** the orthographic camera, the palette-indexed atlas, single-draw-call instancing, the zero-allocation render bridge, 60 Hz fixed-step physics with slopes, one-way platforms and moving platforms, culling, autosave and quick-save, normal-mapped lighting with day and night profiles, and the DOM overlay.
- **Planned:** the Rust port of the simulation (with `f64` state and pooled allocation), a sparse grid or quadtree for entity–entity tests, cast shadows, the Tauri shell (including capturing Ctrl and Alt so they don't trigger browser shortcuts), and a WASM build under 2 MB.

Open design questions for Episode 1 — difficulty tuning, secret areas, whether death keeps collected snacks, and Mortimer's role in Episode 2 — are listed at the end of [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

## Part of Liminal HQ

Lieutenant Fizz is a [Liminal HQ](https://liminalhq.ca) project. Its audio is written for [Undertone](https://github.com/liminal-hq/undertone), and its UI shares the Afterglow design system with [Jar](https://github.com/liminal-hq/jar), [Waypoint](https://github.com/liminal-hq/waypoint) and the rest of the family.

## Licence

Licensed under either of the [Apache License, Version 2.0](LICENSE-APACHE) or the [MIT licence](LICENSE-MIT), at your option.
