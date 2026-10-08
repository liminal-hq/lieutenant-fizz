# Mobile implementation plan

**Status: planned.** This is the build plan for [MOBILE.md](MOBILE.md): what to change in the code, in what order, how each step is tested and what "done" means. It is web-first. Touch, the phone layout and basic haptics extend the game as it is today and ship on the website, with no Tauri and no new app. [APP.md](APP.md) (the launcher and the Tauri app) comes after, and reuses everything here.

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
- **`InputManager`** gains a `touch` source (`TouchState`): the touch bits are combined with keyboard and pad bits by the pure `inputBits`, and count only while `setTouchEnabled(true)` (the game turns them on in play only, so a thumb on a control never drives a menu; turning them off drops any held finger). `'touch'` joins `InputDevice` and `nextDevice` (a touch makes touch the device, any key or pad input takes it back, and unplugging a pad leaves touch alone), and there is a public `command(cmd)` so the on-screen Pause can emit `pause`, a `noteTouch()` for the DOM controller, and `releaseTouch()`, called on `blur`, `pagehide` and `visibilitychange`. The unused `blocked` flag still silences every source.
- **The DOM controller** (`packages/engine/src/touch-ui.ts`) owns a `#touch` layer between `#fx` and `#ui` (`touch-action: none`), tracks pointers by `pointerId` with `setPointerCapture`, and feeds the pure functions. Buttons are real `<button>` elements with names, so menus and the pause button stay reachable by TalkBack.

### The look (episode)
- The glass controls from design 2a, set in Fizz: a round D-pad with arrow glyphs, Jump (largest, where the thumb rests), Pogo (small, lit while pogo is on) and Fizz (shows the ammo count), a top-left HUD of three glass pills (lives, snacks in yellow, fizz in cyan) and a top-right pause button. Styling is CSS in `ui.css` driven by `--lf-touch-*` variables (size, opacity, hand), so the settings in slice 7 only change variables.
- Pogo's lit state needs the pogo flag. The sim does not export it today (`State.POGO_HEIGHT` is a tuning value, not the toggle), so slice 2 adds one read-only value, `State.POGO_ON`, to the per-frame state in the Rust crate and `protocol.ts`. It is a read-only export and changes no sim behaviour.

