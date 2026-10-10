// The haptics lab's pure logic: cue groups, compiled results, a timeline, event drafts, slider specs, the backend choice and the tuned-versus-default diff.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { HapticCaps } from '@lieutenant-fizz/engine/haptic-backends';
import {
  RUMBLE_BOOST,
  RUMBLE_COMPILE,
  VIBRATE_COMPILE,
  compileBoostedRumble,
  compileRumble,
  compileVibrate,
  patternLength,
  sampleCurve,
  totalTime,
  type HapticCue,
  type HapticEvent,
  type HapticPattern,
  type Policy,
  type RumbleBoost,
  type RumbleCompile,
  type RumbleSegment,
  type VibrateCompile,
} from '@lieutenant-fizz/engine/haptic-pattern';
import { PLUGIN_COMPILE, type PluginCompile } from '@lieutenant-fizz/engine/haptic-plugin-compile';
import type { PlayRecord, Route, Target } from '@lieutenant-fizz/engine/haptics';
import type { LabItem, SliderSpec } from '../audio/lab';
import { FIZZ_HAPTICS } from './fizz-haptics';

// ---------- State ----------

/** Every value the lab can tune, as one value: the live cues, compiler constants and budget, or a copy of them. */
export interface HapticsLabState {
  cues: Record<string, HapticCue>;
  compile: VibrateCompile;
  rumble: RumbleCompile;
  boost: RumbleBoost;
  plugin: PluginCompile;
  budget: { onMs: number; windowMs: number };
}

/** A deep copy of the state, so the lab can compare against a moment in time. */
export const captureHapticsState = (live: HapticsLabState): HapticsLabState =>
  structuredClone(live);

/** The state as the game ships it, before anything could tune it. */
export const HAPTICS_DEFAULTS: HapticsLabState = captureHapticsState({
  cues: FIZZ_HAPTICS.cues,
  compile: { ...VIBRATE_COMPILE },
  rumble: { ...RUMBLE_COMPILE },
  boost: { ...RUMBLE_BOOST },
  plugin: { ...PLUGIN_COMPILE },
  budget: { onMs: 400, windowMs: 1000 },
});

// ---------- Cue groups ----------

export interface CueGroup {
  title: string;
  items: LabItem[];
}

const GROUPS: readonly [string, readonly string[]][] = [
  [
    'Ben',
    [
      'jump',
      'boing',
      'kick',
      'heave',
      'pogoOn',
      'pogoOff',
      'clunk',
      'vworp',
      'fzzt',
      'outOfFizz',
      'bonk',
      'fizzled',
      'sproing',
      'bwomp',
      'blorp',
      'whoa',
    ],
  ],
  [
    'Pickups',
    [
      'crunch',
      'fsssht',
      'gumdrop',
      'goldUsb',
      'extraLife',
      'plink',
      'ting',
      'pop',
      'clink',
      'click',
      'needsDrive',
    ],
  ],
  ['World', ['crumble', 'thunk', 'krunch']],
  ['Boss', ['zzzap', 'thoom', 'clang', 'bossDown']],
  ['Level', ['levelStart', 'taDa', 'gameOver']],
  ['Menus', ['ui.move', 'ui.select', 'ui.back', 'ui.reject', 'ui.toggleOn', 'ui.toggleOff']],
  ['Editor', ['ui.pick', 'ui.drop', 'ui.armed']],
];

/**
 * The cue ids as groups of buttons (Ben, Pickups, World, Boss, Level, Menus, Editor), in a fixed order.
 * A group with no cue in the table is left out, and a cue no group names goes last under Other.
 */
export function hapticLabItems(ids: readonly string[]): CueGroup[] {
  const known = new Set(GROUPS.flatMap(([, list]) => list));
  const have = new Set(ids);
  const groups: CueGroup[] = GROUPS.map(([title, list]) => ({
    title,
    items: list.filter((id) => have.has(id)).map((id) => ({ id, label: id })),
  }));
  groups.push({
    title: 'Other',
    items: ids.filter((id) => !known.has(id)).map((id) => ({ id, label: id })),
  });
  return groups.filter((g) => g.items.length > 0);
}

// ---------- Compiled results ----------

/** What a pattern becomes on each target at one strength. */
export interface Compiled {
  phone: number[];
  phoneMs: number;
  pad: RumbleSegment[];
  padMs: number;
}

