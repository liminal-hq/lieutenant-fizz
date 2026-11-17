# Input test page

**Status: built (web, desktop app, Android app).** A page that shows, live, what the game is receiving from each input device, so a player or a developer can check a controller, keyboard, touch screen or mouse against the game. A DOS version will follow and must mirror the layout and the rows below.

## Reaching it

- **Options > Input test**, from the title and from the pause menu, like the other Options rows. It sits after Controller and Display, before Play sample.
- **Debug menu > Input test** (`2` then `Enter`), from anywhere; closing it returns to the Debug menu.
- `?debug` hook: `__lf.debugShow('inputTest')`.

## Behaviour

- While it is open the game is held and inputs do nothing else: no jumps in a level underneath, no menu navigation, no pause toggles, no save, zoom or fullscreen. The game drops every command (`onCommand`) and does not run its menu input; the page reads the devices itself.
- It reads the real input path. Keys come from `InputManager.onRawKey`, a tap on the one key listener the game uses. Pads come from `getGamepads()` through `InputManager.pads()`. Every action name comes from the functions the game uses: `keysToBits`, `padToBits` (with the current pad bindings), `keyCommand`, `pauseKeyKind`, `isFullscreenKey`, and the game's own `TouchState` and `hitTest` for fingers. The strip at the bottom is `InputManager.peek()` (the game's merged word) with the page's own touch bits and the Enter latch added. The model is `packages/engine/src/input-test.ts`.
- **Leaving is never trapped:** tap or click the Back button; or hold Esc for one second; or hold the pad's Back button (the buttons bound to Pogo, B and Y by default) for one second. A short press of Esc or B lights up and does not leave; a bar under the notes fills while a leave is held. The page says so on screen, with the key or button name for the device last used (`{Esc}` on a keyboard, the Pogo button's glyph on a pad, "Tap Back" on touch). The system Back gesture and the browser's Back also leave.
- The log and every reading are in memory only; they are cleared on leave. Nothing is stored or sent. The page adds no recorder events beyond the screen and sub changes any other screen makes (`sub` `inputTest`). It is never in a save.
- Reduced motion (the Motion option or the system setting): lit parts change state with no fade. Colour is never the only signal: a lit part is filled with a heavy white edge, a fading part is lightly filled with an accent edge, an off part is an empty outline; a lit chip is solid, a dim chip is dashed; a landed finger is a solid disc and a miss is a hollow dashed diamond.

## Layout

The page covers the window (inside the safe area), on a near-black panel, in the Fizz font at whole-pixel sizes (`--lf-n-small` for the panel, `--lf-n-hint`, which is 2, for the log, readings and chips). Every control is at least 48 px tall. From top to bottom:

1. **Header row:** the Back button, the title "Input test", then four tabs (Gamepad, Keyboard, Touch, Mouse) and an Auto toggle. With Auto on (the start state) the page shows the panel of the device last used, as the hints do: a key shows Keyboard, a pad button or a stick crossing its threshold shows Gamepad, a touch shows Touch, a mouse button or the wheel shows Mouse (a mouse move alone does not). Choosing a tab turns Auto off; Auto turns it back on. On open it starts on the hint device.
2. **Leave note** (one or two lines, 2x): "Hold {Esc} for 1 second to leave, or click Back. A short press only lights up." on a keyboard or mouse, "Hold {pogo glyph} for 1 second to leave, or click Back. A short press only lights up." on a pad, "Tap {Back} to leave" on touch.
3. **Hold bar:** a thin bar that fills while Esc or the Back button is held, and leaves when full.
4. **Body:** two columns when the window is 900 px wide or more (the device panel at 1.25 parts, the log at 1 part), one column below that (the log under the panel, at most five lines tall).
5. **Strip:** nine chips in this order, each lit or dim: `Left`, `Right`, `Up`, `Down`, `Jump`, `Pogo`, `Fizz`, `Confirm`, `Pause`. Fizz is the Fire bit (`Input.FIRE`, 64). Pause is not a bit, it is a command; it is lit while a pause key (Esc, P, the Pause key), a pad button bound to Pause, or a finger on the on-screen Pause control is held. Confirm is lit while Enter is held (in the game it is a one-tick latch).

### Log

The last 12 lines (20 are kept for the copied report), most recent last, one line per press or release, with a `+ m:ss.t` stamp from when the page opened:

```
+  0:03.2  Pad 0  button 0 (A)  down  -> Jump
+  0:03.4  Pad 0  button 0 (A)  up  -> Jump
+  0:05.0  Pad 0  axis 0 (Left stick X)  -0.62  -> Left
+  0:06.1  Key  KeyZ  down  -> Jump (Modern key)
+  0:07.3  Touch 2  down  at 214,520  on jump  -> Jump
+  0:08.0  Mouse  button 0 (Left)  down  at 412,208  -> no action
+  0:09.2  Mouse  wheel up  -> Zoom in
```

An input with no action says `-> no action`. A pad axis is logged when it crosses the threshold the game acts at (0.4 on axis 0, 0.5 on the others), not on every wiggle. A key that belongs only to the Controls layout the player did not choose carries a note (`Modern key`, `Keen-style key`); the game reads both layouts at once, so the action is the same.

### Gamepad panel

A row of three views (Pad, Sampling, Mapping), a pad picker (`Pad 0`, `Pad 1`, one button per connected pad, shown when there are two or more; the page follows the pad that last moved until one is picked), then the view.

