// Tests for GameHaptics with a fake backend and a fake clock.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBackend, noneBackend, type FakeBackend } from './haptic-backends';
import { RUMBLE_BOOST, RUMBLE_COMPILE, VIBRATE_COMPILE } from './haptic-pattern';
import { PLUGIN_COMPILE } from './haptic-plugin-compile';
import type { HapticCue, HapticTable } from './haptic-pattern';
import { ATTRACT_SCALE, GameHaptics, UI_BOOST, onScreen, routeFor } from './haptics';

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
    'ui.move': cue({ priority: 0, cooldownMs: 0, policy: 'drop-if-busy', lane: 'ui' }),
    rock: cue({ priority: 4, cooldownMs: 100, world: true }),
    pebble: cue({ priority: 1, cooldownMs: 0, world: true, policy: 'drop-if-busy' }),
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
  h.setBackends({ device: fake });
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

  it('plays menu cues boosted, following the Strength setting, and silent at Off', () => {
    h.setScale(0.5);
    h.ui('select');
    h.flush();
    expect(fake.plays[0]?.scale).toBeCloseTo(0.5 * UI_BOOST);
    h.setScale(0);
    t += 500;
    h.ui('select');
    h.flush();
    expect(fake.plays).toHaveLength(1);
  });

  describe('menu cues with a controller', () => {
    it('stay on the phone when it can play, whatever the route', () => {
      const pad = fakeBackend({ target: 'controller' });
      h.setBackends({ controller: pad });
      h.setRoute('controller');
      h.ui('select');
      h.flush();
      expect(fake.plays).toHaveLength(1);
      expect(pad.plays).toHaveLength(0);
    });

    it('go to the controller, boosted, when the phone cannot play and a pad is in use', () => {
      const pad = fakeBackend({ target: 'controller' });
      h.setBackends({ device: fakeBackend({ available: false }), controller: pad });
      h.setRoute('controller');
      h.setScale(0, 0.5);
      h.ui('select');
      h.flush();
      expect(pad.plays).toHaveLength(1);
      expect(pad.plays[0]?.scale).toBeCloseTo(0.5 * UI_BOOST);
    });

    it('are dropped when the phone cannot play and no pad is in use', () => {
      const pad = fakeBackend({ target: 'controller' });
      h.setBackends({ device: fakeBackend({ available: false }), controller: pad });
      for (const route of ['device', 'none'] as const) {
        h.setRoute(route);
        t += 500;
        h.ui('select');
        h.flush();
      }
      expect(pad.plays).toHaveLength(0);
    });

    it('follow the controller strength, so Off keeps them silent', () => {
      const pad = fakeBackend({ target: 'controller' });
      h.setBackends({ device: fakeBackend({ available: false }), controller: pad });
      h.setRoute('controller');
      h.setScale(1, 0);
      h.ui('select');
      h.flush();
      expect(pad.plays).toHaveLength(0);
    });
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
    h.setBackends({ device: fakeBackend({ available: false }) });
    h.cue('light');
    expect(() => h.flush()).not.toThrow();
    expect(h.report().plays[0]).toMatchObject({ ok: false });
    h.setBackends({ device: noneBackend });
    h.cue('heavy');
    expect(() => h.flush()).not.toThrow();
  });

  it('keeps only the last 20 plays in the report', () => {
    for (let i = 0; i < 30; i++) {
      h.cue('menu');
      frame(50);
    }
    expect(h.report().plays).toHaveLength(20);
    expect(h.report().caps.device.id).toBe('fake');
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
    h.setBackends({ device: fake });
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

describe('GameHaptics routing', () => {
  let pad: FakeBackend;
  beforeEach(() => {
    pad = fakeBackend({ target: 'controller' });
    h.setBackends({ controller: pad });
  });

  it('sends gameplay cues to the phone by default', () => {
    h.cue('light');
    h.flush();
    expect(fake.plays).toHaveLength(1);
    expect(pad.plays).toHaveLength(0);
    expect(h.report().plays[0]?.target).toBe('device');
  });

  it('sends gameplay cues to the controller when that is the route, and menu cues stay on the phone', () => {
    h.setRoute('controller');
    h.cue('light');
    h.cue('menu');
    h.flush();
    expect(pad.plays).toHaveLength(1);
    expect(fake.plays).toHaveLength(1);
    expect(
      h
        .report()
        .plays.map((p) => [p.cue, p.target])
        .sort(),
    ).toEqual([
      ['light', 'controller'],
      ['menu', 'device'],
    ]);
  });

  it('plays nothing for gameplay on the none route, but still the menus', () => {
    h.setRoute('none');
    h.cue('light');
    h.flush();
    expect(fake.plays.length + pad.plays.length).toBe(0);
    h.cue('menu');
    h.flush();
    expect(fake.plays).toHaveLength(1);
  });

  it('drops gameplay cues when the controller cannot rumble, rather than buzzing the phone', () => {
    h.setBackends({ controller: fakeBackend({ available: false, target: 'controller' }) });
    h.setRoute('controller');
    h.cue('light');
    h.flush();
    expect(fake.plays).toHaveLength(0);
    expect(h.report().plays[0]).toMatchObject({ ok: false, target: 'controller' });
  });

  it('stops whatever runs when the route changes', () => {
    h.setRoute('controller');
    expect(fake.stops).toBe(1);
    expect(pad.stops).toBe(1);
    h.setRoute('controller');
    expect(pad.stops).toBe(1);
  });

  it('scales each target on its own', () => {
    h.setScale(0.5, 1);
    h.setRoute('controller');
    h.cue('light');
    h.cue('menu');
    h.flush();
    expect(pad.plays[0]?.scale).toBe(1);
    expect(fake.plays[0]?.scale).toBe(0.5 * UI_BOOST);
    h.setScale(1, 0);
    t += 1000;
    h.cue('light');
    h.flush();
    expect(pad.plays).toHaveLength(1);
  });

  it('keeps a cue running on one target from blocking the other', () => {
    h.setRoute('controller');
    h.cue('heavy');
    h.cue('menu');
    h.flush();
    expect(pad.plays).toHaveLength(1);
    expect(fake.plays).toHaveLength(1);
  });

  it('does not hold the controller to the phone budget', () => {
    h.setBackends({ controller: fakeBackend({ target: 'controller' }) });
    const p2 = fakeBackend({ target: 'controller' });
    h.setBackends({ controller: p2 });
    h.setRoute('controller');
    for (let i = 0; i < 8; i++) {
      h.cue('light');
      frame(120);
    }
    expect(p2.plays).toHaveLength(8);
    expect(h.report().spentMs).toBe(0);
  });

  it('stops both targets when the page hides or the game lane closes', () => {
    h.setActive(false);
    expect([fake.stops, pad.stops]).toEqual([1, 1]);
    h.setActive(true);
    h.setGameplay(false);
    expect([fake.stops, pad.stops]).toEqual([2, 2]);
  });

  it('reports both backends', () => {
    const r = h.report();
    expect(r.caps.device.id).toBe('fake');
    expect(r.caps.controller.target).toBe('controller');
    expect(r.route).toBe('device');
  });

  it('maps the input device to a route', () => {
    expect(routeFor('gamepad')).toBe('controller');
    expect(routeFor('touch')).toBe('device');
    expect(routeFor('keyboard')).toBe('device');
  });
});

describe('GameHaptics.preview', () => {
  let pad: FakeBackend;
  beforeEach(() => {
    pad = fakeBackend({ target: 'controller' });
    h.setBackends({ controller: pad });
  });

  it('plays a game cue at once on the target, outside a level and without a flush', () => {
    h.setGameplay(false);
    expect(h.preview('light', 'device')).toBe(true);
    expect(fake.plays).toHaveLength(1);
    expect(pad.plays).toHaveLength(0);
    expect(h.preview('heavy', 'controller')).toBe(true);
    expect(pad.plays).toHaveLength(1);
  });

  it('plays at the strength of the target it is sent to', () => {
    h.setScale(0.5, 0.75);
    h.preview('light', 'device');
    h.preview('light', 'controller');
    expect(fake.plays[0]?.scale).toBe(0.5);
    expect(pad.plays[0]?.scale).toBe(0.75);
  });

  it('plays nothing at a strength of Off, for an unknown cue or while the page is hidden', () => {
    h.setScale(0, 1);
    expect(h.preview('light', 'device')).toBe(false);
    expect(h.preview('light', 'controller')).toBe(true);
    expect(h.preview('nope', 'controller')).toBe(false);
    h.setActive(false);
    expect(h.preview('light', 'controller')).toBe(false);
    expect(fake.plays).toHaveLength(0);
    expect(pad.plays).toHaveLength(1);
  });

  it('ignores the cooldown, so every step of a held key is felt, and shows in the report', () => {
    h.preview('light', 'device');
    h.preview('light', 'device');
    expect(fake.plays).toHaveLength(2);
    expect(h.report().plays.map((p) => p.cue)).toEqual(['light', 'light']);
  });
});

describe('GameHaptics.audition', () => {
  let pad: FakeBackend;
  const tap = {
    events: [{ kind: 'transient' as const, at: 0, intensity: 0.7, sharpness: 0.2 }],
  };
  beforeEach(() => {
    pad = fakeBackend({ target: 'controller' });
    h.setBackends({ controller: pad });
  });

  it('plays at once on the target it is given, whatever the lane, route, strength and cooldown', () => {
    h.setGameplay(false);
    h.setRoute('none');
    h.setScale(0, 0);
    expect(h.audition(tap, 'device', 1.5)?.ok).toBe(true);
    expect(h.audition(tap, 'device', 1.5)?.ok).toBe(true);
    expect(h.audition(tap, 'controller')?.ok).toBe(true);
    expect(fake.plays.map((p) => p.scale)).toEqual([1.5, 1.5]);
    expect(pad.plays).toHaveLength(1);
  });

  it('plays nothing while the page is hidden', () => {
    h.setActive(false);
    expect(h.audition(tap, 'device')).toBeNull();
    expect(fake.plays).toHaveLength(0);
  });

  it('shows in the report as an audition with what it compiled to', () => {
    h.audition(tap, 'device', 1);
    expect(h.report().plays[0]).toMatchObject({
      cue: 'audition',
      target: 'device',
      ok: true,
      compiled: [21],
    });
  });

  it('reports a target that cannot play without throwing', () => {
    h.setBackends({ controller: fakeBackend({ available: false, target: 'controller' }) });
    expect(h.audition(tap, 'controller')).toMatchObject({ ok: false });
  });
});

describe('GameHaptics.cues and tuning', () => {
  it('gives a copy of the cues, tuning included, that cannot change the live table', () => {
    h.tune({ cues: { light: { cooldownMs: 7 } } });
    const c = h.cues();
    expect(c['light']?.cooldownMs).toBe(7);
    c['light']!.cooldownMs = 999;
    expect(h.cues()['light']?.cooldownMs).toBe(7);
  });

  it('gives the compiler constants and budget as tuned', () => {
    expect(h.tuning()).toEqual({
      compile: VIBRATE_COMPILE,
      rumble: RUMBLE_COMPILE,
      boost: RUMBLE_BOOST,
      plugin: PLUGIN_COMPILE,
      budget: { onMs: 400, windowMs: 1000 },
    });
    h.tune({ compile: { floor: 0.3 }, budget: { onMs: 250 } });
    expect(h.tuning().compile.floor).toBe(0.3);
    expect(h.tuning().budget.onMs).toBe(250);
  });

  it('tunes the plugin compiler through a backend that has one, and refuses it otherwise', () => {
    h.setBackends({ device: noneBackend });
    expect(h.tune({ plugin: { gamma: 0.8 } })).toEqual({ applied: [], refused: ['plugin.gamma'] });
    const dev = fakeBackend();
    h.setBackends({ device: dev });
    const r = h.tune({ plugin: { gamma: 0.8, gain: 9, bogus: 1 } as never });
    expect(r.applied).toEqual(['plugin.gamma']);
    expect(r.refused.sort()).toEqual(['plugin.bogus', 'plugin.gain']);
    expect(dev.tunedPlugin).toEqual([{ gamma: 0.8 }]);
    expect(h.tuning().plugin.gamma).toBe(0.8);
  });

  it('tunes the rumble boost through the controller backend and refuses it without one', () => {
    expect(h.tune({ boost: { minMs: 100 } })).toEqual({ applied: [], refused: ['boost.minMs'] });
    const pad = fakeBackend({ target: 'controller' });
    h.setBackends({ controller: pad });
    expect(h.controllerBoost()).toBe(true);
    const r = h.tune({ boost: { minMs: 100, heavyFloor: 2, bogus: 1 } as never });
    expect(r.applied).toEqual(['boost.minMs']);
    expect(r.refused.sort()).toEqual(['boost.bogus', 'boost.heavyFloor']);
    expect(pad.tunedBoost).toEqual([{ minMs: 100 }]);
    expect(h.tuning().boost.minMs).toBe(100);
  });

  it('tunes the rumble compiler through the controller backend and refuses it without one', () => {
    expect(h.tune({ rumble: { tapBase: 60 } })).toEqual({
      applied: [],
      refused: ['rumble.tapBase'],
    });
    const pad = fakeBackend({ target: 'controller' });
    h.setBackends({ controller: pad });
    const r = h.tune({ rumble: { tapBase: 60, slice: 5, bogus: 1 } as never });
    expect(r.applied).toEqual(['rumble.tapBase']);
    expect(r.refused.sort()).toEqual(['rumble.bogus', 'rumble.slice']);
    expect(pad.tunedRumble).toEqual([{ tapBase: 60 }]);
    expect(h.tuning().rumble.tapBase).toBe(60);
  });
});

describe('the title attract loop', () => {
  beforeEach(() => {
    h.setGameplay(false);
    h.setAttract(true);
  });

  it('plays an on-screen world cue at the named fraction, and nothing else the loop raises', () => {
    h.cue('rock', 1, true);
    h.cue('light');
    h.flush();
    expect(fake.plays).toHaveLength(1);
    expect(fake.plays[0]?.scale).toBeCloseTo(ATTRACT_SCALE);
    expect(ATTRACT_SCALE).toBe(0.6);
  });

  it('ignores a world cue that is off screen', () => {
    h.cue('rock', 1, false);
    h.flush();
    expect(fake.plays).toHaveLength(0);
  });

  it('plays nothing with a sub-screen open or the page hidden, and stops what runs', () => {
    h.cue('rock');
    h.flush();
    const stops = fake.stops;
    h.setAttract(false);
    expect(fake.stops).toBeGreaterThan(stops);
    t += 500;
    h.cue('rock');
    h.flush();
    expect(fake.plays).toHaveLength(1);
    h.setAttract(true);
    h.setActive(false);
    h.cue('rock');
    h.setActive(true);
    h.flush();
    expect(fake.plays).toHaveLength(1);
  });

  it('is silent at Strength Off', () => {
    h.setScale(0);
    h.cue('rock');
    h.flush();
    expect(fake.plays).toHaveLength(0);
  });

  it('lets a menu cue win the frame and never doubles up with it', () => {
    h.cue('rock');
    h.ui('select');
    h.flush();
    expect(h.report().plays.map((p) => p.cue)).toEqual(['ui.select']);
  });

  it('lets a menu cue play over running ambience, even a drop-if-busy one', () => {
    h.cue('pebble');
    h.flush();
    t += 16;
    h.ui('move');
    h.flush();
    expect(h.report().plays.map((p) => p.cue)).toEqual(['pebble', 'ui.move']);
  });

  it('never cuts off a menu cue that is running, whatever its priority', () => {
    h.ui('select');
    h.flush();
    t += 16;
    h.cue('rock');
    h.flush();
    expect(h.report().plays.map((p) => p.cue)).toEqual(['ui.select']);
  });

  it('gives the level its full strength once play starts', () => {
    h.cue('rock');
    h.setGameplay(true);
    h.flush();
    expect(fake.plays).toHaveLength(0);
    h.cue('rock');
    h.flush();
    expect(fake.plays[0]?.scale).toBe(1);
  });
});