/** Compiles a pattern for the phone's vibrator and for a controller with the given constants. */
export function compileBoth(
  p: HapticPattern,
  scale: number,
  compile: Readonly<VibrateCompile>,
  rumble: Readonly<RumbleCompile>,
  boost?: Readonly<RumbleBoost>,
): Compiled {
  const phone = compileVibrate(p, scale, compile);
  // With a boost, the pad's segments are what the desktop's gamepad plugin sends; without, what `vibrationActuator` plays.
  const pad = boost
    ? compileBoostedRumble(p, scale, rumble, boost)
    : compileRumble(p, scale, rumble);
  const last = pad[pad.length - 1];
  return {
    phone,
    phoneMs: totalTime(phone),
    pad,
    padMs: last ? last.at + last.duration : 0,
  };
}

/** A length in ms, or "silent" when the strength is under the floor. */
const lengthText = (ms: number): string => (ms > 0 ? String(ms) : 'silent');

/** The compiled length of a cue on both targets, for its button: "phone 15 · pad 68 ms". */
export const compiledLabel = (c: Compiled): string =>
  `phone ${lengthText(c.phoneMs)} · pad ${lengthText(c.padMs)}${c.padMs > 0 ? ' ms' : ''}`;

/** The on-and-off array as the console shows it. */
export const phoneArrayText = (a: readonly number[]): string =>
  a.length > 0 ? `[${a.join(', ')}]` : 'silent';

// ---------- Timeline ----------

/** One bar on a timeline: when it starts and how long it lasts in ms, and how strong (0 to 1). */
export interface Bar {
  at: number;
  len: number;
  level: number;
}

export interface Timeline {
  /** The longest of the two targets, so both bars share a scale. */
  totalMs: number;
  phone: Bar[];
  pad: Bar[];
}

/** The bars of a compiled pattern: the vibrator's on times at full level, the pad's segments at their stronger motor. */
export function timeline(c: Compiled): Timeline {
  const phone: Bar[] = [];
  let at = 0;
  c.phone.forEach((ms, i) => {
    if (i % 2 === 0 && ms > 0) phone.push({ at, len: ms, level: 1 });
    at += ms;
  });
  const pad = c.pad.map((s) => ({ at: s.at, len: s.duration, level: Math.max(s.strong, s.weak) }));
  return { totalMs: Math.max(c.phoneMs, c.padMs, 1), phone, pad };
}

// ---------- Event drafts ----------

/** The most events the lab edits in one cue. */
export const MAX_DRAFT_EVENTS = 6;

