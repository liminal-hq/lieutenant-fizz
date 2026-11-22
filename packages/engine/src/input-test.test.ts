// Tests for the Input test model: action names, log lines, the ring, fades, hold-to-leave, the generic pad fallback, sampling counters and the report.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { DEFAULT_PAD_BINDINGS } from './gamepad-bindings';
import {
  FADE_MS,
  HoldToLeave,
  LEAVE_HOLD_MS,
  LitTracker,
  PadTracker,
  Ring,
  SamplingProbe,
  gameSeen,
  padButtonBits,
  TouchProbe,
  axisZone,
  backHeld,
  bitNames,
  browserOf,
  keyActions,
  layoutNote,
  logLine,
  mappingReport,
  padAxisActions,
  padButtonActions,
  padRows,
  reportText,
  samplingLines,
  stamp,
  type DescribeContext,
  type PadSample,
  type PadSnap,
} from './input-test';
import { placeControls } from './touch-layout';

const ctx: DescribeContext = {
  bindings: DEFAULT_PAD_BINDINGS,
  pad: () => ({ family: 'xbox', standard: true }),
  layout: 0,
};

const snap = (over: Partial<PadSnap> = {}): PadSnap => ({
  index: 0,
  id: 'Test Pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)',
  mapping: 'standard',
  connected: true,
  timestamp: 1,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
  ...over,
});

const withButton = (n: number, on = true): PadSnap['buttons'] =>
  snap().buttons.map((b, i) => (i === n ? { pressed: on, value: on ? 1 : 0 } : b));

describe('action names', () => {
  it('names the bits of a word', () => {
    expect(bitNames(1 | 16 | 64)).toEqual(['Left', 'Jump', 'Fizz']);
  });

  it('maps keys through the game functions, in the chosen layout', () => {
    // Modern is the default; the layout is an index into the key schemes.
    expect(keyActions('KeyZ')).toEqual(['Jump']);
    expect(keyActions('ControlLeft', '', 0)).toEqual(['Jump']);
    expect(keyActions('Space', '', 0)).toEqual(['Fizz']);
    expect(keyActions('Space', '', 2)).toEqual(['Jump']);
    expect(keyActions('KeyJ', '', 2)).toEqual(['Fizz']);
    expect(keyActions('Comma', '', 5)).toEqual(['Jump']);
    expect(keyActions('Space')).toEqual(['Fizz']);
    expect(keyActions('Space', '', 5)).toEqual([]);
    expect(keyActions('ArrowUp')).toEqual(['Up']);
    expect(keyActions('Escape')).toEqual(['Pause']);
    expect(keyActions('KeyP')).toEqual(['Pause']);
    expect(keyActions('Enter')).toEqual(['Confirm']);
    expect(keyActions('KeyF')).toEqual(['Fullscreen']);
    expect(keyActions('F5')).toEqual(['Quick save']);
    expect(keyActions('Equal')).toEqual(['Zoom in']);
    expect(keyActions('KeyQ')).toEqual([]);
    expect(keyActions('KeyQ', '', 4)).toEqual(['Pogo']);
  });

  it('notes an action key of another layout, which does nothing in the chosen one', () => {
    expect(layoutNote('KeyZ', 0)).toBe('Not in Keen-style');
    expect(layoutNote('KeyZ', 1)).toBe('');
    expect(layoutNote('ControlLeft', 1)).toBe('Not in Modern');
    expect(layoutNote('Comma', 4)).toBe('Not in Left hand');
    expect(layoutNote('Comma', 5)).toBe('');
    expect(layoutNote('ArrowUp', 1)).toBe('');
    expect(layoutNote('KeyF', 1)).toBe('');
  });

  it('maps pad buttons and axes through the current bindings', () => {
    expect(padButtonActions(0, DEFAULT_PAD_BINDINGS)).toEqual(['Jump']);
    expect(padButtonActions(1, DEFAULT_PAD_BINDINGS)).toEqual(['Pogo']);
    expect(padButtonActions(9, DEFAULT_PAD_BINDINGS)).toEqual(['Pause']);
    expect(padButtonActions(14, DEFAULT_PAD_BINDINGS)).toEqual(['Left']);
    expect(padButtonActions(16, DEFAULT_PAD_BINDINGS)).toEqual([]);
    const swapped = { ...DEFAULT_PAD_BINDINGS, jump: [1], pogo: [0] };
    expect(padButtonActions(0, swapped)).toEqual(['Pogo']);
    expect(padAxisActions(0, -0.7)).toEqual(['Left']);
    expect(padAxisActions(1, 0.7)).toEqual(['Down']);
    expect(padAxisActions(2, 0.9)).toEqual([]);
  });

  it('zones an axis where the game acts', () => {
    expect(axisZone(0, -0.41)).toBe(-1);
    expect(axisZone(0, 0.39)).toBe(0);
    expect(axisZone(1, 0.49)).toBe(0);
    expect(axisZone(1, 0.51)).toBe(1);
  });
});

