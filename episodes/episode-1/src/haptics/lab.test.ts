// Tests for the haptics lab's pure logic: groups, compiled results, the timeline, drafts, sliders, backend choice, status, runs and the diff.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { fakeBackend } from '@lieutenant-fizz/engine/haptic-backends';
import { RUMBLE_COMPILE, VIBRATE_COMPILE } from '@lieutenant-fizz/engine/haptic-pattern';
import type { HapticPattern } from '@lieutenant-fizz/engine/haptic-pattern';
import { GameHaptics } from '@lieutenant-fizz/engine/haptics';
import { formatValue, fromPosition, inputAttrs, snap, toPosition } from '../audio/lab';
import { FIZZ_HAPTICS } from './fizz-haptics';
import {
  COMPARE_SCALES,
  COMPILE_SLIDERS,
  CUE_SLIDERS,
  HAPTICS_DEFAULTS,
  LADDER_LEVELS,
  LAB_STRENGTH,
  MAX_DRAFT_EVENTS,
  REPEAT,
  backendOptions,
  captureHapticsState,
  compareRun,
  compileBoth,
  compiledLabel,
  countHapticChanges,
  draftOf,
  draftsOf,
  eventOf,
  eventSliders,
  floorLadder,
  hapticLabItems,
  hapticTuneDiff,
  hapticTuneJson,
  labStatus,
  patternOf,
  phoneArrayText,
  pickTarget,
  policyKind,
  policyOf,
  scaleRun,
  timeline,
  type BackendCaps,
  type HapticsLabState,
} from './lab';

const ids = Object.keys(FIZZ_HAPTICS.cues);
const live = (): HapticsLabState => captureHapticsState(HAPTICS_DEFAULTS);
const tap = (intensity: number, sharpness: number, at = 0): HapticPattern => ({
  events: [{ kind: 'transient', at, intensity, sharpness }],
});

describe('hapticLabItems', () => {
  const groups = hapticLabItems(ids);

  it('groups the cues as Ben, Pickups, World, Boss, Level and Menus, in that order', () => {
    expect(groups.map((g) => g.title)).toEqual([
      'Ben',
      'Pickups',
      'World',
      'Boss',
      'Level',
      'Menus',
    ]);
  });

  it('puts every cue in the table in exactly one group, with nothing left over', () => {
    const listed = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(listed.sort()).toEqual([...ids].sort());
    expect(new Set(listed).size).toBe(listed.length);
    expect(groups.find((g) => g.title === 'Other')).toBeUndefined();
  });

  it('puts a cue no group names under Other, and an editor cue under Editor', () => {
    const g = hapticLabItems([...ids, 'mystery', 'ui.drop']);
    expect(g.find((x) => x.title === 'Other')?.items).toEqual([
      { id: 'mystery', label: 'mystery' },
    ]);
    expect(g.find((x) => x.title === 'Editor')?.items.map((i) => i.id)).toEqual(['ui.drop']);
  });
});

describe('compileBoth and the labels', () => {
  const c = compileBoth(FIZZ_HAPTICS.cues['jump']!.pattern, 1, VIBRATE_COMPILE, RUMBLE_COMPILE);

  it('compiles for the phone and the pad', () => {
    expect(c.phone).toEqual([15]);
    expect(c.phoneMs).toBe(15);
    expect(c.pad).toHaveLength(1);
    expect(c.padMs).toBe(c.pad[0]!.duration);
  });

  it('labels the lengths, and says silent under the floor', () => {
    expect(compiledLabel(c)).toBe(`phone 15 · pad ${c.padMs} ms`);
    const quiet = compileBoth(tap(0.04, 0.5), 1, VIBRATE_COMPILE, RUMBLE_COMPILE);
    expect(compiledLabel(quiet)).toBe('phone silent · pad silent');
  });

  it('shows the array the way the console does', () => {
    expect(phoneArrayText([15])).toBe('[15]');
    expect(phoneArrayText([59, 6, 11])).toBe('[59, 6, 11]');
    expect(phoneArrayText([])).toBe('silent');
  });

  it('follows the strength and the constants', () => {
    const p = FIZZ_HAPTICS.cues['jump']!.pattern;
    expect(compileBoth(p, 0.5, VIBRATE_COMPILE, RUMBLE_COMPILE).phone).toEqual([11]);
    expect(compileBoth(p, 0.3, VIBRATE_COMPILE, RUMBLE_COMPILE).phone).toEqual([]);
    expect(compileBoth(p, 1, { ...VIBRATE_COMPILE, tBase: 20 }, RUMBLE_COMPILE).phone).toEqual([
      26,
    ]);
  });
});

