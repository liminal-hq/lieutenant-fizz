# Mobile implementation plan

**Status: in progress (slices 0 to 3 built).** This is the build plan for [MOBILE.md](MOBILE.md): what to change in the code, in what order, how each step is tested and what "done" means. It is web-first. Touch, the phone layout and basic haptics extend the game as it is today and ship on the website, with no Tauri and no new app. [APP.md](APP.md) (the launcher and the Tauri app) comes after, and reuses everything here.

## Principles
- **Playable on a phone as early as possible.** The first two slices are enough to play Crater Fields with two thumbs.
- **Pure logic, thin DOM.** Touch geometry, bit mapping, hint choice and the haptics cue table are pure functions with unit tests, following the repo's convention (no DOM in vitest). The DOM layers only wire events to them.
- **Engine owns the mechanism, the episode owns the content.** The touch controller, the haptics runtime and the input plumbing live in `packages/engine`. The look of the controls, the cue table and the copy live in `episodes/episode-1`.
- **No new rules in the sim.** Touch and haptics are presentation. The one sim touch is reading state the shell may not see yet (pogo on or off), and that is a read-only export.
- **Docs lead, code follows.** Each slice updates MOBILE.md and STATUS.md in the same pull request.
- **Each slice ends with `bun run validate` green** and the touch e2e added in slice 2 passing.

## What the code does today
Findings from reading the current code, with the seams each slice uses.

**Input** (`packages/engine/src/input.ts`)
- Held bits are LEFT 1, RIGHT 2, UP 4, DOWN 8, JUMP 16, POGO 32, FIRE 64, CONFIRM 128, mirrored in `episodes/episode-1/src/sim/protocol.ts` and the Rust world. There is no menu bit: pause, confirm, quick save and zoom are `Command`s emitted from the private `onKeyDown`.
- `InputManager.peek()` ORs keyboard bits and gamepad bits and is called once per frame (menus) and again by `poll()` in each fixed step. The shell passes **held** bits and the sim does its own edge detection, so a tap shorter than one 1/60 s step would be lost. Touch needs a latch (as `confirmPending` already does for Enter).
- `InputDevice` is `'keyboard' | 'gamepad'` with a pure, tested `nextDevice`. Touch is a third value.
- Menus read the same bits: UP and DOWN edges move, JUMP or FIRE edges activate. A touch JUMP button that fed the menus would activate the highlighted row, so touch bits must be ignored outside play. The `blocked` flag in `InputManager` looks like the intended hook and is unused.
- Pogo is a **toggle** on the POGO edge, so its button is a tap that raises the bit for at least one tick. Jump height depends on JUMP staying **held**. UP with FIRE aims up. DOWN aims down only in the air or on a ladder, and looks down on the ground.

**Overlay and CSS** (`episodes/episode-1/src/ui.ts`, `ui.css`, `index.html`)
- `#stage` holds `#sky`, `#gl`, `#fx` and `#ui` (`pointer-events: none`). Menus, cards, the letterbox, dialogue, credits and the stinger turn `pointer-events` on.
- Every pointer handler is a `click`, plus `mouseenter` for hover-select. There is no pointer handling in play. An Options row only cycles forward on a click.
- There is no `viewport-fit=cover`, no `env(safe-area-inset-*)`, no `touch-action`, no `user-select: none`, no tap-highlight rule, and `100vh` is used where `100dvh` is needed. `#hud` and `#panelBtn` sit at a fixed 16 px.
- `layout.ts` computes the `--lf-*` variables from `window.innerWidth` and `innerHeight` and listens to `resize` only (no `orientationchange` or `visualViewport`). At 844×390 and 740×360 the type scale is n = 2, so rows are about 26 px tall and need padding to reach 48 dp.
- The hint bar is built from the pure `hints.ts` (`HintContext { device, layout }`). The Controls screen has three fixed columns and the pause menu shows F5 and F9, which mean nothing on touch.

**Canvas** (`packages/engine/src/renderer.ts`, `Game.frame`)
- The pixel ratio is capped at 2. A phone at DPR 2.6 to 3.5 therefore renders at 2× and is stretched by the browser, so sprite pixels have uneven widths. The camera shows a fixed 13 tiles of height and derives the horizontal span from the aspect, so tile size is `height / 13`, not a whole number of device pixels.
- The URL bar changes `innerHeight` and with it the zoom. On a 390 dp tall phone a sprite pixel is about 1.9 CSS pixels.

