# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Lieutenant Fizz (`liminal-hq/lieutenant-fizz`) is a monorepo for all episodes of a retro platformer series (Episode 1 is *The Melting Adventures of Ben "Lieutenant Fizz" Blaze*), built on the shared Liminal Retro Engine: a Rust simulation crate (`crates/sim`) compiled to WebAssembly, a TypeScript engine package (`packages/engine`) using Three.js, bundled with Vite and deployed to GitHub Pages under `/lieutenant-fizz/`. See `AGENTS.md` for the authoritative contributor conventions — most importantly: **Canadian English** spelling everywhere; **Conventional Commits** for commit messages but **never in PR titles**; **merge commits only** when merging PRs; the licence/copyright header on new source files; **no barrel files**; and **no pushes unless explicitly asked**.

`docs/ENGINE_SPEC.md` plus each episode's `GAME_DESIGN.md` and `STORY.md` are the source of truth for design. `design/` holds original prototypes and is reference only: do not port or mirror its code.

## Layout

Bun workspaces + Cargo workspace:

- `crates/sim` and `packages/engine` — the shared engine; anything reusable across episodes goes here
- `episodes/episode-N/` — one folder per episode (levels, assets, tuning, story, entry point), starting with `episodes/episode-1`
- `docs/` — engine spec and cross-episode design; `design/` — reference prototypes

Episodes depend on the engine, never on each other, and the engine never imports from an episode. To add an episode, follow "Adding an episode" in `AGENTS.md` → Repository Layout.

## Commands

```bash
bun install          # install dependencies
bun run dev          # Vite dev server
bun run build        # production build
bun run test         # TypeScript tests
cargo test -p sim    # Rust simulation tests
```

`package.json` scripts are the source of truth; prefer `bun run validate` as the pre-PR gate once it exists. Use Bun, not npm, pnpm or yarn.

## Architecture — the key things to understand

**The Rust crate owns the simulation; TypeScript owns presentation.** Deterministic game rules (physics, collision, entity behaviour, timing) live in `crates/sim` behind a narrow `wasm-bindgen` surface, with a fixed timestep and seeded RNG. TypeScript renders with Three.js, handles input and audio, and reacts to simulation state; it never re-derives sim rules.

**Docs lead, code follows.** When behaviour changes, update the matching doc in the same branch.

## Conventions (from AGENTS.md)

- **PR titles**: human-readable, imperative, sentence case, ~70 chars, no Conventional Commit prefix. Descriptions use `## Summary` + `## Test plan`. Every PR gets a category label plus scope labels. PRs open ready for review, not as drafts.
- **Commits**: Conventional Commits with markdown bodies (what/why; `test:` for test-only changes), hard-wrapped; write bodies to a file and use `git commit -F` when they contain backticks. Stage with `git add <specific paths>`, never `-A` or `-a`. End with the `Co-Authored-By` trailer.
- **Merging**: merge commits only (no squash, no rebase-merge), and only after the user's explicit go-ahead. Run the `codex-pr-review-loop` skill on each PR until the review is clean.
- **Licence headers** on new or substantially rewritten `.rs`/`.ts`/`.tsx`/`.js` files (one-line summary + `(c) Copyright 2026 Liminal HQ, Scott Morris` + `SPDX-License-Identifier: Apache-2.0 OR MIT`).
- **No hard wrapping** in markdown prose; use a real em dash (`—`), never `--`.
- **Authoring voice**: comments and PR prose state facts directly; no "this PR" or reviewer references.
- **Git**: never push (especially force-push) unless explicitly asked; prefer the `gh` CLI for GitHub work.

Keep this file and `AGENTS.md` in sync: when a convention changes there, update the summary here in the same PR.