describe('log lines', () => {
  it('stamps minutes, seconds and tenths', () => {
    expect(stamp(3250)).toBe('+  0:03.2');
    expect(stamp(65_000)).toBe('+  1:05.0');
  });

  it('writes a pad button, a key, an axis, touch and mouse', () => {
    expect(logLine(3200, { kind: 'padButton', pad: 0, index: 0, down: true }, ctx)).toBe(
      '+  0:03.2  Pad 0  button 0 (A)  down  -> Jump',
    );
    expect(logLine(0, { kind: 'key', code: 'KeyQ', key: 'q', down: false }, ctx)).toBe(
      '+  0:00.0  Key  KeyQ  up  -> no action (Not in Keen-style)',
    );
    expect(logLine(0, { kind: 'key', code: 'KeyZ', key: 'z', down: true }, ctx)).toContain(
      '-> no action (Not in Keen-style)',
    );
    expect(
      logLine(0, { kind: 'key', code: 'ControlLeft', key: 'Control', down: true }, ctx),
    ).toContain('-> Jump');
    expect(logLine(0, { kind: 'padAxis', pad: 1, index: 0, value: -0.62 }, ctx)).toBe(
      '+  0:00.0  Pad 1  axis 0 (Left stick X)  -0.62  -> Left',
    );
    expect(
      logLine(
        0,
        {
          kind: 'touch',
          id: 2,
          phase: 'down',
          x: 214.4,
          y: 520,
          control: 'jump',
          actions: ['Jump'],
        },
        ctx,
      ),
    ).toBe('+  0:00.0  Touch 2  down  at 214,520  on jump  -> Jump');
    expect(logLine(0, { kind: 'mouse', button: 2, down: true, x: 4, y: 5 }, ctx)).toBe(
      '+  0:00.0  Mouse  button 2 (Right)  down  at 4,5  -> no action',
    );
    expect(logLine(0, { kind: 'wheel', dir: 'up' }, ctx)).toContain('-> Zoom in');
  });

  it('lists a non-standard pad by number alone', () => {
    const odd: DescribeContext = { ...ctx, pad: () => ({ family: 'generic', standard: false }) };
    expect(logLine(0, { kind: 'padButton', pad: 0, index: 3, down: true }, odd)).toContain(
      'button 3  down',
    );
  });
});

describe('Ring', () => {
  it('keeps the last items, most recent last', () => {
    const r = new Ring<number>(3);
    for (let i = 1; i <= 5; i++) r.push(i);
    expect(r.items).toEqual([3, 4, 5]);
    r.clear();
    expect(r.items).toEqual([]);
  });
});

describe('LitTracker', () => {
  it('holds at 1, fades after release, and never fades with reduced motion', () => {
    const t = new LitTracker();
    t.press('KeyA');
    expect(t.level('KeyA', 0)).toBe(1);
    t.release('KeyA', 100);
    expect(t.level('KeyA', 100 + FADE_MS / 2)).toBeCloseTo(0.5);
    expect(t.level('KeyA', 100 + FADE_MS + 1)).toBe(0);
    t.press('KeyB');
    t.release('KeyB', 0);
    expect(t.level('KeyB', 10, true)).toBe(0);
  });
});

describe('HoldToLeave', () => {
  it('leaves once after a full second, and not for a short press', () => {
    const h = new HoldToLeave();
    expect(h.update(0, true)).toEqual({ progress: 0, leave: false });
    expect(h.update(LEAVE_HOLD_MS / 2, true).progress).toBeCloseTo(0.5);
    expect(h.update(LEAVE_HOLD_MS - 1, true).leave).toBe(false);
    expect(h.update(LEAVE_HOLD_MS, true)).toEqual({ progress: 1, leave: true });
    expect(h.update(LEAVE_HOLD_MS + 50, true).leave).toBe(false);
    h.update(LEAVE_HOLD_MS + 60, false);
    const s = new HoldToLeave();
    s.update(0, true);
    expect(s.update(300, false)).toEqual({ progress: 0, leave: false });
    expect(s.update(2000, true).leave).toBe(false);
  });

  it('counts the Pogo buttons as Back', () => {
    expect(backHeld(snap({ buttons: withButton(1) }), DEFAULT_PAD_BINDINGS)).toBe(true);
    expect(backHeld(snap({ buttons: withButton(0) }), DEFAULT_PAD_BINDINGS)).toBe(false);
  });
});