describe('timeline', () => {
  it('lays the vibrator on-times and the pad segments on one scale', () => {
    const whoa = compileBoth(
      FIZZ_HAPTICS.cues['whoa']!.pattern,
      1,
      VIBRATE_COMPILE,
      RUMBLE_COMPILE,
    );
    const t = timeline(whoa);
    // [59, 6, 11, 9, 8, 12, 6]: on 59, off 6, on 11, off 9, on 8, off 12, on 6.
    expect(t.phone).toEqual([
      { at: 0, len: 59, level: 1 },
      { at: 65, len: 11, level: 1 },
      { at: 85, len: 8, level: 1 },
      { at: 105, len: 6, level: 1 },
    ]);
    expect(t.totalMs).toBe(Math.max(whoa.phoneMs, whoa.padMs));
    expect(t.pad.length).toBe(whoa.pad.length);
    expect(t.pad.every((b) => b.level > 0 && b.level <= 1)).toBe(true);
  });

  it('is empty but has a scale for a silent cue', () => {
    const t = timeline(compileBoth(tap(0.01, 0), 1, VIBRATE_COMPILE, RUMBLE_COMPILE));
    expect(t.phone).toEqual([]);
    expect(t.pad).toEqual([]);
    expect(t.totalMs).toBe(1);
  });

  it('skips the empty leading on of a pattern that begins silent', () => {
    const t = timeline(compileBoth(tap(0.7, 0.2, 40), 1, VIBRATE_COMPILE, RUMBLE_COMPILE));
    expect(t.phone).toEqual([{ at: 40, len: 21, level: 1 }]);
  });
});

describe('event drafts', () => {
  it('give back every cue in the table exactly as it was when nothing is edited', () => {
    for (const [id, cue] of Object.entries(FIZZ_HAPTICS.cues)) {
      expect(patternOf(draftsOf(cue.pattern), cue.pattern), id).toEqual(cue.pattern);
    }
  });

  it('give back the same event for a draft with no change even without the original', () => {
    for (const [id, cue] of Object.entries(FIZZ_HAPTICS.cues)) {
      const again = patternOf(draftsOf(cue.pattern));
      // Without the original the curve is rebuilt from start, middle and end: the same sounds.
      const a = compileBoth(cue.pattern, 1, VIBRATE_COMPILE, RUMBLE_COMPILE);
      const b = compileBoth(again, 1, VIBRATE_COMPILE, RUMBLE_COMPILE);
      expect(b.phone, id).toEqual(a.phone);
    }
  });

  it('read a tap and a hum into flat numbers', () => {
    expect(draftOf(FIZZ_HAPTICS.cues['jump']!.pattern.events[0]!)).toMatchObject({
      kind: 'tap',
      start: 0.5,
      sharpness: 0.7,
    });
    expect(draftOf(FIZZ_HAPTICS.cues['extraLife']!.pattern.events[0]!)).toMatchObject({
      kind: 'hum',
      duration: 180,
      start: 0.3,
      peak: 0.7,
      end: 0.3,
    });
  });

  it('make a straight hum a two-point curve and a bent one a three-point curve', () => {
    const base = draftOf(FIZZ_HAPTICS.cues['heave']!.pattern.events[0]!);
    const straight = eventOf({ ...base, peak: (base.start + base.end) / 2 });
    expect(straight.kind === 'continuous' && straight.intensity).toHaveLength(2);
    const bent = eventOf({ ...base, peak: 0.9 });
    expect(bent.kind === 'continuous' && bent.intensity).toHaveLength(3);
  });

  it('change only the edited event and keep the rest whole', () => {
    const cue = FIZZ_HAPTICS.cues['whoa']!;
    const drafts = draftsOf(cue.pattern);
    drafts[0] = { ...drafts[0]!, start: 0.4 };
    const p = patternOf(drafts, cue.pattern);
    expect(p.events[0]).toMatchObject({ intensity: 0.4 });
    expect(p.events[1]).toBe(cue.pattern.events[1]);
  });

  it('edit at most six events and keep any beyond that', () => {
    const many: HapticPattern = {
      events: Array.from({ length: 8 }, (_, k) => ({
        kind: 'transient' as const,
        at: k * 10,
        intensity: 0.5,
        sharpness: 0.5,
      })),
    };
    expect(draftsOf(many)).toHaveLength(MAX_DRAFT_EVENTS);
    expect(patternOf(draftsOf(many), many)).toEqual(many);
  });
});

