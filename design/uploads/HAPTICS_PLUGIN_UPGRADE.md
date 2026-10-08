# tauri-plugin-haptics: the capability ladder

A proposal for upgrading `plugin/tauri-plugin-haptics` (branch `chore/integrate-jules-haptics`). Callers describe a haptic once. The plugin plays it at the richest tier the device supports and steps down a tier at a time when it can't. Lieutenant Fizz is the first game client; the Haptics Lab is where we tune and test.

## 1. What changes, in one line each

- **Portable patterns.** Callers send intent (intensity, sharpness, time), not device APIs. The plugin compiles that into the best tier available.
- **A five-tier ladder.** Envelope → composition → amplitude waveform → on/off waveform → silent. The result reports which tier played and why.
- **Register once, trigger by id.** Patterns compile on startup, so in-game triggers are a short id plus a scale. That keeps the invoke round trip small when Ben jumps 3 times a second.
- **Native policies.** Interrupt, queue, drop-if-busy and coalesce run in Kotlin, so a run of 12 Cheezies doesn't become 12 cancelled effects.
- **Controllers.** `InputDevice.vibratorManager` (API 31+) sends rumble to a connected gamepad.
- **Honest capabilities.** The report covers support for each primitive, primitive durations, effect support and the resonant frequency, plus the SDK level.
- **A lab override.** `maxTier` forces a downgrade, so one high-end phone can preview what a budget phone feels like.

## 2. The ladder

| Tier | Android API | Needs | What it can express |
|---|---|---|---|
| 4 · Envelope | `BasicEnvelopeBuilder` (intensity + sharpness), `WaveformEnvelopeBuilder` (amplitude + Hz) | API 36, `areEnvelopeEffectsSupported()` | Smooth intensity and frequency curves. Closest to a controller. |
| 3 · Composition | `startComposition().addPrimitive(id, scale, delay)` | API 30+, **each** primitive checked with `arePrimitivesSupported()` | OEM-tuned tick, low_tick (31+), click, thud, spin, quick_rise, slow_rise, with scale |
| 2 · Amplitude waveform | `createWaveform(timings, amplitudes, -1)` | `hasAmplitudeControl()` | Steps of 0–255 strength at ~10 ms resolution |
| 1 · On/off waveform | `createWaveform(timings, -1)` | `hasVibrator()` | Duration only; strength is faked with duty-cycling (see §4) |
| 0 · Silent | | | Resolves `{ ok: true, tier: 0 }` and never errors |

Menus also get a **UI lane**: `View.performHapticFeedback(HapticFeedbackConstants.*)` with `CONFIRM`, `REJECT`, `SEGMENT_TICK`, `TOGGLE_ON/OFF` and `DRAG_START` (API 30/34). These are OEM-tuned and respect the user's touch-feedback setting automatically, which is exactly right for menu ticks.

## 3. API sketch (guest-js)

```ts
// A portable pattern: what it should feel like, not how to make it.
export type HapticEvent =
  | { kind: 'transient'; at: number; intensity: number; sharpness: number }          // a tap
  | { kind: 'continuous'; at: number; duration: number;                              // a hum or rumble
      intensity: number | Curve; sharpness: number | Curve };
export type Curve = Array<{ t: number; v: number }>;  // t in ms from event start, v in 0..1
export type HapticPattern = { events: HapticEvent[]; hint?: Partial<Record<PrimitiveId, true>> };

export type Policy = 'interrupt' | 'queue' | 'drop-if-busy' | { coalesce: number }; // coalesce window in ms
export type Target = 'auto' | 'device' | 'controller';

register(id: string, pattern: HapticPattern, opts?: { usage?: HapticsUsage }): Promise<CompileReport>;
trigger(id: string, opts?: { scale?: number; policy?: Policy; target?: Target }): Promise<PlayResult>;
ui(kind: 'confirm' | 'reject' | 'tick' | 'toggle-on' | 'toggle-off' | 'drag-start'): Promise<PlayResult>;
setMasterScale(v: number): Promise<void>;         // game intensity slider
setMaxTier(t: 0 | 1 | 2 | 3 | 4 | null): Promise<void>; // lab: simulate weaker hardware

// play(EffectRequest) stays as the raw escape hatch for the lab's editors.

export type PlayResult = { ok: boolean; tier: 0 | 1 | 2 | 3 | 4; downgraded: boolean; reason?: string; target: 'device' | 'controller' };
export type CompileReport = { id: string; tier: number; estimatedMs: number; notes: string[] };

export type Capabilities = {
  sdkInt: number;
  hasVibrator: boolean; hasAmplitudeControl: boolean;
  primitives: Record<PrimitiveId | 'low_tick', { supported: boolean; durationMs?: number }>; // getPrimitiveDurations (31+)
  effects: Record<'click' | 'double_click' | 'tick' | 'heavy_click', 'yes' | 'no' | 'unknown'>; // areEffectsSupported (30+)
  envelope?: { maxSize: number; minPointMs: number; maxPointMs: number; maxMs: number; hz?: [number, number] };
  resonantHz?: number; qFactor?: number;            // getResonantFrequency / getQFactor (31+)
  controllers: Array<{ id: number; name: string; vibrators: number }>;
  touchFeedbackEnabled?: boolean;
  topTier: 0 | 1 | 2 | 3 | 4;
};
```

