// Tests for GameHaptics with a fake backend and a fake clock.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBackend, noneBackend, type FakeBackend } from './haptic-backends';
import type { HapticCue, HapticTable } from './haptic-pattern';
import { GameHaptics, onScreen } from './haptics';

const cue = (over: Partial<HapticCue> = {}): HapticCue => ({
  pattern: { events: [{ kind: 'transient', at: 0, intensity: 0.7, sharpness: 0.2 }] },
  priority: 1,
  cooldownMs: 100,
  policy: 'interrupt',
  lane: 'game',
  ...over,
});

const table: HapticTable = {
  cues: {
    light: cue({ priority: 1 }),
    heavy: cue({ priority: 4, cooldownMs: 300 }),
    menu: cue({ priority: 0, cooldownMs: 40, lane: 'ui' }),
    'ui.select': cue({ priority: 1, cooldownMs: 0, lane: 'ui' }),
  },
  captions: { 'light!': 'light', quiet: null },
};

let t: number;
let fake: FakeBackend;
let h: GameHaptics;
const frame = (ms = 16): void => {
  t += ms;
  h.flush();
};

beforeEach(() => {
  t = 1000;
  fake = fakeBackend();
  h = new GameHaptics(table, { now: () => t });
  h.setBackend(fake);
  h.setGameplay(true);
});

describe('GameHaptics', () => {
  it('plays a cue at the next flush, not before', () => {
    h.cue('light');
    expect(fake.plays).toHaveLength(0);
    h.flush();
    expect(fake.plays).toHaveLength(1);
    expect(fake.plays[0]?.compiled).toEqual([21]);
  });

  it('scales by the cue scale and the master strength', () => {
    h.setScale(0.5);
    h.cue('light', 1.5);
    h.flush();
    expect(fake.plays[0]?.scale).toBeCloseTo(0.75);
  });

  it('plays nothing at a master of 0', () => {
    h.setScale(0);
    h.cue('light');
    h.flush();
    expect(fake.plays).toHaveLength(0);
  });

  it('applies the cooldown', () => {
    h.cue('light');
    frame();
    h.cue('light');
    frame();
    expect(fake.plays).toHaveLength(1);
    t += 100;
    h.cue('light');
    h.flush();
    expect(fake.plays).toHaveLength(2);
  });

  it('plays one cue a frame and the strongest wins', () => {
    h.cue('light');
    h.cue('heavy');
    h.cue('menu');
    h.flush();
    expect(fake.plays).toHaveLength(1);
    expect(h.report().plays.map((p) => p.cue)).toEqual(['heavy']);
  });

  it('merges the same cue raised twice in a frame', () => {
    h.cue('light', 1);
    h.cue('light', 1.3);
    h.flush();
    expect(fake.plays).toHaveLength(1);
    expect(fake.plays[0]?.scale).toBeCloseTo(1.3);
  });

  it('keeps the game lane closed outside a level', () => {
    h.setGameplay(false);
    h.cue('light');
    h.flush();
    expect(fake.plays).toHaveLength(0);
    h.cue('menu');
    h.flush();
    expect(fake.plays).toHaveLength(1);
  });

  it('closing the game lane stops the pattern and forgets waiting game cues', () => {
    h.cue('light');
    h.setGameplay(false);
    h.flush();
    expect(fake.plays).toHaveLength(0);
    expect(fake.stops).toBe(1);
  });

  it('stops and forgets everything while hidden, and plays again when visible', () => {
    h.cue('light');
    h.setActive(false);
    expect(fake.stops).toBe(1);
    h.cue('menu');
    h.flush();
    expect(fake.plays).toHaveLength(0);
    h.setActive(true);
    h.cue('menu');
    h.flush();
    expect(fake.plays).toHaveLength(1);
  });

  it('maps captions and ignores silent or unknown ones', () => {
    h.caption('light!');
    h.caption('quiet');
    h.caption('never heard of it');
    h.flush();
    expect(h.report().plays.map((p) => p.cue)).toEqual(['light']);
  });

  it('raises menu cues through ui()', () => {
    h.ui('select');
    h.flush();
    expect(h.report().plays.map((p) => p.cue)).toEqual(['ui.select']);
  });

  it('ignores unknown cue ids', () => {
    h.cue('nope');
    h.flush();
    expect(fake.plays).toHaveLength(0);
  });

  it('never throws on an unavailable or no-op backend', () => {
    h.setBackend(fakeBackend({ available: false }));
    h.cue('light');
    expect(() => h.flush()).not.toThrow();
    expect(h.report().plays[0]).toMatchObject({ ok: false });
    h.setBackend(noneBackend);
    h.cue('heavy');
    expect(() => h.flush()).not.toThrow();
  });

  it('keeps only the last 20 plays in the report', () => {
    for (let i = 0; i < 30; i++) {
      h.cue('menu');
      frame(50);
    }
    expect(h.report().plays).toHaveLength(20);
    expect(h.report().caps.id).toBe('fake');
  });

  it('dispose stops the backend', () => {
    h.dispose();
    expect(fake.stops).toBe(1);
  });
});