describe('policy', () => {
  it('round-trips each kind, with a coalesce window', () => {
    expect(policyKind('queue')).toBe('queue');
    expect(policyKind({ coalesce: 60 })).toBe('coalesce');
    expect(policyOf('coalesce', 80)).toEqual({ coalesce: 80 });
    expect(policyOf('interrupt', 80)).toBe('interrupt');
  });
});

describe('sliders', () => {
  it('cover PERIOD, MIN_ON, MIN_OFF, FLOOR, T_BASE, T_SPAN, the pad minimum and segment, the plugin curve and the budget', () => {
    expect(COMPILE_SLIDERS.map((s) => s.path.join('.'))).toEqual([
      'compile.period',
      'compile.minOn',
      'compile.minOff',
      'compile.floor',
      'compile.tBase',
      'compile.tSpan',
      'rumble.tapBase',
      'rumble.tapSpan',
      'rumble.slice',
      'plugin.floor',
      'plugin.gamma',
      'plugin.gain',
      'plugin.primMin',
      'plugin.ampMin',
      'plugin.tickAt',
      'plugin.clickAt',
      'plugin.lowAt',
      'plugin.doubleAt',
      'budget.onMs',
      'budget.windowMs',
    ]);
  });

  it('sit inside the limits the runtime accepts and start on a value of their own step', () => {
    const state = live();
    for (const s of COMPILE_SLIDERS) {
      const [root, key] = s.path as [keyof HapticsLabState, string];
      const v = (state[root] as unknown as Record<string, number>)[key]!;
      expect(v, s.id).toBeGreaterThanOrEqual(s.min);
      expect(v, s.id).toBeLessThanOrEqual(s.max);
      expect(snap(s, v), s.id).toBe(v);
    }
  });

  it('give the event fields of a tap and of a hum', () => {
    expect(eventSliders('tap').map((s) => s.path[0])).toEqual(['at', 'start', 'sharpness']);
    expect(eventSliders('hum').map((s) => s.path[0])).toEqual([
      'at',
      'duration',
      'start',
      'peak',
      'end',
      'sharpness',
    ]);
    expect(CUE_SLIDERS.map((s) => s.path[0])).toEqual(['cooldownMs', 'priority']);
  });

  it('make the lab strength 0 to 1.5, and format and snap like the sound lab', () => {
    expect([LAB_STRENGTH.min, LAB_STRENGTH.max]).toEqual([0, 1.5]);
    expect(snap(LAB_STRENGTH, 1.23)).toBe(1.25);
    expect(snap(LAB_STRENGTH, 9)).toBe(1.5);
    const period = COMPILE_SLIDERS[0]!;
    expect(formatValue(period, 20)).toBe('20 ms');
    expect(fromPosition(period, toPosition(period, 40))).toBe(40);
    expect(inputAttrs(period)).toEqual({ min: 10, max: 100, step: 1 });
  });
});

