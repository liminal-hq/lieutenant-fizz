repo: liminal-hq/lieutenant-fizz
branch: main

## Last sync
date: 2026-10-08T14:30:59Z

### Updated in this project
- New "App Icons" artboard: eight icon directions built from sibling Liminal HQ icons (Haptics Lab's new Phone Buzz icon, Cadence, Jar, Spindle, Afterglow)
- Launcher gained a desktop (Tauri) version and an App settings carousel stop

## Sync history
- 2026-10-08T14:11:05Z — Launcher artboard: Android launcher, two layering directions; slots from episodes/episode-1/src/slots.ts
- 2026-10-07T18:07:42Z — Menu System artboard: three retro menu directions built from the Episode 1 shell
- 2026-10-06T02:30:00Z — Credits scene and Mortimer stinger added; `stinger` sound effect in melting/audio.js

## Screen map
| Screen | Repo files |
|---|---|
| Melting Adventures (prototype, credits, stinger) | design/Melting Adventures.dc.html, design/melting/audio.js, docs/SERIES.md, docs/STORY.md |
| Credits and Stinger (artboard) | docs/SERIES.md, docs/GAME_DESIGN.md |
| Pixel Fonts (artboard) | packages/engine/src/palette.ts, design/melting/sprites.js |
| Menu System turn 2 (FizzMenuScreen.dc.html) | episodes/episode-1/src/game.ts, episodes/episode-1/src/story.ts, design/melting/sprites.js |
| App Icons (App Icons.dc.html) | haptics-lab-app: assets/icon/icon.svg · cadence: assets/icon/cadence-icon-dev.svg · jar: apps/jar/src-tauri/icons/source/ |
| Launcher (Launcher.dc.html, FizzLauncher.dc.html) | episodes/episode-1/src/slots.ts, episodes/episode-1/src/game.ts, site/episodes.json, docs/SERIES.md |
| Menu System (artboard) | episodes/episode-1/src/ui.ts, episodes/episode-1/src/ui.css, episodes/episode-1/src/game.ts, packages/engine/src/palette.ts, packages/engine/src/input.ts |

## Related
- liminal-hq/undertone (audio library, synced earlier): README.md, src/index.ts