describe('PadTracker', () => {
  it('reports connections, button edges and axis zones, and remembers the pad that moved', () => {
    const t = new PadTracker();
    expect(t.update([snap()])).toEqual([
      { kind: 'padConnect', pad: 0, id: snap().id, connected: true },
    ]);
    expect(t.update([snap({ buttons: withButton(0) })])).toEqual([
      { kind: 'padButton', pad: 0, index: 0, down: true },
    ]);
    expect(t.update([snap({ buttons: withButton(0), axes: [-0.2, 0, 0, 0] })])).toEqual([]);
    expect(t.update([snap({ buttons: withButton(0), axes: [-0.9, 0, 0, 0] })])).toEqual([
      { kind: 'padAxis', pad: 0, index: 0, value: -0.9 },
    ]);
    expect(t.lastMoved).toBe(0);
    expect(t.update([])).toEqual([{ kind: 'padConnect', pad: 0, id: snap().id, connected: false }]);
  });
});

describe('generic fallback', () => {
  it('lists every raw button and axis by number with the action each gives', () => {
    const odd = snap({
      mapping: '',
      buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: i === 2, value: i === 2 ? 1 : 0 })),
      axes: [0, 0, 0.6, 0, 0, 1],
    });
    const rows = padRows(odd, DEFAULT_PAD_BINDINGS, 'generic');
    expect(rows.buttons).toHaveLength(12);
    expect(rows.buttons[2]).toMatchObject({ label: 'button 2', pressed: true, action: 'Fizz' });
    expect(rows.axes).toHaveLength(6);
    expect(rows.axes[2]?.label).toBe('axis 2');
  });

  it('shows the default beside a remapped action', () => {
    const swapped = { ...DEFAULT_PAD_BINDINGS, jump: [1], pogo: [0] };
    const rows = padRows(snap(), swapped, 'xbox');
    expect(rows.buttons[0]?.action).toBe('Pogo (default Jump)');
  });
});

describe('TouchProbe', () => {
  const layout = placeControls(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }).hit;

  it('tells a landed touch from a miss, and names the action', () => {
    const p = new TouchProbe();
    p.setLayout(layout);
    const jump = layout.jump;
    const at = 'r' in jump ? { x: jump.cx, y: jump.cy } : { x: jump.x + 1, y: jump.y + 1 };
    const hit = p.press(1, at.x, at.y, 0);
    expect(hit.control).toBe('jump');
    expect(hit.actions).toEqual(['Jump']);
    const miss = p.press(2, 1, 1, 0);
    expect(miss.control).toBeNull();
    expect(miss.actions).toEqual([]);
    expect(p.down).toHaveLength(2);
    expect(bitNames(p.bits(1))).toEqual(['Jump']);
    p.lift(1);
    expect(p.down).toHaveLength(1);
  });

  it('gives a D-pad finger its direction', () => {
    const p = new TouchProbe();
    p.setLayout(layout);
    const d = layout.dpad;
    const f = p.press(3, d.cx + d.r * 0.8, d.cy, 0);
    expect(f.control).toBe('dpad');
    expect(f.actions).toEqual(['Right']);
    p.move(3, d.cx - d.r * 0.8, d.cy);
    expect(p.down[0]?.actions).toEqual(['Left']);
  });
});

describe('SamplingProbe', () => {
  const pad = (t: number, pressed: boolean[], timestamp = t): PadSample => ({
    index: 0,
    timestamp,
    pressed,
  });

  it('counts a press the game never saw, and its length', () => {
    const p = new SamplingProbe();
    p.tick(0, [pad(0, [false])]);
    p.fast(4, [pad(4, [false])]);
    p.fast(8, [pad(8, [true])]);
    p.fast(20, [pad(20, [false])]);
    p.tick(16, [pad(16, [false])]);
    const r = p.report(0, 30);
    expect(r.fastPresses).toBe(1);
    expect(r.tickSeen).toBe(0);
    expect(r.missed).toBe(1);
    expect(r.shortestMissedMs).toBe(12);
    expect(r.shortestMs).toBe(12);
  });

  it('counts a press both reads saw, once', () => {
    const p = new SamplingProbe();
    p.fast(0, [pad(0, [true])]);
    p.tick(5, [pad(5, [true])]);
    p.tick(21, [pad(21, [true])]);
    p.fast(40, [pad(40, [false])]);
    const r = p.report(0, 50);
    expect(r).toMatchObject({ fastPresses: 1, tickSeen: 1, missed: 0, shortestMissedMs: null });
    expect(r.shortestMs).toBe(40);
  });

  it('counts a press only the game saw as seen by both', () => {
    const p = new SamplingProbe();
    p.tick(0, [pad(0, [true])]);
    p.fast(4, [pad(4, [false])]);
    expect(p.report(0, 10)).toMatchObject({ fastPresses: 1, tickSeen: 1, missed: 0 });
  });

  it('reads the timestamp rate, and says when it stays at 0 or never moves', () => {
    const moving = new SamplingProbe();
    for (let t = 0; t <= 1000; t += 4)
      moving.fast(t, [pad(t, [false], 1000 + Math.floor(t / 8) * 8)]);
    const r = moving.report(0, 1000);
    expect(r.timestamp).toBe('changing');
    expect(r.updateHz).toBeGreaterThan(100);
    expect(r.updateHz).toBeLessThan(140);

    const zero = new SamplingProbe();
    for (let t = 0; t <= 100; t += 4) zero.fast(t, [pad(t, [false], 0)]);
    expect(zero.report(0, 100).timestamp).toBe('zero');

    const fixed = new SamplingProbe();
    for (let t = 0; t <= 100; t += 4) fixed.fast(t, [pad(t, [false], 77)]);
    expect(fixed.report(0, 100).timestamp).toBe('unchanged');
  });

  it('measures the game read interval and its jitter', () => {
    const p = new SamplingProbe();
    for (const t of [0, 16, 33, 50, 100]) p.tick(t, [pad(t, [false])]);
    const r = p.report(0, 100);
    expect(r.tick).toEqual({ n: 4, min: 16, median: 17, max: 50 });
  });

  it('resets the counters', () => {
    const p = new SamplingProbe();
    p.fast(0, [pad(0, [true])]);
    p.fast(5, [pad(5, [false])]);
    p.reset();
    expect(p.report(0, 10)).toMatchObject({ fastPresses: 0, missed: 0, shortestMs: null });
  });

  it('writes lines for the page', () => {
    const p = new SamplingProbe();
    const lines = samplingLines(p.report(0, 0));
    expect(lines.join('\n')).toContain('waiting for reads');
  });
});

