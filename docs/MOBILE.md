# Mobile: touch controls and a mobile UI layout

**Status: planned.** Nothing here exists yet; today the game assumes a keyboard or a gamepad (see "Mobile and touch controls are not implemented" in `docs/STATUS.md`). This document plans the touch controls, a UI layout tailored to phones and haptics. It applies to the website on a phone browser as much as to the Tauri app in [APP.md](APP.md), because all of it is web UI in the shared engine and episode packages.

## Principles
- **Phones are landscape.** The game is played with two thumbs on a landscape screen. Portrait shows a "rotate your phone" screen on the website and is locked out in the app.
- **Whole-pixel type and art stay.** The Fizz type rule (font size is 11px × a whole number n) and the integer pixel scale of the game canvas both hold on phones. Where the device pixel ratio is not an integer, the scale is chosen so the pixels stay square, and any slack becomes a margin, not a stretch.
- **Nothing important sits under a thumb or a notch.** Controls and HUD respect the display cutout and the system gesture areas.
- **No new rules in the sim.** Touch is another input source and haptics are another output. Both are presentation, so the simulation stays deterministic.

## Display
- Landscape only, fullscreen in the app.
- Safe-area insets from the browser (`env(safe-area-inset-*)`) and the native cutout in the Tauri app.
- The play field keeps its whole-pixel scale. Controls are drawn over the field's margins where they fit, and over the field itself, translucent, where they must.
- Open question: on phones with a non-integer pixel ratio, is a slightly smaller integer scale with margins acceptable, or should the canvas be allowed a non-integer scale there?

## Touch controls
- **Move:** a d-pad (left and right, plus up and down for aiming and ladders) on the left thumb. Open question: a fixed d-pad or a floating one that appears where the thumb lands.
- **Actions:** Jump, Pogo and Fizz buttons on the right thumb, matching the gamepad layout (A, B, X).
- **Pause:** a small Menu button in a corner, the same as Start.
- **Handedness:** an option to swap the sides. Sizes and opacity are options too.
- **Hit areas** are at least 48 CSS pixels, and the buttons give press feedback (a stepped colour change, in the pixel style) and haptic feedback.
- **Hints:** the hint system already tracks the last device used (keyboard or gamepad). Touch becomes a third device, so hint bars show touch labels, or none where the on-screen buttons already say it.
- **Input:** touch events feed the same per-tick edge detection as keys and pad buttons in the `InputManager`, so the sim sees one input stream. Multi-touch matters: moving and jumping happen together.
- The d-pad and buttons are drawn as pixel art in the EGA palette, not as system controls.

## Mobile UI layout
The overlay today is laid out for a window. On a phone:
- **HUD** sits in the safe area with the lives, score, ammo and boss pips kept small and at the top corners, clear of the controls.
- **Menus** get larger rows and a touch-friendly spacing: a row is at least 48 CSS pixels tall, and tapping a row both selects and activates it. The stepped plate selection stays for keyboard and pad.
- **Dialogue, cards and the credits** advance on tap anywhere, as well as with buttons.
- **The pause menu** is reached from the on-screen Menu button, and the Back gesture opens it in a level.
- **Options** gain Touch controls (size, opacity, handedness) and Haptics (below). Text size keeps working, and the minimum is n = 2.
- The e2e layout checks gain phone-sized landscape viewports with touch emulation (for example 844×390 and 740×360) and the same rules: nothing overflows, clips or sits under a control, and all pixel text is `11 × n` in Fizz.

## Lifecycle and performance
- Pause when the app goes to the background, when the screen locks and when the Back gesture is used in a level.
- Audio unlocks on the first touch.
- The 60 Hz fixed timestep is kept. Watch battery and heat on long sessions, and cap the render rate if a phone cannot hold it.
- Keep the screen awake while playing.

## Haptics
Haptics are a third consumer of the events that already drive audio and captions, so they fit without touching the sim.
- **Mechanism in the engine, content in the episode.** A `GameHaptics` class beside `GameAudio` in `packages/engine` takes a backend, a cue-to-effect table, an intensity setting and per-cue cooldowns. The episode supplies the table, as `episodes/episode-1/src/audio/patterns.ts` supplies audio patterns, so each episode tunes its own feel.
- **Pluggable backends**, so the engine never depends on Tauri: none (the web default), the Tauri haptics plugin (loaded lazily, only inside the app), `navigator.vibrate` (durations only), and gamepad rumble through `vibrationActuator`.
- **Graceful degradation:** probe `capabilities()` once, then downgrade each effect (composition, then predefined, then a simple one-shot). With no vibrator, the Options entry is hidden.
- **Hook points in `game.ts`:** in `caption()` next to `audio.caption` for cue effects, in `onEvent` for `DIED`, `LEVEL_COMPLETE` and `BOSS_HP`, and beside the menu and click sounds for UI feedback.
- **Options:** Haptics Off, Light or Full (an options version bump with a migration). It scales amplitude and respects the system setting.
- **Rules:** fire-and-forget (never awaited in the frame loop), rate-limited, never feeding back into the sim.

A first intensity ladder, to be tuned on a device with Haptics Lab:

| Moment | Effect |
|---|---|
| Menu move | tick |
| Menu confirm | click |
| Snack pickup | tick, scaled by value |
| Pogo bounce | thud, scaled by height |
| Fizz shot | light click |
| Stomp | heavy click |
| Taking damage or dying | thud, then a long rumble |
| Boss hit | heavy |
| Boss slam | rumble envelope |
| Level complete | rising composition |
| Finding the secret | double click |
| Plain jumps and footsteps | none |

Patterns are authored and auditioned in Haptics Lab and exported as the plugin's own `EffectRequest` JSON, so no translation is needed. Unit tests use a fake backend for the cue table, cooldowns, intensity scaling and capability downgrades.

## Testing
- Unit tests for touch-to-input mapping, hint switching to touch, the haptics cue table and the options migration.
- Playwright with touch emulation at phone-sized landscape viewports.
- Real devices (a recent phone and an older one with a stale WebView) for feel, performance and haptics. Feel can only be judged on hardware.

## Open questions
- Fixed or floating d-pad?
- Integer scale with margins, or a non-integer scale, on phones with a fractional pixel ratio?
- Which events are strong and which stay silent? The ladder above is a guess.
- Gamepad rumble in the first pass, or phone haptics only?