- **Pad:** with the standard mapping, a controller picture on a 100 by 62 unit grid (one unit is a whole number of pixels, 2 to 7): LT and RT (analog fill from the bottom, `value`), LB and RB, Select, Start and Home, the D-pad (four arms), Y, X, B and A in a diamond, and both sticks (the knob moves by the axis values, and fills when the stick is clicked). Face, shoulder, trigger, Select and Start parts carry the Fizz glyph for their name where they are big enough for it. Other mappings show a generic panel instead: a cell for every raw button by number (filled from the bottom by its `value`, heavy edge while pressed) and a bar for every raw axis with its value. Under it: the pad line (`Pad 0  name  connected`), the mapping, button and axis counts, the axis values, and the buttons held with the action they give. With no pad: "No controller found. Press a button on it; a browser shows a pad only after that."
- **Sampling:** a timer on the page reads `getGamepads()` every 4 ms while it is open and is compared with the game's tick read (the page calls `InputManager.poll()` each frame, since it holds the game). Lines: whether the browser moves `gamepad.timestamp` (it may leave it at 0, or not change it while the pad is idle) and, where it does, how many changes a second; the game's read interval (min, median and max over the last 3 seconds); presses seen by the timer and by the game's tick path; presses the game never saw (with fast polling on this should be about 0) and the shortest in milliseconds; presses the old per-tick read alone (what is down at the moment of the tick) would have missed, and the shortest; the shortest press seen. A press is judged at the first tick after it ends. A Reset counters button zeroes the counts, and a "Fast polling: on/off" button turns the game's fast pad timer and latches off and on for this session only (also `?debug&latch=off` at load; never saved), so the two counters can be compared on the same pad. Fast polling itself is described in `docs/ENGINE_SPEC.md` § 7.
- **Mapping:** a plain-text block for pasting into an issue: host (`web` or `app`), browser (from the user agent), the pad's `id`, `mapping` (`standard` or empty), button and axis counts, whether `timestamp` is present, every raw button with its value and the game action it gives under the current bindings (with the default in brackets where a remap changed it), every raw axis with its value, and the sampling lines. A Copy report button puts that block and the last 20 log lines on the clipboard; where the browser refuses, the same text shows in a box, selected, with "Select all and copy". No network.

### Keyboard panel

A keyboard picture on an 18.5 by 6 key-unit grid: Esc and F1 to F12; the number row to Backspace; Tab, Q to P, brackets and backslash; Caps, A to L, semicolon, quote and Enter; left Shift, Z to M, comma, period, slash and right Shift; left Ctrl, Win, left Alt, Space, right Alt, Win, Menu and right Ctrl; and the four arrow keys to the right. Keys light while held and fade for 450 ms after release (no fade with reduced motion). A key label shows only when it fits (a whole key is at least 24 px). Keys not on the picture (the numpad, media keys) still log and show in the readout. Under it: the key held or last pressed with its `code`, the action it maps to, a note for a key of the other layout, the keys held now, and the Controls layout.

### Touch panel

The dashed outlines are the five on-screen controls where `placeControls` puts them for this window and the player's touch settings (D-pad, Jump, Pogo, Fizz, Pause), labelled. Each finger is a marker with its pointer id and what it is on: a landed touch is a solid disc, a miss a hollow dashed diamond, the label reads `#id Jump` or `#id miss`. A line per finger gives the position, the control and the action: a D-pad finger gives the direction it holds (`dpadDirections`), a button its action, Pause `Pause`. The real on-screen controls are hidden while the page is open.

### Mouse panel

A mouse picture (left, middle and right buttons, the two side buttons, the wheel) with held buttons filled, and lines for the position, the buttons held with their names, the wheel direction (lit for 600 ms) and a note that the wheel zooms and nothing else on the mouse has an action.

## Raw-to-action rows

What the page says each raw input gives (the game's own functions decide it):

| Raw input | Action |
| --- | --- |
| Key `ArrowLeft`, `KeyA` | Left |
| Key `ArrowRight`, `KeyD` | Right |
| Key `ArrowUp`, `KeyW` | Up |
| Key `ArrowDown`, `KeyS` | Down |
| Key `ControlLeft`, `ControlRight`, `KeyZ` | Jump |
| Key `AltLeft`, `AltRight`, `KeyX` | Pogo |
| Key `Space`, `KeyC` | Fizz |
| Key `Enter` | Confirm |
| Key `Escape`, `KeyP`, `Pause` | Pause |
| Key `KeyF` (no modifier) | Fullscreen |
| Key `F5`, `F9` | Quick save, Quick load |
| Key `Backquote` | Debug panel |
| Key `Minus`, `Equal`, `Digit0` | Zoom out, Zoom in, Zoom reset |
| Any other key | no action |
| Pad button 14, 15, 12, 13 | Left, Right, Up, Down |
| Pad axis 0 below -0.4, above 0.4 | Left, Right |
| Pad axis 1 below -0.5, above 0.5 | Up, Down |
| Pad button in the Jump, Pogo, Fizz or Pause bindings (default 0; 1 and 3; 2 and 7; 9) | Jump, Pogo, Fizz, Pause |
| Any other pad button or axis | no action |
| Finger on the D-pad | the directions `dpadDirections` gives at its position |
| Finger on Jump, Pogo, Fizz | Jump, Pogo, Fizz |
| Finger on Pause | Pause |
| Finger on nothing | no action |
| Mouse wheel up, down | Zoom in, Zoom out |
| Mouse wheel left or right, any mouse button | no action |

## Tests

`packages/engine/src/input-test.test.ts` covers the model with no DOM: action names, log lines, the ring buffer, the fade, hold-to-leave, the pad tracker, the generic fallback, the touch probe, the sampling counters (a scripted list of timed snapshots) and the report. `e2e/input-test.spec.ts` opens the page from Options, presses keys, checks the lit keys and log lines, checks that a short Esc does not leave and a held one does, and stubs `navigator.getGamepads` for a pad.