/** One event as the Tune tab edits it: a tap or a hum with its numbers laid flat. */
export interface EventDraft {
  kind: 'tap' | 'hum';
  /** Start, in ms from the start of the cue. */
  at: number;
  /** Length of a hum, in ms (ignored for a tap). */
  duration: number;
  /** A tap's strength, or a hum's strength at its start. */
  start: number;
  /** A hum's strength in the middle. */
  peak: number;
  /** A hum's strength at its end. */
  end: number;
  sharpness: number;
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

/** An event as a draft. A hum's curve is read at its start, middle and end. */
export function draftOf(e: HapticEvent): EventDraft {
  if (e.kind === 'transient') {
    return {
      kind: 'tap',
      at: e.at,
      duration: 100,
      start: e.intensity,
      peak: e.intensity,
      end: e.intensity,
      sharpness: e.sharpness,
    };
  }
  const start = sampleCurve(e.intensity, 0);
  const end = sampleCurve(e.intensity, e.duration);
  return {
    kind: 'hum',
    at: e.at,
    duration: e.duration,
    start,
    peak: sampleCurve(e.intensity, e.duration / 2),
    end,
    sharpness: sampleCurve(e.sharpness, e.duration / 2),
  };
}

/** A draft as an event. A hum whose middle is on the straight line from start to end is a two-point curve. */
export function eventOf(d: EventDraft): HapticEvent {
  if (d.kind === 'tap') {
    return { kind: 'transient', at: d.at, intensity: d.start, sharpness: d.sharpness };
  }
  const straight = near(d.peak, (d.start + d.end) / 2);
  return {
    kind: 'continuous',
    at: d.at,
    duration: d.duration,
    intensity: straight
      ? [
          { t: 0, v: d.start },
          { t: d.duration, v: d.end },
        ]
      : [
          { t: 0, v: d.start },
          { t: d.duration / 2, v: d.peak },
          { t: d.duration, v: d.end },
        ],
    sharpness: d.sharpness,
  };
}

/** The drafts of a pattern's events, up to the most the lab edits. */
export const draftsOf = (p: HapticPattern): EventDraft[] =>
  p.events.slice(0, MAX_DRAFT_EVENTS).map(draftOf);

const sameDraft = (a: EventDraft, b: EventDraft): boolean =>
  a.kind === b.kind &&
  near(a.at, b.at) &&
  near(a.sharpness, b.sharpness) &&
  near(a.start, b.start) &&
  (a.kind === 'tap' ||
    (near(a.duration, b.duration) && near(a.peak, b.peak) && near(a.end, b.end)));

/**
 * The pattern for these drafts. An event whose draft has not changed from the one in `original` is kept
 * exactly as it was (a curve with more points than the draft shows stays whole), and events past the
 * ones the lab edits are kept too.
 */
export function patternOf(drafts: readonly EventDraft[], original?: HapticPattern): HapticPattern {
  const events = drafts.map((d, i) => {
    const was = original?.events[i];
    return was && sameDraft(d, draftOf(was)) ? was : eventOf(d);
  });
  const rest = original?.events.slice(MAX_DRAFT_EVENTS) ?? [];
  return { events: [...events, ...rest] };
}

/** A new tap to add to a cue, near the end of what it has. */
export const newDraft = (kind: 'tap' | 'hum', after: number): EventDraft => ({
  kind,
  at: Math.min(1000, Math.round(after / 5) * 5),
  duration: 100,
  start: 0.5,
  peak: 0.5,
  end: kind === 'hum' ? 0.2 : 0.5,
  sharpness: 0.5,
});

// ---------- Policy ----------

export const POLICY_KINDS = ['interrupt', 'drop-if-busy', 'queue', 'coalesce'] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

/** The kind of a policy, with `coalesce` for the window form. */
export const policyKind = (p: Policy): PolicyKind => (typeof p === 'object' ? 'coalesce' : p);

/** The window of a coalesce policy, or the default window for the others. */
export const coalesceWindow = (p: Policy): number => (typeof p === 'object' ? p.coalesce : 60);

/** A policy of the kind given; `coalesce` uses the window. */
export const policyOf = (kind: PolicyKind, windowMs: number): Policy =>
  kind === 'coalesce' ? { coalesce: windowMs } : kind;

// ---------- Sliders ----------

const S = (
  group: string,
  label: string,
  path: SliderSpec['path'],
  min: number,
  max: number,
  step: number,
  unit: SliderSpec['unit'] = '',
): SliderSpec => ({ id: path.join('.'), group, label, path, min, max, step, unit });

/** The sliders of the Compile tab: the vibrate compiler, the rumble compiler, the plugin's strength curve and the budget. */
export const COMPILE_SLIDERS: readonly SliderSpec[] = [
  S('Phone (vibrate)', 'PERIOD: slice of a hum', ['compile', 'period'], 10, 100, 1, 'ms'),
  S('Phone (vibrate)', 'MIN_ON: shortest pulse', ['compile', 'minOn'], 1, 50, 1, 'ms'),
  S('Phone (vibrate)', 'MIN_OFF: shortest gap', ['compile', 'minOff'], 0, 50, 1, 'ms'),
  S('Phone (vibrate)', 'FLOOR: quietest played', ['compile', 'floor'], 0, 1, 0.01),
  S('Phone (vibrate)', 'T_BASE: weakest tap', ['compile', 'tBase'], 1, 100, 1, 'ms'),
  S('Phone (vibrate)', 'T_SPAN: extra for the strongest', ['compile', 'tSpan'], 0, 100, 1, 'ms'),
  S('Pad (rumble)', 'Pad minimum: weakest tap', ['rumble', 'tapBase'], 10, 200, 5, 'ms'),
  S('Pad (rumble)', 'Pad tap extra', ['rumble', 'tapSpan'], 0, 200, 5, 'ms'),
  S('Pad (rumble)', 'Segment length', ['rumble', 'slice'], 20, 200, 5, 'ms'),
  S('Pad (boost)', 'Shortest segment', ['boost', 'minMs'], 10, 300, 5, 'ms'),
  S('Pad (boost)', 'Heavy floor: weakest heavy motor', ['boost', 'heavyFloor'], 0, 1, 0.05),
  S('Pad (boost)', 'Curve on the heavy motor (1 is linear)', ['boost', 'gamma'], 0.2, 1.5, 0.05),
  S('Pad (boost)', 'Gain: after the curve', ['boost', 'gain'], 0.5, 2, 0.05),
  S(
    'Pad (boost)',
    'Light fold: weak light into heavy (0 is off, so the plugin pulses the light motor)',
    ['boost', 'lightFoldGain'],
    0,
    1.5,
    0.05,
  ),
  S('Pad (boost)', 'Gap between segments', ['boost', 'gapMs'], 0, 100, 5, 'ms'),
  S('Phone (app plugin)', 'FLOOR: quietest played', ['plugin', 'floor'], 0, 1, 0.01),
  S(
    'Phone (app plugin)',
    'Curve: lifts quiet taps (1 is linear)',
    ['plugin', 'gamma'],
    0.2,
    1.5,
    0.05,
  ),
  S('Phone (app plugin)', 'Gain: after the curve', ['plugin', 'gain'], 0.5, 3, 0.05),
  S('Phone (app plugin)', 'Primitive floor: quietest tap sent', ['plugin', 'primMin'], 0, 1, 0.05),
  S('Phone (app plugin)', 'Amplitude floor: quietest wave sent', ['plugin', 'ampMin'], 0, 1, 0.05),
  S('Phone (app plugin)', 'Tick above this sharpness', ['plugin', 'tickAt'], 0, 1, 0.05),
  S('Phone (app plugin)', 'Click above this sharpness', ['plugin', 'clickAt'], 0, 1, 0.05),
  S('Phone (app plugin)', 'Low tick above this sharpness', ['plugin', 'lowAt'], 0, 1, 0.05),
  S('Phone (app plugin)', 'Add a thud from this strength', ['plugin', 'doubleAt'], 0, 1, 0.05),
  S('Budget', 'Vibration allowed per window', ['budget', 'onMs'], 0, 1000, 10, 'ms'),
  S('Budget', 'Window', ['budget', 'windowMs'], 100, 5000, 100, 'ms'),
];

/** The sliders for one event of the Tune tab. Fields are the draft's names. */
export function eventSliders(kind: EventDraft['kind']): SliderSpec[] {
  const g = kind === 'tap' ? 'Tap' : 'Hum';
  const base = [S(g, 'Starts at', ['at'], 0, 600, 5, 'ms')];
  return kind === 'tap'
    ? [
        ...base,
        S(g, 'Strength', ['start'], 0, 1, 0.05),
        S(g, 'Sharpness', ['sharpness'], 0, 1, 0.05),
      ]
    : [
        ...base,
        S(g, 'Length', ['duration'], 10, 600, 10, 'ms'),
        S(g, 'Start strength', ['start'], 0, 1, 0.05),
        S(g, 'Peak strength', ['peak'], 0, 1, 0.05),
        S(g, 'End strength', ['end'], 0, 1, 0.05),
        S(g, 'Sharpness', ['sharpness'], 0, 1, 0.05),
      ];
}

/** The cue-level sliders of the Tune tab. */
export const CUE_SLIDERS: readonly SliderSpec[] = [
  S('Cue', 'Cooldown', ['cooldownMs'], 0, 1000, 10, 'ms'),
  S('Cue', 'Priority', ['priority'], 0, 4, 1),
];

/** The lab-only strength of an audition: 1 plays the cue as written. */
export const LAB_STRENGTH: Readonly<SliderSpec> = S('Lab', 'Strength', ['strength'], 0, 1.5, 0.05);

// ---------- Diff ----------

/** The patch `GameHaptics.tune` takes, as far as the lab changes it (a changed cue is written whole). */
export interface HapticsTunePatch {
  cues?: Record<
    string,
    { events: readonly HapticEvent[]; priority: number; cooldownMs: number; policy: Policy }
  >;
  compile?: Partial<VibrateCompile>;
  rumble?: Partial<RumbleCompile>;
  boost?: Partial<RumbleBoost>;
  plugin?: Partial<PluginCompile>;
  budget?: { onMs?: number; windowMs?: number };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function numbersDiff<T extends object>(from: T, to: T): Partial<T> | undefined {
  const out: Partial<T> = {};
  for (const key of Object.keys(to) as (keyof T)[]) {
    if (!same(from[key], to[key])) out[key] = to[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The values of `to` that differ from `from`, in the shape `__lf.debugHapticsTune` accepts. A cue that
 * changed in any part (events, priority, cooldown or policy) is written whole, so pasting it replaces
 * the cue. `hapticTuneDiff(defaults, current)` is what to copy; `hapticTuneDiff(current, defaults)` is
 * the patch that puts everything back.
 */
export function hapticTuneDiff(from: HapticsLabState, to: HapticsLabState): HapticsTunePatch {
  const out: HapticsTunePatch = {};
  const cues: NonNullable<HapticsTunePatch['cues']> = {};
  for (const [id, cue] of Object.entries(to.cues)) {
    const was = from.cues[id];
    if (
      !was ||
      !same(was.pattern.events, cue.pattern.events) ||
      was.priority !== cue.priority ||
      was.cooldownMs !== cue.cooldownMs ||
      !same(was.policy, cue.policy)
    ) {
      cues[id] = {
        events: cue.pattern.events,
        priority: cue.priority,
        cooldownMs: cue.cooldownMs,
        policy: cue.policy,
      };
    }
  }
  if (Object.keys(cues).length > 0) out.cues = cues;
  const compile = numbersDiff(from.compile, to.compile);
  if (compile) out.compile = compile;
  const rumble = numbersDiff(from.rumble, to.rumble);
  if (rumble) out.rumble = rumble;
  const boost = numbersDiff(from.boost, to.boost);
  if (boost) out.boost = boost;
  const plugin = numbersDiff(from.plugin, to.plugin);
  if (plugin) out.plugin = plugin;
  const budget = numbersDiff(from.budget, to.budget);
  if (budget) out.budget = budget;
  return out;
}

/** The text 'Copy as JSON' puts on the clipboard: only what moved, two-space indented. */
export const hapticTuneJson = (diff: HapticsTunePatch): string => JSON.stringify(diff, null, 2);

/** How many things a diff changes, for the 'N changed' label: a cue counts once, however much of it moved. */
export function countHapticChanges(diff: HapticsTunePatch): number {
  return (
    Object.keys(diff.cues ?? {}).length +
    Object.keys(diff.compile ?? {}).length +
    Object.keys(diff.rumble ?? {}).length +
    Object.keys(diff.boost ?? {}).length +
    Object.keys(diff.plugin ?? {}).length +
    Object.keys(diff.budget ?? {}).length
  );
}

// ---------- Backend choice ----------

export type BackendChoice = 'auto' | 'phone' | 'controller' | 'off';

export interface BackendCaps {
  device: Pick<HapticCaps, 'available' | 'reason' | 'name'>;
  controller: Pick<HapticCaps, 'available' | 'reason' | 'name'>;
}

export interface BackendOption {
  choice: BackendChoice;
  label: string;
  enabled: boolean;
  /** Why it cannot be chosen, when it cannot. */
  reason?: string;
}

/** The four backend buttons (Auto, Phone, Pad and Off), each with the reason it is disabled when its target cannot play. */
export function backendOptions(caps: BackendCaps): BackendOption[] {
  const opt = (
    choice: BackendChoice,
    label: string,
    ok: boolean,
    reason: string | undefined,
  ): BackendOption => ({
    choice,
    label,
    enabled: ok,
    ...(!ok ? { reason: reason ?? 'unavailable' } : {}),
  });
  return [
    opt(
      'auto',
      'Auto',
      caps.device.available || caps.controller.available,
      'no phone vibrator or controller',
    ),
    opt('phone', 'Phone', caps.device.available, caps.device.reason),
    opt('controller', 'Pad', caps.controller.available, caps.controller.reason),
    opt('off', 'Off', true, undefined),
  ];
}

/**
 * Where an audition goes. Auto follows where the game's cues go (the controller while a pad is the device
 * in use, else the phone) and falls back to whichever target can play. Null means nowhere.
 */
export function pickTarget(choice: BackendChoice, route: Route, caps: BackendCaps): Target | null {
  if (choice === 'off') return null;
  if (choice === 'phone') return caps.device.available ? 'device' : null;
  if (choice === 'controller') return caps.controller.available ? 'controller' : null;
  const first: Target = route === 'controller' ? 'controller' : 'device';
  const second: Target = first === 'device' ? 'controller' : 'device';
  const can = (t: Target): boolean => (t === 'device' ? caps.device : caps.controller).available;
  return can(first) ? first : can(second) ? second : null;
}

// ---------- Status ----------

export interface StatusInput {
  caps: BackendCaps;
  /** The target chosen in the header; the status explains an unavailable target only when it is the one wanted. Auto when omitted. */
  choice?: BackendChoice;
  /** Whether the page has had a tap (`navigator.userActivation.hasBeenActive`), or null when the browser does not say. */
  tapped: boolean | null;
  last?: Pick<PlayRecord, 'cue' | 'target' | 'ok' | 'tier' | 'reason' | 'compiled'> | undefined;
}

/** One line for the header: whether the vibrator and a pad work, whether the page was tapped, and the last play. */
export function labStatus(i: StatusInput): string {
  const choice = i.choice ?? 'auto';
  const { device, controller } = i.caps;
  // A target that cannot play is explained only when it is the one chosen, or in Auto when neither can.
  const neither = !device.available && !controller.available;
  const showPhone =
    device.available ||
    choice === 'phone' ||
    (choice === 'auto' && !controller.available) ||
    neither;
  const showPad =
    controller.available ||
    choice === 'controller' ||
    (choice === 'auto' && !device.available) ||
    neither;
  const phone = !showPhone
    ? ''
    : device.available
      ? 'phone yes'
      : `phone no (${device.reason ?? '?'})`;
  const pad = !showPad
    ? ''
    : controller.available
      ? `pad ${controller.name ?? 'yes'}`
      : `pad no (${controller.reason ?? '?'})`;
  const tapped = i.tapped === null ? '' : i.tapped ? 'tapped yes' : 'tapped no: tap the page once';
  const l = i.last;
  const last = !l
    ? ''
    : !l.ok
      ? `last ${l.cue}: ${l.reason ?? 'refused'}`
      : `last ${l.cue} on ${l.target === 'device' ? 'phone' : 'pad'} → ${
          Array.isArray(l.compiled) && typeof l.compiled[0] === 'number'
            ? phoneArrayText(l.compiled as number[])
            : `${(l.compiled as RumbleSegment[] | undefined)?.length ?? 0} segments`
        } (tier ${l.tier})`;
  return [phone, pad, tapped, last].filter(Boolean).join(' · ');
}

// ---------- Compare and the floor ladder ----------

/** One play in a timed run: when (ms after the run starts), where and what. */
export interface Step {
  at: number;
  target: Target;
  pattern: HapticPattern;
  scale: number;
  label: string;
}

/** The strengths the Compare tab plays a cue at. */
export const COMPARE_SCALES: readonly number[] = [0.5, 0.75, 1];
/** How many times a comparison repeats, and the gap between plays, in ms. */
export const REPEAT = 3;
export const REPEAT_GAP_MS = 400;

const gapFor = (p: HapticPattern): number => Math.max(REPEAT_GAP_MS, patternLength(p) + 150);

/** The phone, then the controller, back to back, repeated `REPEAT` times with a gap between plays. */
export function compareRun(p: HapticPattern, scale: number, targets: readonly Target[]): Step[] {
  const gap = gapFor(p);
  const steps: Step[] = [];
  let at = 0;
  for (let k = 0; k < REPEAT; k++) {
    for (const target of targets) {
      steps.push({ at, target, pattern: p, scale, label: target === 'device' ? 'phone' : 'pad' });
      at += gap;
    }
  }
  return steps;
}

/** The cue at each of the compare strengths on one target, one after another. */
export function scaleRun(p: HapticPattern, target: Target): Step[] {
  const gap = gapFor(p) * 2;
  return COMPARE_SCALES.map((scale, k) => ({
    at: k * gap,
    target,
    pattern: p,
    scale,
    label: `${scale}`,
  }));
}

/** Taps from 0.1 to 1.0 in tenths: where the player stops feeling them is where `FLOOR` belongs. */
export const LADDER_LEVELS: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export function floorLadder(target: Target, scale = 1): Step[] {
  return LADDER_LEVELS.map((v, k) => ({
    at: k * REPEAT_GAP_MS,
    target,
    pattern: { events: [{ kind: 'transient', at: 0, intensity: v, sharpness: 0.5 }] },
    scale,
    label: `${v}`,
  }));
}