describe('report', () => {
  it('names the browser, and writes the mapping block with the last 20 log lines', () => {
    expect(browserOf('Mozilla/5.0 Gecko/20100101 Firefox/130.0')).toBe('Firefox 130.0');
    expect(browserOf('Mozilla/5.0 Chrome/125.0.0.0 Safari/537.36')).toBe('Chrome 125.0.0.0');
    const text = mappingReport(
      { host: 'app', userAgent: 'x Version/17.0 Safari/605.1.15' },
      snap({ mapping: '' }),
      DEFAULT_PAD_BINDINGS,
      'xbox',
      null,
    );
    expect(text.join('\n')).toContain('Mapping: (empty, not standard)');
    expect(text.join('\n')).toContain('Host: app');
    const log = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const out = reportText(text, log).split('\n');
    expect(out).toContain('line 29');
    expect(out).toContain('line 10');
    expect(out).not.toContain('line 9');
  });
});

describe('sampling against the game tick path', () => {
  const sample = (pressed: boolean[], game?: boolean[]): PadSample[] => [
    { index: 0, timestamp: 1, pressed, ...(game ? { game } : {}) },
  ];

  it('counts a short press the latch delivered as seen by the game and missed by the raw read', () => {
    const p = new SamplingProbe();
    p.tick(0, sample([false], [false]));
    p.fast(4, sample([true]));
    p.fast(9, sample([false]));
    // The next tick: the raw read is up, the game's path reports the press.
    p.tick(16, sample([false], [true]));
    const r = p.report(0, 20);
    expect(r).toMatchObject({ fastPresses: 1, tickSeen: 1, missed: 0, missedRaw: 1 });
    expect(r.shortestMissedRawMs).toBe(5);
    expect(r.shortestMissedMs).toBeNull();
  });

  it('counts a press the game path also lost as missed by both', () => {
    const p = new SamplingProbe();
    p.fast(4, sample([true]));
    p.fast(9, sample([false]));
    p.tick(16, sample([false], [false]));
    expect(p.report(0, 20)).toMatchObject({ missed: 1, missedRaw: 1 });
  });

  it('judges a press only at the tick after it ends', () => {
    const p = new SamplingProbe();
    p.fast(4, sample([true]));
    p.fast(9, sample([false]));
    expect(p.report(0, 10)).toMatchObject({ missed: 0, missedRaw: 0 });
  });

  it('says which buttons the tick path reported', () => {
    const snap = {
      buttons: [
        { pressed: false, value: 0 },
        { pressed: true, value: 1 },
      ],
    };
    expect(padButtonBits(0, DEFAULT_PAD_BINDINGS)).toBe(16);
    expect(gameSeen(snap, 16, DEFAULT_PAD_BINDINGS)).toEqual([true, false]);
    expect(gameSeen(snap, 0, DEFAULT_PAD_BINDINGS)).toEqual([false, false]);
  });

  it('lists both counters in the page lines', () => {
    const lines = samplingLines(new SamplingProbe().report(0, 0)).join('\n');
    expect(lines).toContain('presses the game never saw');
    expect(lines).toContain('old per-tick read alone would have missed');
  });
});