## 4. Stepping down a tier

Every step is deterministic, so the lab can show the result before it plays.

**Envelope → composition (4 → 3)**
- Transient with sharpness ≥ 0.6 → `tick` (intensity < 0.4) or `click`. With sharpness < 0.4 → `low_tick` or `thud`. Scale = intensity.
- Rising continuous: under 150 ms → `quick_rise`; otherwise → `slow_rise`. Scale = peak.
- Sustained continuous → `spin` if supported. Otherwise drop to tier 2 for that event only, so a pattern can mix tiers.
- Missing primitives use the nearest neighbour: low_tick → tick → click, thud → click, spin → quick_rise → tier 2.
- `delay` comes from `at` minus the previous primitive's real duration (`getPrimitiveDurations`), so rhythms stay on beat.

**Composition → amplitude waveform (3 → 2)**
- Each primitive becomes a one-shot from a duration table: tick 10 ms, low_tick 12, click 15, thud 30, quick_rise 60, slow_rise 150, spin 90. The table is overridden by measured durations.
- Amplitude = scale × a per-primitive ceiling (tick 140, click 200, thud 255). Rises become 3–4 step ramps.

**Envelope → amplitude waveform (4 → 2)**
- Sample the intensity curve every 10 ms, then merge neighbours within ±8 amplitude.
- Sharpness can't be shown on most LRAs, so low sharpness gets slightly longer, softer segments (+20% time, −15% amplitude).

**Amplitude → on/off (2 → 1)**
- Use duty-cycle PWM on a 20 ms period: on-time = amplitude/255 × 20 ms, with a minimum of 6 ms. Anything under amplitude 40 is dropped.
- A felt "strength" survives on cheap ERM motors.

**Safety on every tier**
- Clamp to `maxDurationMs`.
- Never repeat unless `allowRepeatingWaveforms` is set.
- No segment shorter than the actuator's minimum: 6 ms, or `minPointMs` on envelope devices.

## 5. Native policies (Kotlin)

- **interrupt** (the default for one-off hits): `cancel()`, then play.
- **queue**: wait for the current effect's estimated end. The schedule comes from the compiled duration, not a callback.
- **drop-if-busy**: skip if something played within its estimated window.
- **coalesce(n)**: triggers of the same id inside the window merge into one. Up to 3 merges increase its scale by +0.15 each. This is for snacks, menu scrolling and coin runs.

## 6. Usage and settings

- `touch` respects `HAPTIC_FEEDBACK_ENABLED`. Use it for the UI lane and menus.
- `media` gets `respectSystemSettings: false` by default. Game rumble is governed by the game's own toggle and intensity, which the store and accessibility guidance expect.
- The game asks once whether it may use vibration, if the system setting is off, and never nags.

## 7. Fixes to the current branch

