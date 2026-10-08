# Website

The static website published at <https://liminalhq.ca/lieutenant-fizz/>, styled as **Fizz BBS**: a dial-up bulletin board in the 16-colour EGA palette. It has no build step and no dependencies, and every link is relative, so it works under any subpath. It shows only released content: unreleased episodes appear as locked menu rows with no details.

- `index.html` is the front page: a main menu, then a release log of episodes (newest first, each typed as an `EPISODEn.TXT` file) and `KEYS.TXT`, the controls.
- `guide/` is the game guide, each section typed as a text file at the `C:\FIZZ\GUIDE>` prompt. Its facts come from `docs/GAME_DESIGN.md`, so update the guide when the enemies, items, levels or controls change.

## Shared pieces

`css/bbs.css` holds the look every page shares; a new page links `css/fonts.css` and `css/bbs.css`, then its own stylesheet for anything particular to it (`css/site.css` for the front page, `css/guide.css` for the guide). Copy the header, status bar, menu bar and footer from an existing page so they stay the same everywhere.

| Piece | Markup |
| --- | --- |
| Status bar | `<div class="status"><div class="wrap">` with three `<span>`s (node, connection, sysop) |
| Menu bar | `<nav class="menubar" aria-label="Site"><ul class="wrap">` with Home, Game guide, GitHub, Docs and Liminal HQ; mark the current page with `aria-current="page"` |
| Page | `<main class="wrap screen">`, a column with even gaps |
| Masthead | `.masthead` with the EGA strip (`.ega`, sixteen empty `<span>`s), a caller greeting (`.greet`, in the `*** ... ***` style), the `h1`, a `.lede` and `.sprites` |
| Box | `.box` is a double-ruled box; add `pink`, `yellow`, `cyan`, `grey` or `dark` for its colour. `.box-title` is its small capitals heading, `.box-head` a heading row |
| Prompt | `<p class="prompt"><span class="ps">C:\FIZZ&gt;</span> type FILE.TXT</p>` above a box; end a page with an `aria-hidden` prompt holding `<span class="cur"></span>`, the blinking cursor |
| Menu | `<ol class="menu">` of links holding `.num` (`[1]`, `aria-hidden`), `.label` and `.file` (`ok` green, `lock` red); a locked row is `<li class="locked"><div class="row">` |
| Button | `.btn` (yellow, or `.btn.grey`) |
| Footer | `<footer class="wrap foot">`: the `logoff` prompt, the credits line, "Designed & coded in Canada" and `NO CARRIER` |

### Type and colour rules

- All text is Fizz (headings) or Fizz Mono (body), and the font is only crisp at whole-pixel sizes, so every size is `calc(11px * n)` with n from 2 to 6, line heights are whole multiples of n, and there is no letter spacing. Never use rem, em, vw or clamp for a type size. `e2e/site.spec.ts` checks this on every page.
- Colours are the sixteen EGA colours (`--ega-*`). EGA dark grey is too faint for text on black, so dim labels use `--dim` (`#888888`).
- Sprites are `img.spr`, scaled with `zoom` by a whole number (`.x1`, the default 2, `.x4`). `zoom` also scales a `min-width`, so never set one on a sprite.
- The cursor stops blinking under `prefers-reduced-motion`.

`assets/fonts` is a link to `packages/engine/assets/fonts` (the Pages build copies the real files, with their `OFL.txt` licence). The sprites in `assets/sprites/` are SVG files generated from the game's own sprite grids by `bun run build:sprites` (`scripts/build-sprites.ts` lists them); `validate` fails if they are stale. `assets/episode-1.jpg` is the page's social preview image (`og:image`).

## Adding an episode

`js/site.js` builds the front page's episode rows and release log from `episodes.json`. Without JavaScript the page keeps its static Episode 1 menu row and log block.

```json
{
  "id": "episode-2",
  "number": 2,
  "title": "Title",
  "status": "playable",
  "path": "./episode-2/",
  "file": "FIZZ2.EXE",
  "kind": "DOOR GAME",
  "blurb": "One or two sentences."
}
```

- `status` is `playable` or `coming-soon`. A coming-soon episode needs only `id`, `number` and `status`: it gets a locked "Episode N · coming soon" row at the bottom of the menu and nothing in the log, so its title and plot stay private until release.
- Playable episodes get menu rows at the top, newest first, linking to `path`. The newest also fills the yellow `EPISODEn.TXT` box beside the menu (with a NEW badge once there is more than one); older ones follow below it in grey boxes, above `KEYS.TXT`.
- `file` is the name shown on the menu row (default `FIZZn.EXE`), `kind` the label after "EPISODE N" in the log, and `blurb` the log's paragraph.
- When an episode ships, fill in its fields and flip `status` to `playable`. If it becomes the newest, also update the static fallback row and block in `index.html`.

## Pages artifact layout

The workflow assembles:

```
<artifact>/             <- contents of site/ copied here (index.html, guide/, css/, js/, assets/, episodes.json)
<artifact>/episode-1/   <- episode 1's built dist (index.html at its root)
<artifact>/episode-N/   <- one per episode, directory name = the `id` in episodes.json
```

```sh
mkdir -p _site && cp -r site/. _site/
cp -r episodes/episode-1/dist _site/episode-1   # repeat per episode
```

Each episode must build with a base path of `/lieutenant-fizz/episode-N/` (or relative assets). Preview locally with `python3 -m http.server -d _site`.