describe('backend choice', () => {
  const caps = (device: boolean, controller: boolean): BackendCaps => ({
    device: { available: device, ...(device ? {} : { reason: 'no vibrator' }) },
    controller: { available: controller, ...(controller ? {} : { reason: 'no controller' }) },
  });

  it('lists Auto, Phone, Controller and Off, and disables what cannot work with the reason', () => {
    const o = backendOptions(caps(true, false));
    expect(o.map((x) => [x.choice, x.enabled, x.reason])).toEqual([
      ['auto', true, undefined],
      ['phone', true, undefined],
      ['controller', false, 'no controller'],
      ['off', true, undefined],
    ]);
    const none = backendOptions(caps(false, false));
    expect(none.map((x) => x.enabled)).toEqual([false, false, false, true]);
    expect(none[1]?.reason).toBe('no vibrator');
    expect(none[0]?.reason).toBe('no phone vibrator or controller');
  });

  it('picks the target: Auto follows the route and falls back, the others are literal, Off is nowhere', () => {
    expect(pickTarget('auto', 'device', caps(true, true))).toBe('device');
    expect(pickTarget('auto', 'controller', caps(true, true))).toBe('controller');
    expect(pickTarget('auto', 'controller', caps(true, false))).toBe('device');
    expect(pickTarget('auto', 'device', caps(false, true))).toBe('controller');
    expect(pickTarget('auto', 'none', caps(true, true))).toBe('device');
    expect(pickTarget('auto', 'device', caps(false, false))).toBeNull();
    expect(pickTarget('phone', 'controller', caps(true, true))).toBe('device');
    expect(pickTarget('phone', 'device', caps(false, true))).toBeNull();
    expect(pickTarget('controller', 'device', caps(true, true))).toBe('controller');
    expect(pickTarget('controller', 'device', caps(true, false))).toBeNull();
    expect(pickTarget('off', 'device', caps(true, true))).toBeNull();
  });
});

describe('labStatus', () => {
  const up: BackendCaps = {
    device: { available: true },
    controller: { available: true, name: 'Fake pad' },
  };

  it('says whether the phone and a pad work, whether the page was tapped and the last compiled result', () => {
    expect(
      labStatus({
        caps: up,
        tapped: true,
        last: { cue: 'jump', target: 'device', ok: true, tier: 1, compiled: [15] },
      }),
    ).toBe('phone yes · pad Fake pad · tapped yes · last jump on phone → [15] (tier 1)');
  });

  it('gives the reasons when something does not work and asks for a tap', () => {
    const s = labStatus({
      caps: {
        device: { available: false, reason: 'no vibrator' },
        controller: { available: false, reason: 'no controller' },
      },
      tapped: false,
      last: { cue: 'audition', target: 'device', ok: false, tier: 0, reason: 'waiting for a tap' },
    });
    expect(s).toBe(
      'phone no (no vibrator) · pad no (no controller) · tapped no: tap the page once · last audition: waiting for a tap',
    );
  });

  it('counts pad segments and leaves out a tap state the browser does not give', () => {
    const s = labStatus({
      caps: up,
      tapped: null,
      last: {
        cue: 'bonk',
        target: 'controller',
        ok: true,
        tier: 2,
        compiled: [{ at: 0, duration: 68, strong: 0.56, weak: 0.14 }],
      },
    });
    expect(s).toBe('phone yes · pad Fake pad · last bonk on pad → 1 segments (tier 2)');
  });
});

describe('runs', () => {
  const jump = FIZZ_HAPTICS.cues['jump']!.pattern;

  it('compare plays the phone then the controller back to back, three times, 400 ms apart', () => {
    const run = compareRun(jump, 1, ['device', 'controller']);
    expect(run).toHaveLength(2 * REPEAT);
    expect(run.map((s) => s.at)).toEqual([0, 400, 800, 1200, 1600, 2000]);
    expect(run.map((s) => s.target)).toEqual([
      'device',
      'controller',
      'device',
      'controller',
      'device',
      'controller',
    ]);
  });

  it('spaces a long cue by its length so plays do not overlap', () => {
    const run = compareRun(FIZZ_HAPTICS.cues['bossDown']!.pattern, 1, ['device']);
    expect(run[1]!.at - run[0]!.at).toBe(550);
  });

  it('plays a cue at 0.5, 0.75 and 1.0', () => {
    expect(COMPARE_SCALES).toEqual([0.5, 0.75, 1]);
    const run = scaleRun(jump, 'device');
    expect(run.map((s) => s.scale)).toEqual([0.5, 0.75, 1]);
    expect(run.map((s) => s.at)).toEqual([0, 800, 1600]);
  });

  it('has a floor ladder of taps from 0.1 to 1.0, whose quiet end is silent on the phone', () => {
    const steps = floorLadder('device');
    expect(steps).toHaveLength(10);
    expect(LADDER_LEVELS[0]).toBe(0.1);
    expect(LADDER_LEVELS[9]).toBe(1);
    const lengths = steps.map(
      (s) => compileBoth(s.pattern, s.scale, VIBRATE_COMPILE, RUMBLE_COMPILE).phoneMs,
    );
    expect(lengths[0]).toBe(0);
    expect(lengths[1]).toBe(11); // 0.2 is over the 0.16 floor
    expect(lengths[9]).toBeGreaterThan(lengths[1]!);
  });
});

