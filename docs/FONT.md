# Fizz pixel font

Fizz is the pixel font family for Lieutenant Fizz. Every glyph is drawn once, as a grid of pixels, in `packages/engine/src/font/fizz-glyphs.ts`. The build turns those grids into outlines and writes the font files; nothing is drawn by hand in a font editor, and the generated files are committed so the game needs no build step to use them.

## Faces

| Family         | Styles                                       | File names                                                                    |
| -------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| Fizz           | Regular, Bold, Oblique, Bold Oblique         | `fizz-regular`, `fizz-bold`, `fizz-oblique`, `fizz-bold-oblique`              |
| Fizz Condensed | Regular                                      | `fizz-condensed`                                                              |
| Fizz Mono      | Regular, Bold (fixed advance)                | `fizz-mono-regular`, `fizz-mono-bold`                                         |

Each face is built as `.otf` and `.woff2` into `packages/engine/assets/fonts/`. Use the WOFF2 files on the web; the OTF files are for editors and other tools. The outlines are CFF, because the library that writes the files (opentype.js) produces OpenType-CFF; every pixel edge is a straight line, so CFF and TrueType outlines are equivalent for this font. Fizz Oblique and Fizz Bold Oblique carry the typographic subfamily names "Oblique" and "Bold Oblique" and the legacy "Italic" and "Bold Italic" names, so `font-style: italic` selects them.

## The grid

- A glyph is rows of `#` (ink) and `.` (blank), joined with `/`: `'.###./#...#/#...#/#####/#...#/#...#/#...#'` is a capital A.
- A cell is **11 rows**: 2 accent rows, 7 cap rows, 2 descender rows. The rows you write start at the cap top, so a capital is 7 rows and a glyph with a descender is 9. The build pads two empty accent rows on top.
- Capitals are 7 rows tall, lowercase letters without ascenders or descenders are 5 rows (the x-height), and descenders drop 2 rows below the baseline.
- Most letters are 5 pixels wide. `I`, `i`, `l`, punctuation and a few others are narrower, and some symbols and pictures are 7 wide. A glyph may be any width; the advance follows from it.
- The pictures (the 24 emoji) are 7×7 and single-colour. They keep their shape in every style.

## Metrics

| Metric               | Value                                                          |
| -------------------- | -------------------------------------------------------------- |
| Units per em         | 1100 (11 rows)                                                 |
| One pixel            | 100 units                                                      |
| Ascender             | 900 (the accent and cap rows)                                  |
| Descender            | −200                                                           |
| Line gap             | 200, a 13-row line; set `line-height` explicitly (see below)   |
| Cap height / x-height| 700 / 500                                                      |
| Advance              | (glyph width + 1) × 100, a one-pixel gap after every glyph     |
| Space                | 300                                                            |
| Mono advance         | (cell width + 1) × 100 for every glyph                         |

The top edge of row `r` sits at `900 − 100r`, so the baseline falls between rows 8 and 9.

## How each style is derived

The derivations are pure functions in `packages/engine/src/font/derive.ts`, each with unit tests.

- **Accents.** é è ê ë à â ç ô û ù î ï É È Ê À Ç Ô are composed from a base letter and a small mark. Marks for capitals fill the two accent rows, lowercase marks sit three rows above the x-height, the cedilla hangs in the descender rows, and î and ï use a dotless ı.
- **Box drawing.** Single and double lines, corners, tees and crosses are generated to the whole 6×11 cell so lines join. Set `line-height` to eleven pixels times your scale (`var(--lf-type-line)`) or vertical lines will break between rows.
- **Bold.** Each ink pixel also fills the pixel to its right, unless that would close a one-pixel gap between two strokes. A bold glyph is one pixel wider.
- **Oblique.** One pixel of shear for every three rows above the baseline. The advance stays the unslanted width; the slant reaches into the neighbour's space, so the left bearing can be negative.
- **Condensed.** Five-wide glyphs lose a column by merging the middle three (`[a, b|c, c|d, e]`). `M W m w 1 % # * × & + = / … « » — –`, the arrows, the triangles and the pictures keep their width.
- **Mono.** The cell is the widest trimmed letter or digit (not M, W, m, w) in that cut: 5 for Regular, 6 for Bold. Each glyph is trimmed and centred in one cell. A glyph wider than a cell (a picture, an em dash) takes a whole number of cells, centred, so columns after it still line up. Keycap ends and whole keycaps are the exception: they are sized to their label.

