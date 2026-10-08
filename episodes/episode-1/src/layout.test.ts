// Tests for the overlay's window-size layout variables.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  captionAnimation,
  captionPosition,
  creditsTransform,
  isPortrait,
  layoutVars,
  rowHeight,
  watchResize,
} from './layout';

const SIZES: [number, number][] = [
  [1280, 720],
  [1000, 615],
  [1600, 600],
  [390, 700],
  [320, 240],
  [3840, 2160],
];

describe('touch gutters', () => {
  it('changes nothing without gutters', () => {
    const plain = layoutVars(844, 390, false);
    expect(layoutVars(844, 390, false, { left: 0, right: 0 })).toEqual(plain);
    expect(plain['--lf-touch-left']).toBe('0px');
  });

  it('writes the gutters and sizes the wordmark and columns for the room between them', () => {
    const v = layoutVars(740, 360, false, { left: 190, right: 120 });
    expect(v['--lf-touch-left']).toBe('190px');
    expect(v['--lf-touch-right']).toBe('120px');
    // 740 - 190 - 120 = 430 px: "Lieutenant Fizz" (102 glyph pixels) fits on one line at 4.
    expect(v['--lf-n-logo']).toBe('4');
    expect(Number(v['--lf-cols'])).toBe(Math.floor(430 / 12));
    expect(layoutVars(844, 390, false, { left: 190, right: 120 })['--lf-n-logo']).toBe('5');
  });
});

describe('rowHeight', () => {
  it('is 48 when the menu fits', () => {
    expect(rowHeight(0, 5, 22)).toBe(48);
    expect(rowHeight(-40, 5, 22)).toBe(48);
  });

  it('shares an overflow between the rows, down to one glyph cell', () => {
    expect(rowHeight(50, 5, 22)).toBe(38);
    expect(rowHeight(51, 5, 22)).toBe(37);
    expect(rowHeight(500, 5, 22)).toBe(22);
    expect(rowHeight(10, 0, 22)).toBe(48);
  });
});

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

describe('watchResize on a phone', () => {
  const fake = (): {
    handlers: Map<string, () => void>;
    target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  } => {
    const handlers = new Map<string, () => void>();
    return {
      handlers,
      target: {
        addEventListener: (type: string, fn: EventListenerOrEventListenerObject) =>
          void handlers.set(type, fn as () => void),
        removeEventListener: (type: string) => void handlers.delete(type),
      },
    };
  };

  it('also listens for a turn of the phone and for the visual viewport', () => {
    const win = fake();
    const vv = fake();
    let calls = 0;
    const stop = watchResize(() => calls++, win.target, vv.target);
    expect([...win.handlers.keys()].sort()).toEqual(['orientationchange', 'resize']);
    expect([...vv.handlers.keys()]).toEqual(['resize']);
    win.handlers.get('orientationchange')!();
    vv.handlers.get('resize')!();
    expect(calls).toBe(2);
    stop();
    expect(win.handlers.size).toBe(0);
    expect(vv.handlers.size).toBe(0);
  });

  it('works without a visual viewport', () => {
    const win = fake();
    const stop = watchResize(() => {}, win.target, null);
    expect(win.handlers.size).toBe(2);
    stop();
    expect(win.handlers.size).toBe(0);
  });
});

describe('isPortrait', () => {
  it('is true only when taller than wide', () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
    expect(isPortrait(600, 600)).toBe(false);
  });
});

describe('creditsTransform', () => {
  it('moves the roll in whole CSS pixels', () => {
    expect(creditsTransform(615, 100.4)).toBe('translateY(515px)');
    expect(creditsTransform(615, 100.6)).toBe('translateY(514px)');
    for (let off = 0; off < 40; off += 0.37) {
      expect(creditsTransform(601, off)).toMatch(/^translateY\(-?\d+px\)$/);
    }
  });
});

describe('captions', () => {
  it('rises in whole pixels with no scaling, so the pixel font is never resampled', () => {
    const { keyframes, options } = captionAnimation();
    const text = JSON.stringify(keyframes);
    expect(text).not.toMatch(/scale/);
    for (const f of keyframes) expect(String(f['transform'])).toMatch(/^translateY\(-?\d+px\)$/);
    expect(String(options.easing)).toMatch(/^steps\(\d+, end\)$/);
  });

  it('steps once per pixel risen', () => {
    const { keyframes, options } = captionAnimation();
    const rise = Math.abs(parseInt(String(keyframes.at(-1)?.['transform']).replace(/\D/g, ''), 10));
    expect(options.easing).toBe(`steps(${rise}, end)`);
  });

  it('centres a caption on a whole pixel', () => {
    expect(captionPosition(100.5, 50.5, 33, 27)).toEqual({ left: 84, top: 37 });
    expect(captionPosition(10, 10, 20, 20)).toEqual({ left: 0, top: 0 });
  });
});