// Pattern lengths: a tap compiles to a few ms, a hum to its duration.
const hum = (ms: number): HapticCue['pattern'] => ({
  events: [{ kind: 'continuous', at: 0, duration: ms, intensity: 1, sharpness: 0.5 }],
});

describe('GameHaptics policies', () => {
  const pol: HapticTable = {
    cues: {
      long: cue({ pattern: hum(200), priority: 2, cooldownMs: 0 }),
      tapI: cue({ priority: 2, cooldownMs: 0, policy: 'interrupt' }),
      tapLow: cue({ priority: 1, cooldownMs: 0, policy: 'interrupt' }),
      tapD: cue({ priority: 2, cooldownMs: 0, policy: 'drop-if-busy' }),
      tapQ: cue({ priority: 2, cooldownMs: 0, policy: 'queue' }),
      big: cue({ pattern: hum(300), priority: 4, cooldownMs: 0, policy: 'interrupt' }),
      bigger: cue({ pattern: hum(400), priority: 4, cooldownMs: 0, policy: 'interrupt' }),
      snack: cue({ priority: 1, cooldownMs: 0, policy: { coalesce: 60 } }),
      bump: cue({ priority: 1, cooldownMs: 0, policy: 'interrupt', world: true }),
      soft: cue({ pattern: hum(400), priority: 1, cooldownMs: 0, calm: true }),
      spam: cue({ pattern: hum(150), priority: 1, cooldownMs: 0 }),
    },
    captions: { 'bump!': 'bump' },
  };
  const plays = (): string[] => h.report().plays.map((p) => p.cue);
  beforeEach(() => {
    h = new GameHaptics(pol, { now: () => t });
    h.setBackend(fake);
    h.setGameplay(true);
  });

  it('an interrupt replaces a running pattern of the same or lower priority', () => {
    h.cue('long');
    frame();
    h.cue('tapI');
    frame();
    expect(plays()).toEqual(['long', 'tapI']);
  });

  it('never cuts off a higher priority that is still running', () => {
    h.cue('long');
    frame();
    h.cue('tapLow');
    frame();
    expect(plays()).toEqual(['long']);
    expect(h.report().dropped['busy']).toBe(1);
    t += 300;
    h.cue('tapLow');
    h.flush();
    expect(plays()).toEqual(['long', 'tapLow']);
  });

  it('drop-if-busy is skipped while anything plays', () => {
    h.cue('long');
    frame();
    h.cue('tapD');
    frame();
    expect(plays()).toEqual(['long']);
  });

  it('a queued cue waits when the running pattern ends within 250 ms and then plays', () => {
    h.cue('long');
    h.flush();
    t += 100;
    h.cue('tapQ');
    h.flush();
    expect(plays()).toEqual(['long']);
    t += 50;
    h.flush();
    expect(plays()).toEqual(['long']);
    t += 100;
    h.flush();
    expect(plays()).toEqual(['long', 'tapQ']);
  });

  it('a queued cue is dropped when the wait is longer than 250 ms', () => {
    h.cue('big');
    h.flush();
    t += 10;
    h.cue('tapQ');
    h.flush();
    t += 400;
    h.flush();
    expect(plays()).toEqual(['big']);
  });

  it('a queued cue is dropped if something interrupts and the wait grows', () => {
    h.cue('long');
    h.flush();
    t += 100;
    h.cue('tapQ');
    h.flush();
    h.cue('big');
    t += 16;
    h.flush();
    t += 400;
    h.flush();
    expect(plays()).toEqual(['long', 'big']);
  });

  it('between equal priorities the longer pattern wins the frame', () => {
    h.cue('big');
    h.cue('bigger');
    h.flush();
    expect(plays()).toEqual(['bigger']);
  });

  it('folds repeats of a coalesce cue in one frame into one stronger play', () => {
    for (let i = 0; i < 5; i++) h.cue('snack');
    h.flush();
    expect(fake.plays).toHaveLength(1);
    expect(fake.plays[0]?.scale).toBeCloseTo(1.3);
  });

  it('absorbs repeats of a coalesce cue inside its window', () => {
    h.cue('snack');
    h.flush();
    t += 30;
    h.cue('snack');
    h.flush();
    expect(fake.plays).toHaveLength(1);
    t += 40;
    h.cue('snack');
    h.flush();
    expect(fake.plays).toHaveLength(2);
  });

  it('feels a world cue only when it is on screen', () => {
    h.caption('bump!', false);
    h.flush();
    expect(fake.plays).toHaveLength(0);
    h.caption('bump!', true);
    h.flush();
    expect(fake.plays).toHaveLength(1);
  });

  it('keeps calm cues short and soft', () => {
    h.cue('soft');
    h.flush();
    h.setCalm(true);
    t += 1000;
    h.cue('soft');
    h.flush();
    const [loud, calm] = fake.plays;
    expect(calm?.scale).toBeCloseTo(0.7);
    expect((calm?.compiled ?? []).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(150);
    expect((loud?.compiled ?? []).reduce((a, b) => a + b, 0)).toBeGreaterThan(300);
  });

  it('holds back small cues once the second budget is spent, but never priority 4', () => {
    // Each spam is 150 ms on; 3 of them (450 ms) pass the 400 ms check in the 4th frame.
    for (let i = 0; i < 4; i++) {
      h.cue('spam');
      frame(160);
    }
    expect(plays()).toEqual(['spam', 'spam', 'spam']);
    expect(h.report().dropped['budget']).toBe(1);
    h.cue('big');
    frame(160);
    expect(plays().at(-1)).toBe('big');
    t += 1000;
    h.cue('spam');
    h.flush();
    expect(plays().at(-1)).toBe('spam');
    expect(h.report().spentMs).toBe(150);
  });

  it('never calls the backend twice in a frame', () => {
    for (const id of ['long', 'tapI', 'tapLow', 'tapD', 'big', 'snack']) h.cue(id);
    h.flush();
    expect(fake.plays).toHaveLength(1);
  });

  it('hiding forgets queued cues', () => {
    h.cue('long');
    h.flush();
    t += 100;
    h.cue('tapQ');
    h.flush();
    h.setActive(false);
    h.setActive(true);
    t += 500;
    h.flush();
    expect(plays()).toEqual(['long']);
  });
});

describe('GameHaptics.tune', () => {
  it('replaces events and limits, and the change plays', () => {
    const r = h.tune({
      cues: {
        light: {
          events: [{ kind: 'transient', at: 0, intensity: 1, sharpness: 0 }],
          cooldownMs: 10,
          priority: 3,
          policy: { coalesce: 100 },
        },
      },
    });
    expect(r.refused).toEqual([]);
    expect(r.applied).toContain('cues.light.events');
    h.cue('light');
    h.flush();
    expect(fake.plays[0]?.compiled).toEqual([28]);
  });

  it('refuses what does not check out and applies the rest', () => {
    const r = h.tune({
      cues: {
        nope: { cooldownMs: 1 },
        light: { events: [{ kind: 'transient', at: 0, intensity: 9, sharpness: 0 }], priority: 2 },
      },
      compile: { floor: 0.3, period: 1, bogus: 1 } as never,
      budget: { onMs: 200, windowMs: 5 },
    });
    expect(r.applied.sort()).toEqual(['budget.onMs', 'compile.floor', 'cues.light.priority']);
    expect(r.refused.sort()).toEqual([
      'budget.windowMs',
      'compile.bogus',
      'compile.period',
      'cues.light.events',
      'cues.nope (unknown cue)',
    ]);
    expect(fake.tuned).toEqual([{ floor: 0.3 }]);
  });

  it('does not change the table it was built from', () => {
    h.tune({ cues: { light: { cooldownMs: 1 } } });
    expect(table.cues['light']?.cooldownMs).toBe(100);
  });

  it('survives a nonsense patch', () => {
    expect(h.tune(null)).toEqual({ applied: [], refused: [] });
    expect(h.tune(42)).toEqual({ applied: [], refused: [] });
  });
});

describe('onScreen', () => {
  it('is true inside the view and a little beyond', () => {
    const cam = { x: 10, y: 5 };
    expect(onScreen(10, 5, cam, 10, 6.5)).toBe(true);
    expect(onScreen(20.4, 5, cam, 10, 6.5)).toBe(true);
    expect(onScreen(21, 5, cam, 10, 6.5)).toBe(false);
    expect(onScreen(10, -3, cam, 10, 6.5)).toBe(false);
  });
});
