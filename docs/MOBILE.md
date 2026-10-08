# Mobile: touch controls, the phone layout and haptics

**Status: planned.** Nothing here exists yet; today the game assumes a keyboard or a gamepad (see "Mobile and touch controls are not implemented" in `docs/STATUS.md`). This document follows `design/Mobile Design.dc.html` (turn 3) and plans the touch controls, a layout tailored to phones and haptics. It applies to the website on a phone browser as much as to the Tauri app in [APP.md](APP.md), because all of it is web UI in the shared engine and episode packages.

## Where the phone title and the launcher meet
- **On the web (a phone browser):** the episode shows the mobile title screen below, with its own New game, Continue, Load game and Controls.
- **In the Tauri app:** the launcher in APP.md replaces that title, and the episode starts embedded, straight into play. The mobile title is bypassed.
- Everything after the title (cinematic, map, level, pause, score card, game over) is the same in both.

## Principles
- **Phones are landscape.** The game is played with two thumbs on a landscape screen. Portrait shows a "rotate your phone" screen on the website and is locked out in the app.
- **All text is Fizz.** The Fizz type rule (font size is 11px × a whole number n) and the integer pixel scale of the game canvas both hold on phones. Where the device pixel ratio is not an integer, the scale is chosen so the pixels stay square, and any slack becomes a margin, not a stretch.
- **Nothing important sits under a thumb or a notch.** Controls and HUD respect the display cutout and the system gesture areas.
- **No new rules in the sim.** Touch is another input source and haptics are another output. Both are presentation, so the simulation stays deterministic.

## Display
- Landscape only, fullscreen in the app.
- Safe-area insets from the browser (`env(safe-area-inset-*)`) and the native cutout in the Tauri app.
- The play field keeps its whole-pixel scale. Controls are drawn over it, translucent, because a phone has no spare margin.
- **Pixels: Sharp or Soft** (an option, see APP.md) decides what happens to the slack: Sharp keeps whole pixels with thin bars, Soft stretches to the edges.

## Touch controls (design 2a, chosen)
- **Move:** a round glass D-pad on the left thumb. Left and right move, and up and down aim the Fizz Blaster (as ↑ and ↓ do on the keyboard). It maps one to one to the gamepad, so help text works for both.
- **Actions** on the right thumb: **Jump** is the largest and sits where the thumb rests, **Pogo** is a small round button above it, and **Fizz** is a round button that shows the ammo count (the "5" on it).
- **HUD:** three glass pills at the top left, in the Fizz font: lives, snacks in yellow and fizz in cyan, matching the desktop scoreboard. **Pause** is always visible at the top right.
- **Controller connected:** the designs include a "Controller connected" state. Hints switch to pad labels when a gamepad is the last device used, as they do today; what the on-screen controls do in that state (hide or dim) is an open question below.
- **Touch controls screen** (reached from Controls): a panel with Move (D-pad), Size (S, M or L), Opacity, Left-handed and Haptics, plus Reset. Controls can be dragged to move them, and they show dashed outlines while editing. A **Done** button leaves.
- **Input:** touch events feed the same per-tick edge detection as keys and pad buttons in the `InputManager`, so the sim sees one input stream. Multi-touch matters: moving and jumping happen together. Touch becomes a third device for the hint system, which already tracks keyboard and gamepad.

**Not in the first build** (designed, kept for later): 2b split arrows with a rising row of actions, 2c a pogo-switch pill with two large buttons (pogo is already a toggle, so it fits), and 1b the floating joystick with EGA plate buttons and a Keen-style scoreboard HUD, and 1c the thumb arc. The designs say the D-pad and the floating joystick will both end up as options in Settings.

## The phone layout
- **Title (web only):** "Ben Blaze in" over the Lieutenant Fizz wordmark and "Episode 1 · The Cocoa Caper" on the left, and the menu on the thumb side (right): New game, Continue (with the slot, such as "Slot 2"), Load game, Controls.
- **Menus** use the desktop scrim style: a list over a soft scrim, a stepped orange plate that slowly cycles colour, and a can of cream soda as the cursor. Rows are **44 px tall**, and tapping a row selects it, tapping again chooses it.
- **Cinematic:** the panels advance on tap. A tap finishes the typed line, and another tap moves to the next panel. A Skip button is always there.
- **Overworld map:** the same D-pad as a level. Walking next to a level opens a card with its name, a line about it and an "Enter level" button.
- **In level:** the HUD and controls above.
- **Pause menu:** the scrim menu over the frozen level: Resume, Save game (with the slot), Load game, Controls, Leave level, Quit to title. The Back gesture opens it in a level.
- **Score card:** "<Level> cleared" with totals that count up (Snacks, Fizz fired, Zargs stunned, Secrets, Time, Best time) and one clear next step, "Back to the map".
- **Game over:** calm, with your last save offered first.
- **Dialogue and cards** advance on tap anywhere as well as with buttons.
- The e2e layout checks gain phone-sized landscape viewports with touch emulation (for example 844×390 and 740×360) and the same rules: nothing overflows, clips or sits under a control, and all pixel text is `11 × n` in Fizz.

## Lifecycle and performance
- Pause when the app goes to the background, when the screen locks and when the Back gesture is used in a level.
- Audio unlocks on the first touch.
- The 60 Hz fixed timestep is kept. Watch battery and heat on long sessions, and cap the render rate if a phone cannot hold it.
- Keep the screen awake while playing.

