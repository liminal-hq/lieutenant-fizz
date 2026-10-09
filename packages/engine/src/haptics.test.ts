// Tests for GameHaptics with a fake backend and a fake clock.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBackend, noneBackend, type FakeBackend } from './haptic-backends';
import type { HapticCue, HapticTable } from './haptic-pattern';
import { GameHaptics } from './haptics';

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
