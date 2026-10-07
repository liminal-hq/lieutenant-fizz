// Tests for the overlay's window-size layout variables.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { layoutVars, watchResize } from './layout';

const SIZES: [number, number][] = [
  [1280, 720],
  [1000, 615],
  [1600, 600],
  [390, 700],
  [320, 240],
  [3840, 2160],
];

describe('layoutVars', () => {
  it('picks the scale from the height', () => {
    expect(layoutVars(1280, 720, false)['--lf-n']).toBe('3');
    expect(layoutVars(1000, 615, false)['--lf-n']).toBe('3');
    expect(layoutVars(1600, 600, false)['--lf-n']).toBe('3');
    expect(layoutVars(390, 700, false)['--lf-n']).toBe('3');
    expect(layoutVars(1920, 1080, false)['--lf-n']).toBe('4');
    expect(layoutVars(640, 400, false)['--lf-n']).toBe('2');
  });

  it('adds one for large text', () => {
    expect(layoutVars(1280, 720, true)['--lf-n']).toBe('4');
    expect(layoutVars(640, 400, true)['--lf-n']).toBe('3');
  });

  it('only ever writes whole-number scales from 2 to 6', () => {
    for (const [w, h] of SIZES) {
      for (const large of [false, true]) {
        const v = layoutVars(w, h, large);
        for (const k of ['--lf-n', '--lf-n-small', '--lf-n-head', '--lf-n-hint', '--lf-n-logo']) {
          const n = Number(v[k]);
          expect(Number.isInteger(n), `${k} at ${w}x${h}`).toBe(true);
          expect(n).toBeGreaterThanOrEqual(2);
          expect(n).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('keeps body text at 2 or more at every size', () => {
    for (const [w, h] of SIZES)
      expect(Number(layoutVars(w, h, false)['--lf-n-small'])).toBeGreaterThanOrEqual(2);
  });

  it('shrinks the wordmark to fit a narrow window', () => {
    const wide = Number(layoutVars(1280, 720, false)['--lf-n-logo']);
    const narrow = Number(layoutVars(390, 700, false)['--lf-n-logo']);
    expect(wide).toBeGreaterThanOrEqual(narrow);
  });

  it('writes padding in pixels and a column count for wrapped text', () => {
    const v = layoutVars(1000, 615, false);
    expect(v['--lf-pad-x']).toBe('70px');
    expect(v['--lf-pad-y']).toBe('37px');
    expect(Number(v['--lf-cols'])).toBeGreaterThanOrEqual(20);
    expect(Number(v['--lf-cols'])).toBeLessThanOrEqual(56);
  });
});

describe('layoutVars keys bar', () => {
  it('keeps the hint bar between 16 and 36 px from the bottom', () => {
    expect(layoutVars(1000, 300, false)['--lf-keys-bottom']).toBe('16px');
    expect(layoutVars(1000, 615, false)['--lf-keys-bottom']).toBe('25px');
    expect(layoutVars(1000, 2000, false)['--lf-keys-bottom']).toBe('36px');
  });
});

describe('watchResize', () => {
  it('listens for resize and stops when told to', () => {
    const handlers = new Map<string, EventListenerOrEventListenerObject>();
    const target = {
      addEventListener: (type: string, fn: EventListenerOrEventListenerObject) =>
        void handlers.set(type, fn),
      removeEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
        if (handlers.get(type) === fn) handlers.delete(type);
      },
    };
    let calls = 0;
    const stop = watchResize(() => calls++, target);
    expect(handlers.has('resize')).toBe(true);
    (handlers.get('resize') as () => void)();
    expect(calls).toBe(1);
    stop();
    expect(handlers.has('resize')).toBe(false);
  });
});