describe('hapticTuneDiff', () => {
  it('is empty when nothing moved', () => {
    expect(hapticTuneDiff(HAPTICS_DEFAULTS, live())).toEqual({});
    expect(countHapticChanges({})).toBe(0);
  });

  it('writes a changed cue whole, and only that cue', () => {
    const s = live();
    s.cues['jump']!.cooldownMs = 40;
    const d = hapticTuneDiff(HAPTICS_DEFAULTS, s);
    expect(Object.keys(d.cues ?? {})).toEqual(['jump']);
    expect(d.cues?.['jump']).toEqual({
      events: FIZZ_HAPTICS.cues['jump']!.pattern.events,
      priority: 1,
      cooldownMs: 40,
      policy: 'drop-if-busy',
    });
    expect(d.compile).toBeUndefined();
    expect(countHapticChanges(d)).toBe(1);
  });

  it('writes only the constants that moved', () => {
    const s = live();
    s.compile.floor = 0.2;
    s.rumble.tapBase = 60;
    s.plugin.gamma = 0.8;
    s.budget.onMs = 300;
    const d = hapticTuneDiff(HAPTICS_DEFAULTS, s);
    expect(d).toEqual({
      compile: { floor: 0.2 },
      rumble: { tapBase: 60 },
      plugin: { gamma: 0.8 },
      budget: { onMs: 300 },
    });
    expect(countHapticChanges(d)).toBe(4);
  });

  it('turns back into the defaults when run the other way', () => {
    const s = live();
    s.cues['bonk']!.priority = 1;
    s.compile.period = 30;
    const undo = hapticTuneDiff(s, HAPTICS_DEFAULTS);
    expect(undo.compile).toEqual({ period: 20 });
    expect(undo.cues?.['bonk']?.priority).toBe(3);
  });

  it('prints as two-space indented JSON in the shape debugHapticsTune takes', () => {
    const s = live();
    s.compile.floor = 0.2;
    expect(hapticTuneJson(hapticTuneDiff(HAPTICS_DEFAULTS, s))).toBe(
      '{\n  "compile": {\n    "floor": 0.2\n  }\n}',
    );
  });

  it('round-trips through the runtime: a diff applied to a fresh game gives the tuned state back', () => {
    const target = live();
    // A new pattern and policy for one cue, a priority for another, and constants.
    const whoa = target.cues['whoa']!;
    const drafts = draftsOf(whoa.pattern);
    drafts[0] = { ...drafts[0]!, start: 0.6 };
    drafts.push({
      kind: 'hum',
      at: 200,
      duration: 80,
      start: 0.5,
      peak: 0.8,
      end: 0.1,
      sharpness: 0.3,
    });
    whoa.pattern = patternOf(drafts, whoa.pattern);
    whoa.policy = { coalesce: 90 };
    target.cues['bonk']!.priority = 2;
    target.cues['bonk']!.cooldownMs = 120;
    target.compile.floor = 0.2;
    target.rumble.slice = 60;
    target.plugin.gain = 1.6;
    target.budget.onMs = 300;

    const json = hapticTuneJson(hapticTuneDiff(HAPTICS_DEFAULTS, target));
    const game = new GameHaptics(FIZZ_HAPTICS, { now: () => 0 });
    game.setBackends({
      device: fakeBackend(),
      controller: fakeBackend({ target: 'controller' }),
    });
    const r = game.tune(JSON.parse(json));
    expect(r.refused).toEqual([]);

    const got: HapticsLabState = { cues: game.cues(), ...game.tuning() };
    expect(hapticTuneDiff(target, got)).toEqual({});
    expect(hapticTuneDiff(got, target)).toEqual({});
    expect(got.cues['whoa']?.pattern.events).toHaveLength(3);
    expect(got.compile.floor).toBe(0.2);
    expect(got.rumble.slice).toBe(60);
    expect(got.plugin.gain).toBe(1.6);
    expect(got.budget.onMs).toBe(300);
  });
});