**Flow** (`episodes/episode-1/src/game.ts`)
- The `pause` command, `onVisibility` (auto-pause and audio suspend on `visibilitychange` and `pagehide`), the audio unlock on the first `pointerdown` and `keydown`, and `debugShow` already exist. Window `blur` only clears keys, and there is no wake lock, fullscreen, orientation or manifest anywhere.
- Cinematic, dialogue, ending, credits and stinger advance on JUMP or FIRE edges, Enter, or their on-screen Continue and Skip buttons. There is no tap-to-advance on the text area.

**Options** (`options.ts`)
- Key `lf-ep1-options-v1`. `parseOptions` fills missing fields from defaults, so adding a field needs no version bump. A new row needs: the `Options` field, `DEFAULT_OPTIONS`, `parseOptions`, a `CHOICES` entry in `stepOption`, a row in `OPTION_ROWS`, a value-text branch in `optionItems()` (it silently falls through to the Motion text for an unknown key) and an `applySettings` case.

**Events for haptics**
- The sim raises `Ev.CAPTION` with a caption id, and `Game.caption()` calls `audio.caption(text)`. That call is the hook for cue haptics. The ids are the `Cap` enum in `episodes/episode-1/game/src/text.rs`. The ones that matter: Jump, Boing (pogo bounce), Kick (wall-kick), Fzzt (fizz shot), NoFizz, Bonk (stomp stun), Sproing and Bwomp (marshmallow), Whoa (hurt), Crunch (snack), ExtraLife, the gumdrop and USB pickups, TaDa (level win), Zzzap (boss hit), Thoom (boss slam), Clang (dome open), Fizzled and Poof (enemy gone). Menu feedback is `audio.play('menu')` and `audio.play('click')`.

## Architecture
### Touch input (engine)
- **`packages/engine/src/touch.ts`** (pure, tested; built in slice 1, with no UI): the geometry and the held state.
  - `TouchLayout` describes the control rectangles in CSS pixels: the D-pad circle, Jump, Pogo, Fizz and Pause, each with a visual size and a hit area of at least 48 dp.
  - `dpadDirections(dx, dy, radius)` turns a thumb's offset from the D-pad centre into left, right, up and down. Inside a dead zone (0.3 of the radius) nothing is held. A diagonal holds two directions, unless one axis is more than twice the other, when only the stronger counts, so running right with the thumb drifting a little down never aims or looks down. Positions outside the circle count like the edge, so a sliding thumb stays captured.
  - `hitTest(layout, x, y)` finds the control a new touch lands on (the buttons win where hit areas overlap), and `undersizedTargets(layout)` lists controls under 48 dp, for the slice 2 e2e audit.
  - `TouchState` tracks every finger by pointer id (multi-touch: moving and jumping together). `down`, `move`, `up` and `cancelAll` update it and `held(now)` reports what is held. A finger on the D-pad re-evaluates as it slides, so a thumb can roll from left to down without lifting.
  - A freshly pressed Jump, Pogo or Fizz button is held for at least 50 ms (`MIN_HOLD_MS`, about three frames) so a quick tap survives until the next fixed step, while a held button stays held (jump height and pogo height depend on it). Pause is a command, not a bit: `down` reports it and the caller runs the `pause` command.
- **`InputManager`** gains a `touch` source (`TouchState`): the touch bits are combined with keyboard and pad bits by the pure `inputBits`, and count only while `setTouchEnabled(true)` (since slice 3 the game turns them on whenever the controls show, so they drive the menus too; turning them off drops any held finger). `'touch'` joins `InputDevice` and `nextDevice` (a touch makes touch the device, any key or pad input takes it back, and unplugging a pad leaves touch alone), and there is a public `command(cmd)` so the on-screen Pause can emit `pause`, a `noteTouch()` for the DOM controller, and `releaseTouch()`, called on `blur`, `pagehide` and `visibilitychange`. The unused `blocked` flag still silences every source.
- **The DOM controller** (`packages/engine/src/touch-ui.ts`) owns a `#touch` layer between `#fx` and `#ui` (`touch-action: none`), tracks pointers by `pointerId` with `setPointerCapture`, and feeds the pure functions. Buttons are real `<button>` elements with names, so menus and the pause button stay reachable by TalkBack.