### Layout and display
- `index.html`: `viewport-fit=cover`, `user-scalable=no`, `interactive-widget=resizes-content`, a theme colour.
- CSS: `touch-action: manipulation` on every control, `user-select: none`, `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: none`, a `contextmenu` guard, `100dvh`.
- **Safe areas, with the game drawn under them.** The canvas stays full-bleed, so the game renders under the cutout and the system bars. Only the controls, the HUD, menus and hints are kept out of that space, using the CSS `env(safe-area-inset-top|right|bottom|left)` values with `viewport-fit=cover`. The same CSS works in Firefox, Chrome and Safari and in the Tauri webview (Threshold's `MobileToolbar` pads with `env(safe-area-inset-top)` for the same reason), so one set of rules serves the web and the app. `layout.ts` reads the insets into `--lf-safe-*` variables (with a `0` fallback, and overridable in tests), listens to `visualViewport` and `orientationchange`, and keeps controls and the HUD inside the insets and the system gesture margins. The Engine button is hidden on touch. The hint bar is hidden in play on touch and shows touch hints in menus.
- **Portrait** shows a "Rotate your phone" screen while touch is the device, and the game stays paused.

### Pixel-perfect scale on phones
- Raise the pixel-ratio cap from 2 to 3 on touch devices, and under **Pixels: Sharp** choose an integer number of device pixels per sprite pixel, `s = floor(deviceHeight / (16 × 13))` clamped to at least 2. Derive the visible tile height from that, `deviceHeight / (16 × s)`, instead of a fixed 13. The visible height is a **hard clamp of 11 to 15 tiles**: pick the largest integer scale that stays in that range and let the rest become a margin. This is one global rule, not a per-level setting.
- Under **Pixels: Soft** (and on desktop for now) the current behaviour stays. The option itself arrives with the shared options model, so until then touch devices default to Sharp.
- The camera snap to the device pixel grid already exists.

### Menus on touch
- One tap chooses a row (`pointerup`, with `pointerType` checked): the hover-select path runs only for a mouse. Rows get a minimum 48 dp hit height through padding while the glyphs keep their size. Option rows get explicit ◄ and ► steppers (each 48 dp) so a tap can go backwards or set a meter.
- Tap-to-advance on the cinematic, dialogue, ending and card text. Skip, Continue and Pause are 48 dp targets.
- The Back affordances: a visible Back button on sub-screens. The browser's Back button is intercepted **only in fullscreen or when installed** (`display-mode: fullscreen` or `standalone`, or a fullscreen element): there it behaves like an app, so a history state is pushed in play and the pause menu opens on `popstate`. In a normal browser tab, Back leaves the page as usual.
- The Controls screen gets a touch column and a Touch controls entry. The pause menu hides F5 and F9 on touch and shows the slot instead.

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
| 2 | **In-level touch controls and phone viewport.** `State.POGO_ON` export, `#touch` layer, D-pad slide, Jump, Pogo, Fizz, Pause, glass HUD pills, safe-area vars, viewport meta, touch CSS rules, orientation screen, Engine button hidden. First touch e2e project (844×390 at 3×, 740×360 at 2.6×): control sizes at least 48 dp, inside insets, no overlap, multi-touch jump while moving. **First milestone: Crater Fields is playable on a phone.** | `touch-ui.ts`, `ui.ts`, `ui.css`, `layout.ts`, `index.html`, `e2e/touch.spec.ts` | L |
| 3 | **Pixel-perfect scale on phones.** DPR cap 3 on touch, integer scale and derived tile height, margin for the rest. A unit test for the scale maths and an e2e that measures sprite pixel size. | `renderer.ts`, `scale.ts`, `game.ts` frame | M |
| 4 | **Menus on touch.** One-tap choosing, mouse-only hover, 48 dp rows, Option steppers, tap-to-advance, Back button and history handling, pause and score cards as touch targets. | `ui.ts`, `ui.css`, `game.ts` menu code, `e2e/menus.spec.ts` | M |
| 5 | **Phone title and Controls screen.** The title with logo left and menu on the thumb side, touch hints (`hints.ts`), the Controls screen touch column, F5 and F9 hidden on touch. | `ui.ts`, `hints.ts`, `hints.test.ts`, `ui.css` | M |
| 6 | **Touch controls settings.** `lf-touch-v1`, the Size, Opacity, Left-handed and Haptics settings, the drag-to-move editor and Reset. | `touch-settings.ts` (new), `ui.ts`, `touch-ui.ts` | M |
| 7 | **Lifecycle.** Fullscreen and landscape lock on the first tap, wake lock, auto-pause rules, Back interception in fullscreen or installed mode, web manifest and 2g icons at manifest sizes. | `game.ts`, `main.ts`, `index.html`, `public/manifest.webmanifest` | M |
| 8 | **Haptics core and web backends.** `GameHaptics`, `navigator.vibrate` backend, the cue table and the hooks, the Haptics setting from slice 6 wired up. Unit tests with a fake backend. | `engine/src/haptics.ts`, `fizz-haptics.ts`, `game.ts` | M |
| 9 | **Polish and audit.** The full touch e2e matrix, score card totals the game already has (the extra stats stay pending), an accessibility pass with TalkBack, a battery and heat check, a real-device checklist, STATUS.md. | e2e, docs | M |

After slice 9 the web phone experience is complete. The Tauri app, the launcher and the plugin-based haptics backend then follow [APP.md](APP.md), reusing the touch controller, the layout and the cue table unchanged.

## Trying it on a phone
Until slice 2 lands the game has no touch controls, so a phone can show the title and menus (taps work on the menu rows) and render a level, but cannot move Ben.
- **Same Wi-Fi:** `bun run dev:phone` builds the WASM, starts Vite on every interface and prints the addresses. Open `http://<your-computer>:5173/` for the title screen, or `http://<your-computer>:5173/?debug&level=0` to start straight in Crater Fields (`level` is the level id, so `level=1` is Crystal Caves).
- **A secure context:** plain http over the LAN is not one, so fullscreen, the wake lock and the Gamepad API are unavailable. With the phone plugged in and USB debugging on, `adb reverse tcp:5173 tcp:5173` makes the phone see `http://localhost:5173/`, which is a secure context.
- **A preview without the dev server:** the GitHub Pages build of a branch works for anything that does not need the dev server.
- **Checking on a phone, today:** the layout and type at phone sizes, the pixel scale and blur on a high-DPI screen, audio unlock on the first tap, and frame rate and heat.

## First phone test
The first run on a real phone, with the slice 0 dev loop (Firefox for Android, landscape, a 120 Hz screen, the URL bar showing, over Wi-Fi).
- **It runs well.** The engine panel reported 114 to 119 fps (about 8.5 ms a frame) with the simulation steady at 60 Hz, one draw call and about 350 instances. The Fizz type is crisp and readable, the title menu and the in-level HUD look right at that size, and the level shows 13.0 tiles as designed. Firefox for Android is a supported target alongside Chrome.
- **A black strip on the left.** Without `viewport-fit=cover` the browser keeps the page out of the display cutout, so there is a black band down the left edge. The plan for slice 2 is to let the game render **under** the cutout and the bars, and to keep only the controls and UI out of them (see Layout and display).
- **The Engine button and panel get in the way on touch.** The panel is tall enough to run off the bottom of the screen (its last toggles are cut off) and covers the "Attract" label. It is hidden on touch, as planned for slice 2, and the panel scrolls if it is ever opened on a small screen.
- **Keyboard hints on a touch screen.** The title shows "Enter Select" and "↑↓ Choose". Touch hints are slice 5.
- **The URL bar** was showing because the test was not in fullscreen: Firefox keeps it up for easy access. That is expected, not a problem. The visible height still changes in browsers that hide the bar as you scroll (Chrome), which is what the `dvh` and `visualViewport` work in slice 2 covers, and the fullscreen request in slice 7 removes the bar.
- **120 Hz.** The game renders at the display rate while the simulation stays at 60 Hz. It holds that easily here, but a cap of 60 fps on touch devices would save battery and heat, so it is an option in slice 9 once there are battery numbers.
- **The HUD** is the desktop panel (Score, Lives, Fizz and "Next life at 100"). It is large at this size and is replaced by the glass pills in slice 2.

## Testing
- **Unit (vitest):** `dpadDirections` (dead zone, rolling between arms, diagonals), `TouchState` (multi-pointer, a quick tap survives a step, a hold stays held), `inputBits` gating, `nextDevice` with touch, touch hints, the cue table (every caption id in the mapping exists, cooldowns, scaling), `lf-touch-v1` parsing, and the scale maths.
- **E2E (Playwright):** a touch project with `hasTouch`, `isMobile`, `deviceScaleFactor` and landscape viewports. `page.touchscreen.tap` for single taps, and the DevTools protocol (`Input.dispatchTouchEvent`) for multi-touch and slides. Audits: every control at least 48 × 48 dp, nothing under a safe-area inset, no control overlapping the HUD or the pause button, all pixel text `11 × n`, no horizontal overflow. `debugShow('play')` makes the in-level screen reachable.
- **Real devices (a checklist, not CI):** thumb reach, ghosting with several fingers down, a notch and the gesture bar in landscape, the URL bar showing and hiding, fullscreen and orientation lock, `navigator.vibrate` feel, battery and heat over fifteen minutes, TalkBack on the menus, an older phone with an old WebView.

## Risks and how the plan handles them
- **Multi-touch ghosting and slide re-binding** are the most likely feel problems. The pure slide function and the multi-touch e2e come first (slices 1 and 2) so they are tuned before anything is built on them.
- **Visible area changes under the integer scale** (more tiles visible than 13). The 11 to 15 tile clamp keeps levels playable, and slice 3 includes a playtest pass of the levels at phone sizes.
- **Secure-context features** (fullscreen, wake lock, the Gamepad API) are not available over plain LAN http. Slice 0 documents `adb reverse` and a Pages preview, and the code degrades silently.
- **iPhone Safari** has no Fullscreen API and no vibration. It is best effort: the game plays, without haptics, and the manifest and Add to Home screen give the cleanest result.
- **A touch button driving menus** is prevented by the gating in slice 1.
- **Sub-frame taps** are prevented by the latch in slice 1.
- **Phones with a stale WebView** are covered by a device in the checklist and by keeping Soft available as the fallback.

## Decisions
- **Pogo state:** exported as a new read-only `State.POGO_ON` in slice 2.
- **Visible tile height:** a hard global clamp of 11 to 15 tiles under the integer scale, with the rest as margin.
- **Web manifest:** ships in the lifecycle slice, with the 2g icon exported at manifest sizes.
- **Browser Back:** intercepted only in fullscreen or installed mode.

## Open questions
- None yet. Questions raised while building each slice are added here.