1. `PredefinedEffectId` lists `thud` and `pop`, but these are hidden Android constants. **Remove them from the type**, and send `thud` through the primitive instead. The current silent fallback to click hides the mistake.
2. `compositionSupported` uses `areAllPrimitivesSupported` across all six, so one missing `spin` disables everything. Report each primitive separately (§3).
3. The `effect` composition step loses its scale. Accept `scale`, or drop the step kind in favour of `primitive`.
4. Envelope is hard-disabled. Gate it on `Build.VERSION.SDK_INT >= 36 && areEnvelopeEffectsSupported()`, compiled with `compileSdk 36`. Keep the guard in reflection if the toolchain lags.
5. `PlayResult` should always return `tier` and `target`. The lab needs them to show what actually happened.

## 8. Lieutenant Fizz patterns

Written once in portable form. Each line shows what plays at tiers 4 / 3 / 2.

| Event | Pattern | Tier 4 · 3 · 2 | Policy |
|---|---|---|---|
| Jump | transient 0.5 / sharp 0.7 | env tap · tick 0.5 · 10 ms @ 120 | interrupt |
| High pogo | continuous 80 ms, intensity 0.2→0.5, sharp 0.4 | env ramp · quick_rise 0.4 · 3-step ramp | interrupt |
| Pogo on / off | two transients 0.6 at 0, 90 ms / one transient 0.5 | taps · click+click / click · two one-shots | UI lane: toggle-on/off |
| Fizz fired | transient 0.35 / sharp 0.9 | env tap · click 0.35 · 12 ms @ 90 | drop-if-busy |
| Out of fizz | transients 0.45 at 0, 60 ms, sharp 0.2 | taps · low_tick×2 · `[0,20,40,20]` @ 110 | interrupt |
| Stomp | transient 0.7 / sharp 0.2 | env thump · thud 0.7 · 30 ms @ 200 | interrupt |
| Stun (bubble hit) | transient 0.5 / sharp 0.8 | tap · click 0.5 · 15 ms @ 130 | drop-if-busy |
| Hurt | transient 1.0 sharp 0.6, then continuous 120 ms 0.9→0 sharp 0.1 | env · click+thud · `[0,15,40,120]` @ 255→160 | interrupt |
| Snack | transient 0.3 / sharp 0.9 | tap · tick 0.3 · 8 ms @ 80 | coalesce(60) |
| Cream soda | transients 0.3, 0.5, 0.7 at 0, 30, 60 ms | taps · tick×3 rising · 3 one-shots | queue |
| Extra life | continuous 180 ms, intensity 0.3→0.7→0.3, sharp 0.5 | env swell · spin 0.6 · 5-step swell | queue |
| Level cleared | continuous 120 ms rise, then transient 0.8 | env · quick_rise+click · ramp + one-shot | interrupt |
| Out of lives | continuous 360 ms, intensity 0.8→0.2, sharp 0.1 | env fade · thud 0.8 + slow fade on tier 2 · `[0,120,30,120,30,160]` @ 200/130/70 | interrupt |
| Boss slam | continuous 220 ms, intensity 1.0→0.3, sharp 0.05, around 60 Hz | low env rumble · thud 1.0 + low_tick×3 · `[0,60,20,120]` @ 255/140 | interrupt |
| Menu move / select / locked | UI lane | segment-tick · confirm · reject | coalesce(40) |
| Layout pick up / drop | UI lane | drag-start · tick 0.3 thud | interrupt |

Controller connected: `target: 'auto'` sends gameplay patterns to the gamepad's vibrator (tier 2 on that device), and the phone stays silent. The UI lane stays on the phone.

## 9. What to add to the Haptics Lab

- **Tier override:** a segmented control with Auto, 4, 3, 2, 1 and Off. Play the same pattern at each tier back to back to compare.
- **Pattern editor:** an intensity curve and a sharpness curve on one timeline, with a preview of the compiled result for each tier.
- **Capability card:** support for each primitive with its measured duration, resonant Hz, top tier and any controllers.
- **Export:** copy the pattern as JSON, then paste it into the game's `fizz-haptics.ts`.

## 10. Order of work

1. Fix the type bugs and per-primitive capabilities (§7) so tiers 2 and 3 are trustworthy.
2. `register` / `trigger`, master scale and policies, using tiers 1–3 only.
3. The UI lane.
4. Controller target.
5. Envelope tier, with the lab's tier override for testing.