### The look (episode)
- The glass controls from design 2a, set in Fizz: a round D-pad with arrow glyphs, Jump (largest, where the thumb rests), Pogo (small, lit while pogo is on) and Fizz (shows the ammo count), a top-left HUD of three glass pills (lives, snacks in yellow, fizz in cyan) and a top-right pause button. Styling is CSS in `ui.css` driven by `--lf-touch-*` variables (size, opacity, hand), so the settings in slice 7 only change variables.
- Pogo's lit state needs the pogo flag. The sim does not export it today (`State.POGO_HEIGHT` is a tuning value, not the toggle), so slice 2 adds one read-only value, `State.POGO_ON`, to the per-frame state in the Rust crate and `protocol.ts`. It is a read-only export and changes no sim behaviour.

### Layout and display
- `index.html`: `viewport-fit=cover`, `user-scalable=no`, `interactive-widget=resizes-content`, a theme colour.
- CSS: `touch-action: manipulation` on every control, `user-select: none`, `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: none`, a `contextmenu` guard, `100dvh`.
- **Safe areas, with the game drawn under them.** The canvas stays full-bleed, so the game renders under the cutout and the system bars. Only the controls, the HUD, menus and hints are kept out of that space, using the CSS `env(safe-area-inset-top|right|bottom|left)` values with `viewport-fit=cover`. The same CSS works in Firefox, Chrome and Safari and in the Tauri webview (Threshold's `MobileToolbar` pads with `env(safe-area-inset-top)` for the same reason), so one set of rules serves the web and the app. `ui.css` defines `--lf-safe-*` from those `env()` values (with a `0` fallback, so tests can override them), `layout.ts` listens to `visualViewport` and `orientationchange` and sizes the type from the visual viewport, and the HUD, controls and menus add the insets to their offsets. The Engine button is hidden on touch. The hint bar is hidden in play on touch and shows touch hints in menus.
- **Portrait** shows a "Rotate your phone" screen while touch is the device, and the game stays paused.

### Pixel-perfect scale on phones
- Raise the pixel-ratio cap from 2 to 3 on touch devices, and under **Pixels: Sharp** choose an integer number of device pixels per sprite pixel, `s = floor(deviceHeight / (16 × 13))` clamped to at least 2. Derive the visible tile height from that, `deviceHeight / (16 × s)`, instead of a fixed 13. The visible height is a **hard clamp of 11 to 15 tiles**: pick the largest integer scale that stays in that range and let the rest become a margin. This is one global rule, not a per-level setting.
- Under **Pixels: Soft** (and on desktop for now) the current behaviour stays. The option itself arrives with the shared options model, so until then touch devices default to Sharp.
- The camera snap to the device pixel grid already exists.

### Menus on the controls
After the first phone test the controls are the primary way through menus, so the thumbs never leave them. Taps stay as the backup.
- **The controls stay up on menu-style screens.** `Game.menuInput` already reads input bits (Up and Down edges move, Left and Right adjust, Jump or Fizz choose, Pogo goes back), so the touch bits can drive it exactly as a gamepad does. Touch bits are no longer gated to play: they count whenever the touch layer is visible, and the layer shows on every screen except loading and the Rotate screen.
- **A reduced set, relabelled.** In menus the D-pad stays; Jump is relabelled "Select" and Pogo "Back" (the faces change with the screen); Fizz is hidden, since it duplicates Select; Pause keeps its job (open the pause menu, or close it). The labels come from the hint model, so they read the same as the hint bar.
- **Select and Back act on lift.** In play the buttons act on the press, because a jump cannot wait. On a menu Select and Back (and Pause) act when the finger lifts inside the button, so sliding off cancels the press; the D-pad still acts on the press so it can repeat. A press that began in play and is still down when a menu appears chooses nothing.
- **No accidental choices.** A press only counts as a fresh edge. A finger already holding Jump when a level ends does not choose "Back to the map", because the card appears while Jump is down and `lastBits` already has it. Hiding the layer still drops every finger.
- **Auto-repeat in menus.** A held Up, Down, Left or Right repeats after about 350 ms and then every 90 ms, on touch and on the keyboard, so long lists (save slots, options) and sliders are quick. It is a pure helper with unit tests (a timer function of time held), applied inside `menuInput`.
- **Touch hints.** `InputDevice` `'touch'` gets its own hint text in `hints.ts`: "D-pad Choose · Select · Back", with no Esc, F5 or F9. The pause menu shows the slot, not the keyboard shortcut.
- **Room for the D-pad.** On touch, menu and card content starts right of the D-pad (about 190 px from the left safe edge), so no row or hint sits under the thumb. Text wraps a little narrower.
- **Taps still work.** One tap on a row chooses it (`pointerup`, `pointerType` checked; the mouse hover path stays for a mouse), rows get a minimum 48 dp hit height through padding, Option rows get ◄ and ► steppers (each 48 dp), and the cinematic, dialogue, ending and card text advance on a tap. This is for TalkBack and for people who prefer touching.
- **Back.** Pogo is Back on every sub-screen. The Back button and the browser Back button handling (only in fullscreen or installed mode: push a history state in play and open the pause menu on `popstate`) are slice 5.

### Lifecycle (web)
- On the first tap of New game or Continue, request fullscreen and lock landscape (`screen.orientation.lock`), inside `try`, since both need a user gesture and fullscreen. Hold a screen wake lock while playing, release it on pause, hide and blur. Both need a secure context and degrade silently.
- Auto-pause on `visibilitychange`, `pagehide`, `blur` while playing, a switch to portrait, and `popstate`.
- A `manifest.webmanifest` (`display: fullscreen`, `orientation: landscape`) so "Add to Home screen" gives a clean full-screen launch on Android. It ships in this slice with icons exported at the manifest sizes straight from the chosen 2g design SVG (metadata stripped). The full icon set under `assets/icon/` follows with the app work. No service worker is needed yet.

### Haptics (web first)
- **`packages/engine/src/haptics.ts`**: `GameHaptics` with a backend interface, a cue-to-pattern lookup supplied by the episode, a master scale and per-cue cooldowns (the 180 ms caption throttle is the model). Backends: none, `navigator.vibrate` (durations only, Android Chrome, after a user gesture) and, later, the Tauri plugin and gamepad rumble.
- **`episodes/episode-1/src/haptics/fizz-haptics.ts`**: the cue table, keyed by caption id, with the portable pattern shape from `design/uploads/HAPTICS_PLUGIN_UPGRADE.md` (events with intensity and sharpness) so the same table works later on the plugin. For `navigator.vibrate` each pattern compiles to a short duration list.
- **Hooks:** in `Game.caption()` beside `audio.caption`, for `DIED`, `LEVEL_COMPLETE` and `BOSS_HP` in `onEvent`, and beside `audio.play('menu')` and `'click'` for the UI lane. All are fire-and-forget, `vibrate(0)` on pause and hide, and nothing feeds back into the sim.
- **Initial mapping** (the cue ids above): Jump light tick, Boing thud scaled by the bounce, Kick a tap, Fzzt a light click, NoFizz two soft ticks, Bonk a thump, Sproing and Bwomp a springy tap, Whoa then the death a hit with a fading hum, Crunch a tiny tick (coalesced in runs), ExtraLife a swell, TaDa a rise, Zzzap a heavy hit, Thoom a low rumble, Clang a crisp tap. Menu move a tick, choose a click.

### Settings
- **Touch controls:** Size (S, M, L), Opacity, Left-handed and Haptics On or Off, plus a drag-to-move editor, with Reset. They are device-local, so they live in their own key (`lf-touch-v1`) with the same parse-and-default approach as options, and move into the shared options model with the launcher work in APP.md.
- A row in Controls (and in the pause menu's Controls) opens the Touch controls screen from the design.

## Slices
Each slice is one pull request unless noted, in order. S is a day or less, M a few days, L about a week.

| # | Slice | Main files | Size |
|---|---|---|---|
| 0 | **Phone dev loop.** `debugShow('play')` and `?debug&level=N` reach a level without a keyboard; a `dev:phone` script (`vite --host`, prints the LAN addresses and the `adb reverse` command); the "Trying it on a phone" notes below. The `?touch` flag that forces touch mode on desktop moves to slice 2, where it has something to force. | `main.ts`, `game.ts` debug hooks, `scripts/dev-phone.sh`, `package.json`, `e2e/dev.spec.ts` | S |
| 1 | **Touch input core.** `touch.ts` pure functions and `TouchState`, the `InputManager` touch source, the `'touch'` device and `nextDevice`, the 50 ms hold, gating to play, a public `command`, release handlers. Unit tests only; no UI. | `engine/src/touch.ts`, `input.ts`, `input.test.ts`, `touch.test.ts` | M |
| 2 | **In-level touch controls and phone viewport**, landing as two stacked pull requests. **2a, the viewport groundwork (built):** `State.POGO_ON` export, viewport meta, `--lf-safe-*` variables and the safe-area offsets, `dvh`, touch CSS rules, `visualViewport` and `orientationchange` watching, the audio `pointerup` unlock, the Playwright `projects` and the shared `e2e/audit.ts`. **2b, the controls:** `#touch` layer, D-pad slide, Jump, Pogo, Fizz, Pause, glass HUD pills, safe-area vars, viewport meta, touch CSS rules, orientation screen, Engine button hidden. First touch e2e project (844×390 at 3×, 740×360 at 2.6×): control sizes at least 48 dp, inside insets, no overlap, multi-touch jump while moving. **First milestone: Crater Fields is playable on a phone.** | `touch-ui.ts`, `ui.ts`, `ui.css`, `layout.ts`, `index.html`, `e2e/touch.spec.ts` | L |
| 3 | **Menus on the controls (built).** The on-screen controls stay up on menu-style screens (title, pause, cards, options, saves, dialogue, cinematic, credits) as a gamepad: the D-pad moves and adjusts, Jump is relabelled "Select", Pogo "Back", Fizz is hidden, Pause keeps its job. Touch hints in `hints.ts` replace the keyboard labels (no Esc, F5 or F9), menu content shifts right of the D-pad on touch, and a held direction auto-repeats in menus (touch and keyboard). Taps on rows still choose in one step (48 dp rows), with Option steppers and tap-to-advance. | `touch-ui.ts`, `game.ts` (`menuInput`), `hints.ts`, `ui.ts`, `ui.css`, `e2e/touch.spec.ts` | L |
| 3b | **CSS split (a refactor, no behaviour change).** `episodes/episode-1/src/ui.css` (about 1,500 lines, banners only) becomes a short entry that `@import`s one file per surface in the same order, so the cascade is unchanged: shared tokens and whole-pixel type, `hud.css`, `menus.css` (rows, save slots, hint bar, controls table), `cinematic.css` (letterbox, dialogue), `credits.css`, `stinger.css`, `captions.css`, `debug-panel.css`, `touch.css` and `phone.css` (pills, Rotate, the touch overrides). The e2e layout audit at every viewport and in the touch projects proves nothing moved. An Opus agent plans it in plan mode when the slice starts; Sonnet agents do the mechanical moves. | `ui.css` and the new CSS files, `ui.ts` (one import) | M |
| 4 | **Pixel-perfect scale on phones.** DPR cap 3 on touch, integer scale and derived tile height, margin for the rest. A unit test for the scale maths and an e2e that measures sprite pixel size. | `renderer.ts`, `scale.ts`, `game.ts` frame | M |
| 5 | **Phone title and Controls screen.** The web-only phone title with the logo left and the menu on the thumb side, the Controls screen touch column, a Back button on sub-screens and browser Back handling (in fullscreen or installed mode). | `ui.ts`, `ui.css`, `hints.ts` | M |
| 6 | **Touch controls settings.** `lf-touch-v1`, the Size, Opacity, Left-handed and Haptics settings, the drag-to-move editor and Reset. | `touch-settings.ts` (new), `ui.ts`, `touch-ui.ts` | M |
| 7 | **Lifecycle.** Fullscreen and landscape lock on the first tap, wake lock, auto-pause rules, Back interception in fullscreen or installed mode, web manifest and 2g icons at manifest sizes. | `game.ts`, `main.ts`, `index.html`, `public/manifest.webmanifest` | M |
| 8 | **Haptics core and web backends.** `GameHaptics`, `navigator.vibrate` backend, the cue table and the hooks, the Haptics setting from slice 6 wired up. Unit tests with a fake backend. | `engine/src/haptics.ts`, `fizz-haptics.ts`, `game.ts` | M |
| 9 | **Polish and audit.** The full touch e2e matrix, score card totals the game already has (the extra stats stay pending), an accessibility pass with TalkBack, a battery and heat check, a real-device checklist, STATUS.md. | e2e, docs | M |

After slice 9 the web phone experience is complete. The Tauri app, the launcher and the plugin-based haptics backend then follow [APP.md](APP.md), reusing the touch controller, the layout and the cue table unchanged.

## Trying it on a phone
The game has on-screen controls in a level (the D-pad, Jump, Pogo and Fizz buttons and a Pause button, and the glass HUD pills) and, since slice 3, on every menu-style screen, where they work like a gamepad: the D-pad moves (and repeats when held), Select chooses, Back leaves Options, saves and Controls, and Pause resumes or skips. `?touch` pins the controls on, so `?debug&touch&level=0` shows them on a desktop browser too (a mouse drives them).
- **Same Wi-Fi:** `bun run dev:phone` builds the WASM, starts Vite on every interface and prints the addresses. Open `http://<your-computer>:5173/` for the title screen, or `http://<your-computer>:5173/?debug&level=0` to start straight in Crater Fields (`level` is the level id, so `level=1` is Crystal Caves).
- **A secure context:** plain http over the LAN is not one, so fullscreen, the wake lock and the Gamepad API are unavailable. With the phone plugged in and USB debugging on, `adb reverse tcp:5173 tcp:5173` makes the phone see `http://localhost:5173/`, which is a secure context.
- **A preview without the dev server:** the GitHub Pages build of a branch works for anything that does not need the dev server.
- **Checking on a phone:** that Ben moves, jumps and pogoes; that Fizz fires and its count drops; that Pause opens the pause menu; that the controls stay out of the cutout and gesture margins while the game draws under them (and whether Firefox honours `viewport-fit=cover`); that portrait shows "Rotate your phone"; that a Bluetooth key or gamepad input hides the controls and a touch brings them back; and the frame rate and heat.
- **Checking the menus (slice 3):** that the pause menu, the level-cleared card, the title, Options and the save slots are driven by the D-pad and Select without lifting a thumb; that a held D-pad direction repeats at a comfortable pace; that Jump held as a level ends does not choose "Back to the map" until it is pressed again; that one tap on a row chooses it and the ◄ ► steppers work; that a tap on the cinematic or dialogue text advances it; that nothing on a menu sits under a thumb; and how the shorter rows feel on a 360 to 390 dp tall phone.

## First phone test
The first run on a real phone, with the slice 0 dev loop (Firefox for Android, landscape, a 120 Hz screen, the URL bar showing, over Wi-Fi).
- **It runs well.** The engine panel reported 114 to 119 fps (about 8.5 ms a frame) with the simulation steady at 60 Hz, one draw call and about 350 instances. The Fizz type is crisp and readable, the title menu and the in-level HUD look right at that size, and the level shows 13.0 tiles as designed. Firefox for Android is a supported target alongside Chrome.
- **A black strip on the left.** Without `viewport-fit=cover` the browser keeps the page out of the display cutout, so there is a black band down the left edge. The plan for slice 2 is to let the game render **under** the cutout and the bars, and to keep only the controls and UI out of them (see Layout and display).
- **The Engine button and panel get in the way on touch.** The panel is tall enough to run off the bottom of the screen (its last toggles are cut off) and covers the "Attract" label. It is hidden on touch, as planned for slice 2, and the panel scrolls if it is ever opened on a small screen.
- **Keyboard hints on a touch screen.** The title shows "Enter Select" and "↑↓ Choose". Touch hints come with slice 3 (menus on the controls).
- **The URL bar** was showing because the test was not in fullscreen: Firefox keeps it up for easy access. That is expected, not a problem. The visible height still changes in browsers that hide the bar as you scroll (Chrome), which is what the `dvh` and `visualViewport` work in slice 2 covers, and the fullscreen request in slice 7 removes the bar.
- **120 Hz.** The game renders at the display rate while the simulation stays at 60 Hz. It holds that easily here, but a cap of 60 fps on touch devices would save battery and heat, so it is an option in slice 9 once there are battery numbers.
- **The HUD** is the desktop panel (Score, Lives, Fizz and "Next life at 100"). It is large at this size and is replaced by the glass pills in slice 2.

## Second phone test
Slice 2 on a real phone (Firefox for Android): the first level was played through, and it "played really well and smooth".
- **The controls worked.** Moving, jumping, pogoing and firing felt right, and nothing needed the screen to be poked during play.
- **Menus broke the flow.** The level-cleared card and the pause menu hid the controls and showed keyboard hints ("Enter Select", "Esc Resume", "F5", "F9"), so the player had to switch to poking with a finger. The same applies to the other menu-style screens. The answer, recorded in Decisions and designed under "Menus on the controls", is to keep the controls up in menus.
- **Still true from the first test:** the controls draw over the level start (Ben begins under the D-pad), which a later slice can handle by offsetting the camera.

## CSS split
`ui.css` has grown to one file of about 1,500 lines organised only by comment banners, and slices 2 and 3 both edit it. The split goes right after slice 3 merges, so it does not collide with that work.
- **Pure move.** No selector, value or order changes. The entry file `@import`s the parts in their current order, so the cascade is identical, and the parts follow the surfaces that already exist. No barrel files: each file holds real rules.
- **Proof.** `bun run validate` and the whole Playwright suite (desktop and both touch projects, with the layout audit) pass unchanged, and a diff of the built CSS shows the same rules in the same order.
- **Process.** An Opus agent plans the split in plan mode when the slice starts (the file boundaries, the import order, and any rule that has to stay together). Sonnet agents then do the mechanical moves in small steps, with the audit run between steps.
- **Why now.** It makes touch and menu changes local to one file, lets a second episode reuse the shared menus, hint bar and touch parts without copying, and shrinks merge conflicts.

## Testing
- **Unit (vitest):** `dpadDirections` (dead zone, rolling between arms, diagonals), `TouchState` (multi-pointer, a quick tap survives a step, a hold stays held), `inputBits` gating, `nextDevice` with touch, touch hints, the cue table (every caption id in the mapping exists, cooldowns, scaling), `lf-touch-v1` parsing, and the scale maths.
- **E2E (Playwright):** a touch project with `hasTouch`, `isMobile`, `deviceScaleFactor` and landscape viewports. `page.touchscreen.tap` for single taps, and the DevTools protocol (`Input.dispatchTouchEvent`) for multi-touch and slides. Audits: every control at least 48 × 48 dp, nothing under a safe-area inset, no control overlapping the HUD or the pause button, all pixel text `11 × n`, no horizontal overflow. `debugShow('play')` makes the in-level screen reachable.
- **Real devices (a checklist, not CI):** thumb reach, ghosting with several fingers down, a notch and the gesture bar in landscape, the URL bar showing and hiding, fullscreen and orientation lock, `navigator.vibrate` feel, battery and heat over fifteen minutes, TalkBack on the menus, an older phone with an old WebView.

## Risks and how the plan handles them
- **Multi-touch ghosting and slide re-binding** are the most likely feel problems. The pure slide function and the multi-touch e2e come first (slices 1 and 2) so they are tuned before anything is built on them.
- **Visible area changes under the integer scale** (more tiles visible than 13). The 11 to 15 tile clamp keeps levels playable, and slice 4 includes a playtest pass of the levels at phone sizes.
- **Secure-context features** (fullscreen, wake lock, the Gamepad API) are not available over plain LAN http. Slice 0 documents `adb reverse` and a Pages preview, and the code degrades silently.
- **iPhone Safari** has no Fullscreen API and no vibration. It is best effort: the game plays, without haptics, and the manifest and Add to Home screen give the cleanest result.
- **A touch button choosing a menu row by accident** is prevented by the fresh-press rule: a button already held when a menu opens chooses nothing until it is pressed again, and a held direction waits for a release.
- **Sub-frame taps** are prevented by the latch in slice 1.
- **Phones with a stale WebView** are covered by a device in the checklist and by keeping Soft available as the fallback.

## Decisions
- **Menus run on the controls (decided after the first phone test of slice 2).** The thumbs stay on the D-pad, Select (Jump) and Back (Pogo); taps are the backup. Menu content shifts right of the D-pad on touch, held directions auto-repeat in menus on touch and the keyboard, and the work lands as its own slice right after slice 2, ahead of pixel-perfect scale.
- **Touch mode follows the device in use.** It is on while the last-used device is touch: a coarse pointer at boot or any real touch turns it on, a key press or gamepad input turns it off (the controls hide and the desktop HUD returns), and the next touch brings it back. `?touch` pins it on for development and tests.
- **Touch HUD:** three glass pills with a sprite icon and a number (lives, snacks, fizz). "Next life at" is dropped on touch.
- **Pause fires on release** inside its hit area, so sliding off cancels it. Returning from portrait leaves the game on the pause menu.
- **Pogo state:** exported as a new read-only `State.POGO_ON` in slice 2.
- **Visible tile height:** a hard global clamp of 11 to 15 tiles under the integer scale, with the rest as margin.
- **Web manifest:** ships in the lifecycle slice, with the 2g icon exported at manifest sizes.
- **Browser Back:** intercepted only in fullscreen or installed mode.

## Built in slice 3
What the plan left open, and how slice 3 settled it.
- **Which controls each screen shows** (`touchFaces` in `episodes/episode-1/src/touch-menus.ts`): play shows all five. The pause menu shows the D-pad, Select and Pause; the title and the cards show the D-pad and Select (Pause has no job there). Options, saves and Controls add Back. The cinematic, credits and stinger show Select and Pause (Pause skips them); dialogue and the ending show Select only. Fizz never shows outside play. Back does nothing on the pause menu's own rows (Pause resumes), so it is not shown there.
- **The gutters** (`sideGutters` in `touch-layout.ts`): for each side, the outer edge of the furthest shown control's face plus 16 px, and 0 when no shown control is on that side. With the D-pad that is `dpad.cx + r + 16`, 190 px from the left safe edge at the default size; the buttons and Pause give about 120 px on the right. The shell writes them as `--lf-touch-left` and `--lf-touch-right`, and the title, the pause and card overlay, their hint bars, the letterbox bars, the dialogue box, the credits hints and the stinger box keep clear of them. The wordmark is sized for the width left between them and stays on one line, the text columns wrap narrower, and the attract label (which would sit under Jump) is hidden on touch.
- **Touch hints** name the on-screen controls as keycaps: "[D-pad] Choose · [Select] · [Back]", "[Pause] Resume" on the pause menu, "[Pause] Skip credits · [Select] Speed up" on the credits. The pause menu shows no F5 or F9 on touch.
- **Row height:** rows aim for 48 px but a 360 to 390 px tall phone cannot fit the title or the pause menu at that height, so on touch the shell measures each menu and gives its rows the tallest height that fits without scrolling (`rowHeight` in `layout.ts`), never below one glyph cell. On a short touch screen (under 500 px) the pause note and the Controls note are hidden, and save slots drop to one line (the slot name and its pips), to give the rows that height.
- **Taps:** a row chooses on the lift of one tap (handled on `pointerup` for touch and pen, so the browser's hover-then-click never needs a second tap); the mouse keeps hover and click. A finger that moves more than 12 px or is cancelled (a scroll) chooses nothing.

## Open questions
- **Rows below 48 dp on short phones.** Measured at 844×390 and 740×360: the cards get 48 px rows, the pause menu and save slots 41 and 36, Options 35 and 31, and the title (under the wordmark) 31 and 28. Two columns, a smaller heading or a scrolling list would give them more; slice 5 (the phone title and Controls screen) is the place to revisit it.
- **The Controls screen** still shows the keyboard and gamepad table on touch; its touch column is slice 5.
- **A second tap for destructive rows** (Quit to title, Leave level), as MOBILE.md describes, is not built: those rows act on one tap, as they do with a key.
