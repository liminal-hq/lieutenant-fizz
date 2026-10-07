# AGENTS.md

## Table of Contents

- [Project Status](#project-status)
- [Source of Truth](#source-of-truth)
- [Localization and Spelling](#localization-and-spelling)
- [Markdown Formatting](#markdown-formatting)
- [Authoring Voice](#authoring-voice)
- [Commit Messages](#commit-messages)
- [Pull Request Titles](#pull-request-titles)
- [Pull Request Content](#pull-request-content)
- [Pull Request Labels](#pull-request-labels)
- [Git Workflow](#git-workflow)
- [Codex Review Loop](#codex-review-loop)
- [Local Tooling](#local-tooling)
- [Code Conventions](#code-conventions)
- [Testing](#testing)
- [Documentation](#documentation)
- [Repository Layout](#repository-layout)
- [Licence and Copyright](#licence-and-copyright)
- [Agent Behaviour](#agent-behaviour)

## Project Status

Lieutenant Fizz (`liminal-hq/lieutenant-fizz`) is a monorepo for every episode of the retro platformer series, starting with Episode 1 (*Lieutenant Fizz — Episode 1: The Cocoa Caper*, arc one working title *Invasion of the Zargs*). All episodes share the Liminal Retro Engine at the repository root: a Rust simulation crate compiled to WebAssembly (`crates/sim`) and a TypeScript engine package (`packages/engine`) using Three.js, bundled with Vite and deployed to GitHub Pages under the `/lieutenant-fizz/` base path. Each episode lives in `episodes/episode-N/`. The repository is at an early stage, and the design documents are the ground truth for implementation. Update this file as parts move from plan to real implementation.

## Source of Truth

- `docs/ENGINE_SPEC.md` is the shared engine specification (renderer, simulation, lighting, audio, input).
- Each episode's `GAME_DESIGN.md` and `STORY.md` (for Episode 1, under `docs/` until moved into `episodes/episode-1/`) hold that episode's game design and its cinematic, dialogue and ending text.
- `design/` holds original design prototypes. They are reference only: their behaviour is authoritative only as captured in `docs/`, and their code is not to be ported or structurally mirrored.
- If code and docs disagree, resolve it deliberately: either change the code to match, or update the doc in the same branch with the reasoning.

## Localization and Spelling

**REQUIREMENT:** All UI strings, code identifiers, comments, commit messages, pull request descriptions and documentation MUST use **Canadian English** spelling, unless exact external spelling is required by tooling, APIs, platform interfaces or published identifiers (for example the CSS `color` property or the `Float32Array` API).

Examples:

- `colour` instead of `color`
- `centre` instead of `center`
- `neighbour` instead of `neighbor`
- `behaviour` instead of `behavior`
- `cancelled` instead of `canceled`
- `licence` (noun) vs `license` (verb)

## Markdown Formatting

**REQUIREMENT:** Do not hard-wrap markdown prose. Write each paragraph or bullet as a single unwrapped line in the source, no matter how long, and let the renderer reflow it. This applies to PR descriptions, docs under `docs/`, README files and any other markdown. Commit message bodies are the one exception: hard-wrap those (see [Commit Messages](#commit-messages)).

- This does not apply to genuinely separate list items, headings, or intentional line breaks.
- Code comments are not markdown-rendered and may wrap normally at a reasonable line length.

**Em dashes:** use a real em dash (`—`) in prose, never `--` as a substitute. This does not apply to a double-hyphen with another meaning (a CLI flag such as `--check`, a numeric range).

## Authoring Voice

**REQUIREMENT:** Ship the result, not how the conversation arrived at it. Write every outward-facing line (code comments, identifier names, docs, PR descriptions) as the author of the artefact, for the reader who will encounter it later.

- Don't reference "this PR", "the review", a reviewer's name, or a commit SHA inside code comments or PR prose. State the fact or reasoning directly.
- When a comment is edited more than once, rewrite it as one clean explanation rather than stacking fragments.
- Commit messages are the exception: they are the right place to record _why_ a change happened, including review feedback or debugging context. The `## Test plan` section of a PR description is a similar exception.

## Commit Messages

**Format:** Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `build:`, `chore:`, `refactor:`, `perf:`).

- Use `test:` for test-related changes, including fixes to tests themselves. Use `fix:` only when it fixes application code.
- Use `ci:` or `build:` when the primary change is workflow or build behaviour.
- Keep each commit focused on the specific change made in that commit; describe the now, not the whole project history.

**Body requirements:**

- Explain what and why (not how).
- Use markdown: **bold**, _italics_, `code`, flat bullet lists. No markdown headings; use **bold labels** if sections are needed.
- **Backtick every code-level reference**: function, type and variable names, file and directory paths, crate and package names, config keys and CLI flags (for example `crates/sim/src/lib.rs`, `vite.config.ts`, `--check`). Plain-English descriptions and in-game text use quotes, not backticks.
- Hard-wrap paragraphs at roughly 72-100 characters.
- End with the agent co-author trailer when an agent authored the commit.

**Shell interpolation safety:**

- Do not pass markdown-heavy bodies through `git commit -m "..."` when they contain backticks, `$()` or other shell-sensitive characters.
- Write the message to a file with a single-quoted heredoc and commit with `git commit -F <file>`.
- Verify with `git log -1 --pretty=fuller` and amend immediately if interpolation altered the text.

## Pull Request Titles

**REQUIREMENT:** PR titles are human-readable summaries of the change.

- Start with a capital letter, use the imperative mood, and keep to roughly 70 characters.
- Do not use Conventional Commit prefixes in PR titles.
- Describe the outcome or behaviour change, not internal process.
- Keep title style consistent across every open PR in a stack, and update the rest of the stack if one changes.
- Do not rename merged PRs unless explicitly requested.

## Pull Request Content

- Do not mention local planning files, internal queue notes or other workflow-only artefacts in PR titles or descriptions unless explicitly requested.
- Open pull requests ready for review by default. Use a draft only when asked or when there is a clearly communicated blocker.
- Default structure: `## Summary` (flat bullets with bold lead-ins; optional `###` sub-sections such as `### Engine`, `### Simulation`, `### Gameplay`, `### Documentation`) followed by `## Test plan` (checklist bullets with concrete commands, and an explicit statement of anything that could not be verified).
- Keep the summary focused on outcomes and behaviour changes, not commit chronology.
- The pull request template in `.github/pull_request_template.md` follows this structure.

## Pull Request Labels

Add labels to every PR when it is created and keep them accurate as scope changes.

- **Primary category (at least one):** `enhancement`, `bug`, `documentation`, `testing`, `ci`, `build`, `chore`.
- **Operational:** `infrastructure`, `internal`, `blocked`, `skip-changelog`.
- **Scope:** `engine`, `episode-1`, `rendering`, `sim`, `rust`, `wasm`, `gameplay`, `audio`, `input`, `deploy`, `ui`, `frontend`, `pages`, `level-design`, `story`, `art`, `design-docs`.
- Prefer GitHub category labels (`enhancement`, `bug`) over Conventional Commit terms (`feat`, `fix`).

## Git Workflow

**REQUIREMENT:** Do not push (especially force-push) unless explicitly requested by the user.

- **Merge commits only.** Pull requests are merged with a merge commit: never squash and never rebase-merge, so the focused commit history on a branch is preserved. Do not rewrite history that has been pushed.
- **Branch naming:** `feat/<short-description>`, `docs/<short-description>`, `chore/<short-description>`; for fixes, `fix/issue-<number>-<short-description>` (for example `fix/issue-12-coyote-time`).
- **Focused commits:** when work splits naturally into implementation, validation and docs, use separate contextual commits.
- **Stage explicitly:** use `git add <specific paths>`, never `git add -A` or `git commit -a`, because other agents and people may be committing in the same checkout. Retry on an `index.lock` collision rather than deleting the lock.
- Do not commit local planning or scratch files, or large source archives (`*.zip` is ignored), unless asked.
- **GitHub tooling:** prefer the `gh` CLI for repository, pull request, label, review and Actions work.

## Codex Review Loop

Pull requests are reviewed by Codex. After opening a PR, follow the `codex-pr-review-loop` skill from `liminal-hq/skills`:

- Watch CI and read each review finding in full.
- Reproduce the reported problem before fixing it, then verify the fix closes it and check for regressions.
- Reply in-thread with evidence (the command run, the result, the commit that fixes it), and request re-review.
- Repeat until the review is clean, then wait for the user's explicit go-ahead before merging. Never merge on your own initiative.

## Local Tooling

The stack is **Bun** workspaces (package manager and script runner; not npm, pnpm or yarn) plus a Cargo workspace, with TypeScript, Vite, Three.js, and a Rust crate at `crates/sim` compiled to WebAssembly. Pin versions in `package.json`, `rust-toolchain.toml` and the lockfiles, and commit lockfiles.

```bash
bun install          # install dependencies
bun run dev          # Vite dev server (episode selected by the script or --cwd episodes/episode-1)
bun run build        # production build (WASM + TypeScript + Vite)
bun run test         # TypeScript tests
bun run check:headers  # verify the licence header on every source, workflow and shell file
bun run test:rust   # Rust tests across the Cargo workspace (same as `cargo test --workspace`)
cargo test -p lf-sim # Rust simulation core tests only
```

Treat `package.json` scripts as the source of truth for exact commands; if a script named here does not exist yet, add it rather than inventing an ad hoc invocation. If the Rust toolchain or `wasm32-unknown-unknown` target is unavailable on the host, install it with `rustup` or use a container with the toolchain preinstalled. `bun run validate` (format, lint, type-check, tests, the Rust checks and build) is the preferred pre-PR gate.

## Code Conventions

- **TypeScript:** strict mode, no `any` without a justifying comment, prefer `const` and readonly data, explicit return types on exported functions.
- **No barrel files.** Do not create an `index.ts` that only re-exports siblings; import from the file that defines the thing.
- **Engine versus episode:** anything reusable across episodes (simulation rules, renderer, input, audio, lighting) belongs in `crates/sim` or `packages/engine`; episode folders hold only that episode's levels, assets, tuning, story and entry point. An episode that has its own game rules (levels, enemies, bosses, scene drawing) owns a Rust crate of its own, such as `episodes/episode-1/game` (`lf-episode-1`), which builds on `crates/sim` and produces that episode's WASM. Episodes depend on the engine, never on each other, and the engine never imports from an episode.
- **Simulation boundary:** deterministic game simulation (physics, collision, entity rules, timing) belongs in `crates/sim` and is exposed to TypeScript through a raw C-ABI export surface (plain `extern "C"` functions plus shared linear memory, built with `cargo build --target wasm32-unknown-unknown`; no `wasm-bindgen`). TypeScript renders, handles input and audio, and reacts to simulation state; it does not re-derive simulation rules. Keep `crates/sim` free of I/O and browser dependencies beyond the export layer so it stays testable natively with `cargo test`.
- **Determinism:** the simulation takes a fixed timestep and a seeded RNG; no wall-clock time or unseeded randomness inside it.
- **Rust:** `cargo fmt` and `cargo clippy -- -D warnings` clean; no `unsafe` without a documented justification.
- **Rendering:** dispose of Three.js geometries, materials and textures you create; avoid per-frame allocations in hot loops.
- **Formatting:** use the repository's Prettier and `rustfmt` configuration; do not hand-format against it.
- **Assets:** keep generated build output (`dist/`, `target/`, WASM `pkg/`) out of version control.

## Testing

- Verify relevant changes before considering work complete, and state exactly what was and was not run.
- Simulation behaviour gets Rust unit tests in `crates/sim`; TypeScript logic gets tests alongside it. Fix a bug with a test that fails before the fix.
- For visual or gameplay changes that tests cannot cover, run the game in a browser and say what was checked.
- If verification is blocked by environment limits, say so plainly in the PR's `## Test plan`.

## Documentation

- Update the relevant document in the same branch when behaviour changes: `docs/ENGINE_SPEC.md` for renderer, simulation, lighting, audio or input; the episode's `GAME_DESIGN.md` for gameplay, levels and tuning; its `STORY.md` for narrative text; `README.md` for setup and deployment.
- Prefer stable reference docs over burying decisions in code comments or PR threads.
- No hard wrapping: see [Markdown Formatting](#markdown-formatting).

## Repository Layout

Bun workspaces + Cargo workspace:

- `crates/sim` — shared Rust simulation crate (`lf-sim`), game-agnostic; linked into each episode's WASM rather than shipped alone
- `packages/engine` — shared TypeScript engine: rendering, input, audio and the WASM bridge
- `episodes/episode-N/` — one folder per episode (levels, assets, tuning, story, entry point); starts with `episodes/episode-1`
- `episodes/episode-N/game` — the episode's own Rust crate (for Episode 1, `lf-episode-1`), compiled to that episode's WASM
- `docs/` — engine spec and cross-episode design (the source of truth)
- `design/` — original design prototypes, reference only
- `site/` — static landing page published at the Pages root, with episodes listed in `site/episodes.json`
- `scripts/` — shell scripts for the WASM build, the site assembly and repository checks, and `build-font.ts`, the Bun script that builds the Fizz font (its logic lives in `packages/engine/src/font`; see `docs/FONT.md`)
- `.github/` — workflows (Pages deploy and CI), pull request and issue templates

**Adding an episode:** create `episodes/episode-N/` as a Bun workspace package that depends on `packages/engine`, add its design and story docs, add it to the workspaces list, and extend the Pages build so it publishes under `/lieutenant-fizz/episode-N/` (the site base path is `/lieutenant-fizz/`). If the episode needs engine changes, make them in `crates/sim` or `packages/engine` in a separate focused commit (or PR) and update `docs/ENGINE_SPEC.md`.

## Licence and Copyright

This project is dual-licensed under Apache-2.0 OR MIT (`LICENSE-APACHE`, `LICENSE-MIT`).

**REQUIREMENT:** New and substantially rewritten source files (`.rs`, `.ts`, `.tsx`, `.js`) MUST begin with a licence and copyright header:

```
// Brief one-line summary of what this file does.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
```

For GitHub Actions workflow YAML and shell scripts, use the same header with `#` comments. Do not add headers to markdown, JSON, lockfiles or other generated or config-only files. The generated font files in `packages/engine/assets/fonts` are the exception to the repository licence: they are licensed under the SIL Open Font License 1.1 (`OFL.txt` beside them), and the font build code keeps the standard header.

## Agent Behaviour

- Read the relevant `docs/` section before implementing, and follow it.
- Make the change that was asked for; avoid speculative scaffolding and unrelated refactors.
- Do not push, merge, force-push, or alter shared settings without explicit instruction.
- State uncertainty and unverified items plainly rather than implying success.
- Stay within your assigned files when several agents work in the same checkout.