## Characters

- A–Z, a–z, 0–9, and the punctuation `. , : ; ! ? ' " - ( ) [ ] { } < > / \ & + = # % * @ $ ^ _ | ~ ``.
- ‽, curly quotes ‘ ’ “ ”, em dash —, en dash –, middle dot ·, ellipsis …, guillemets « », ×.
- Canadian French accents é è ê ë à â ç ô û ù î ï É È Ê À Ç Ô, and the dotless ı.
- Arrows → ← ↑ ↓ ↙ ► ◄ ▸, the solid triangles ▼ (U+25BC) and ▲ (U+25B2), the note ♪, the dots ● ○ and the block cursor ▌.
- Box drawing: ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ and the double set ═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬.
- The 24 pictures at their real code points: 🙂 😀 😉 😮 😢 😠 😎 ❤ ⭐ ✓ ✗ 👍 🍁 👽 🛸 🥤 ☕ 💾 🎮 🔊 🔇 🔒 ⚡ 🏆. They are plain single-colour outlines for now; a colour (COLR) version is a possible later addition.

The triangles ▼ and ▲ are 7 pixels wide and 4 tall, solid, and rest on the baseline (cap rows 3 to 6, inside the x-height), so they sit beside lowercase text as a "more" or scroll cue without towering over it. Their advance is 800 units. ▲ is ▼ flipped top to bottom.

## Button and keycap glyphs

These sit in the Private Use Area, so they never collide with real text.

| Code points      | Glyphs                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| `U+E000–E003`    | A, B, X, Y: round buttons with the letter cut out of the disc                       |
| `U+E010–E015`    | LB, RB, LT, RT, Start, Select: pill-shaped buttons with the label cut out           |
| `U+E0F0`, `E0F2` | Keycap left and right ends                                                          |
| `U+E0F1`         | Keycap centre: a blank stretch inside a label (used for spaces)                     |
| `U+E100–E15E`    | Keycap label characters: printable ASCII `U+0020–007E` drawn between the top and bottom edges |
| `U+E160–E163`    | Keycap label arrows ← → ↑ ↓                                                         |
| `U+E200–E208`    | Whole keycaps for Esc, Enter, Space, Ctrl, Alt, Shift, Tab, F5, F9                  |

The button letters are holes in the outline, so a button reads as a single-colour disc on any background. Inside a keycap the tails of g, j, p, q and y are cut to one row so they stop short of the keycap's lower edge.

### Writing hints

Two routes, which give the same glyphs:

1. **The `liga` feature.** The fixed tokens `{A} {B} {X} {Y} {LB} {RB} {LT} {RT} {Start} {Select}` and `{Esc} {Enter} {Space} {Ctrl} {Alt} {Shift} {Tab} {F5} {F9}` are ligatures. Plain text such as `{A} Select` renders with the button glyph in any browser that applies ligatures, which is on by default.
2. **`hintText()`.** `packages/engine/src/font/tokens.ts` rewrites tokens to private-use glyphs ahead of time. It also handles arbitrary labels: `{[Z]}` or `{Page Up}` become a left end, one glyph per character, and a right end. Use it when the label is not one of the fixed keys, and when the text may be wrapped (put each key in a `white-space: nowrap` span so it never breaks inside a label).

## Building

```bash
bun run build:font                                    # rebuild every face into packages/engine/assets/fonts
bun run check:font                                    # rebuild in memory and fail if the committed files differ
bun scripts/build-font.ts --specimen specimen.html    # also write a standalone specimen page
```

`bun run validate` runs `check:font`, and `packages/engine/src/font/build.test.ts` rebuilds the font and compares it to the committed OTF byte for byte, so a change to a glyph grid fails until the files are regenerated and committed. Builds are reproducible: the `head` timestamps are fixed.

The font is written by [opentype.js](https://github.com/opentypejs/opentype.js) 2, with ligatures added through its `substitution.addLigature`, and compressed to WOFF2 by `wawoff2`, a WebAssembly encoder that needs no native build. Both are dev dependencies. opentype.js stamps the `head` table's `modified` date from the clock and has no line gap option, so `finishFont` in `build.ts` rewrites both dates to 2026-01-01 and writes the 200-unit line gap into `hhea` and `OS/2`, recomputing the checksums that cover them. The tests read every built face back through the opentype.js parser.

The outline tracer (`outline.ts`) walks the edge of each shape's ink instead of emitting one square per pixel. Neighbouring pixels merge into one polygon, outer contours run clockwise and holes counter-clockwise (the build reverses them for CFF), points on straight runs are dropped, and pixels that touch only at a corner stay separate contours. A test checks that the traced area of every glyph in every face equals its ink exactly, which rules out overlaps and wrong winding.

### Exporting a specimen

`bun scripts/build-font.ts --specimen specimen.html` writes one HTML page with every face embedded as base64 WOFF2 and a sample of each character group. Open it in a browser to review, or take a screenshot to share. It sets `line-height` to eleven pixels times the scale so box drawing joins.

### The hero banner

The text in `assets/hero.svg`, the banner at the top of the README, is drawn from the glyph grids as vector shapes, so the banner needs no font to display and looks the same as an image anywhere, including the README on GitHub. `bun run build:hero` rewrites the generated block between the `hero-text` markers; `bun run check:hero` (part of `validate`) fails if the committed SVG is stale. Edit the text, colours and positions in `scripts/build-hero.ts`, not in the SVG.

### Adding a glyph

1. Add the grid to `RAW` (or `EXTRA`) in `fizz-glyphs.ts`, keyed by the character. Draw from the cap top: 7 rows, or 9 with a descender.
2. If it is a picture that should keep its shape in every style, add it to `EMOJI`. If it is a five-wide glyph that must not be condensed, add it to `WIDE`.
3. If it is an accented letter, add a row to `ACCENTS` in `derive.ts` instead of drawing it.
4. Run `bun run build:font`, look at the specimen, run `bun run test`, and commit the generated files together with the source.

## Rendering rules

These hold everywhere text is drawn with Fizz. They are what keeps the pixels square.

- **Whole-pixel sizes.** The font is 11 pixel rows tall, so `font-size` is `11px × n` for a whole number `n`, and each glyph pixel is exactly `n` CSS pixels. Never use `clamp()`, `vw`, `rem` fractions or any fractional size on pixel text. The shell exposes `--lf-px` (one glyph pixel) and `--lf-type-1` to `--lf-type-5` for this.
- **Line height** is a whole number of glyph pixels too, and exactly `11 × n` where box drawing must join.
- **Smoothing.** Overlay text sets `-webkit-font-smoothing: none`, `font-smooth: never` and `text-rendering: optimizeSpeed`. Load the faces with `@font-face` and `font-display: block`, so text never flashes in a fallback.
- **Scale from the viewport height.** `n` is 2 under 480 px tall, 3 up to about 900 px, and 4 above that. Options › Text size › Large adds one. Body text never goes below 2×.
- **Wrap long text** (dialogue, cinematic, credits, cards) at word boundaries.
- A device pixel ratio that is not a whole number cannot keep every glyph pixel on a device pixel, so edges can look slightly uneven there. At 1×, 2× and 3× the glyphs are exact.

## Licence

The font files are licensed under the SIL Open Font License 1.1 (`packages/engine/assets/fonts/OFL.txt`), copyright 2026 Liminal HQ, Scott Morris, with no Reserved Font Name. The licence text and URL are also in each file's name table. The code that generates the fonts (`scripts/build-font.ts` and `packages/engine/src/font/`) is licensed under Apache-2.0 OR MIT like the rest of the repository.