## Haptics
Haptics are a third consumer of the events that already drive audio and captions, so they fit without touching the sim. The plugin side is specified in `design/uploads/HAPTICS_PLUGIN_UPGRADE.md`, a proposal for `tauri-plugin-haptics` (branch `chore/integrate-jules-haptics` in `haptics-lab-app`). Lieutenant Fizz is its first game client, and Haptics Lab is where patterns are tuned.

### The plugin ladder
- **Portable patterns.** A pattern is a list of transient and continuous events with intensity and sharpness over time. The plugin compiles it to the best of five tiers the device supports: envelope (API 36), composition (OEM-tuned primitives), amplitude waveform, on/off waveform, then silent. The result reports which tier played.
- **Register once, trigger by id.** Patterns are registered at startup, and in-game triggers are a short id plus a scale, which keeps the invoke round trip small when Ben jumps three times a second.
- **Native policies:** interrupt, queue, drop-if-busy and coalesce, run in Kotlin, so a run of twelve Cheezies does not become twelve cancelled effects.
- **A UI lane** for menus uses the system's own feedback constants (confirm, reject, tick, toggle, drag start), which respect the user's touch-feedback setting.
- **Controllers:** with `target: 'auto'`, gameplay patterns go to a connected gamepad's vibrator and the phone stays silent. The UI lane stays on the phone. This is also how desktop **Rumble** works.
- **Master scale and `maxTier`:** a game intensity slider, and a lab override to preview a weaker phone.
- **Fixes the plugin needs first** (section 7 of the proposal): remove the hidden `thud` and `pop` predefined ids, report each primitive's support separately, keep the scale on composition steps, gate the envelope tier on API 36 and its support check, and always return `tier` and `target`.

### In the game
- **Mechanism in the engine, content in the episode.** A `GameHaptics` class beside `GameAudio` in `packages/engine` takes a backend, a cue-to-pattern table, the master scale and per-cue cooldowns. The episode supplies the table in `episodes/episode-1/src/haptics/fizz-haptics.ts`, as `audio/patterns.ts` supplies audio patterns, so each episode tunes its own feel. Patterns are authored in Haptics Lab and exported as JSON.
- **Pluggable backends**, so the engine never depends on Tauri: none (the web default), the Tauri plugin (loaded lazily, only inside the app), `navigator.vibrate` (durations only) and gamepad rumble through `vibrationActuator`.
- **Hook points in `game.ts`:** in `caption()` next to `audio.caption` for cue effects, in `onEvent` for `DIED`, `LEVEL_COMPLETE` and `BOSS_HP`, and beside the menu and click sounds for the UI lane.
- **Settings:** Haptics On or Off in Touch controls, with an intensity scale, and Rumble on desktop. Both go through the shared options model in APP.md, and the entry is hidden when there is no vibrator or controller.
- **Rules:** fire-and-forget (never awaited in the frame loop), rate-limited, and never feeding back into the sim.

### The Fizz patterns
The proposal's section 8 gives each event a pattern, the effect at tiers 4, 3 and 2, and a policy. In short:

| Moment | Policy | Character |
|---|---|---|
| Jump | interrupt | a light tap |
| High pogo | interrupt | a short rising ramp |
| Pogo on and off | UI lane toggle | two taps on, one off |
| Fizz fired | drop-if-busy | a sharp, light tap |
| Out of fizz | interrupt | two soft low ticks |
| Stomp | interrupt | a thump |
| Stun (bubble hit) | drop-if-busy | a crisp tap |
| Hurt | interrupt | a hit then a fading hum |
| Snack | coalesce 60 ms | a tiny tick, merged in runs |
| Cream soda | queue | three rising ticks |
| Extra life | queue | a swell |
| Level cleared | interrupt | a rise then a tap |
| Out of lives | interrupt | a long fade |
| Boss slam | interrupt | a low rumble around 60 Hz |
| Menu move, select, locked | UI lane, coalesce 40 ms | segment tick, confirm, reject |
| Layout pick up and drop | UI lane | drag start, then a soft tick |

## Testing
- Unit tests for touch-to-input mapping, hint switching to touch, the haptics cue table (with a fake backend: cooldowns, scaling, tier downgrades) and the options migration.
- Playwright with touch emulation at phone-sized landscape viewports.
- Real devices (a recent phone and an older one with a stale WebView) for feel, performance and haptics. Feel can only be judged on hardware.

## Open questions
- **Controller connected:** should the touch controls hide, or dim, when a gamepad is in use?
- **Touch-target size:** the design uses 44 px rows and Android's guideline is 48 dp. Is 44 px a deliberate choice, or should the rows grow to 48?
- **Two-tap menus:** tap to select, tap again to choose avoids accidents, but is slower on the pause menu. Keep it everywhere, or single tap in the pause menu?
- **Font in the controls:** the design says all text is Fizz, but the glass button labels ("Jump", "Pogo") and the Touch controls panel chips look like a system sans in the mock. Should the controls and the panel be Fizz too?
- **Cinematic length:** the mobile mock shows "six panels". The game's cinematic is eight panels, so the count in the mock is stale.
- **Score card stats:** Fizz fired, Zargs stunned, Secrets found per level and Best time are not tracked today. They need counters in the shell or sim events, and a save-format addition for the best time.
- Which events are strong and which stay silent? The table above follows the proposal and is to be tuned on a device.
