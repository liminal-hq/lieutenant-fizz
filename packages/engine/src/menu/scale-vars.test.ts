// Tests for the menu page's scale properties.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { menuScaleVars } from './scale-vars';

describe('the menu scale properties', () => {
  it('uses whole-number scales that step with the window height', () => {
    const phone = menuScaleVars(844, 390);
    expect(phone['--lf-n']).toBe('2');
    expect(phone['--lf-n-small']).toBe('2');
    expect(phone['--lf-n-head']).toBe('3');
    expect(menuScaleVars(1280, 720)['--lf-n']).toBe('3');
    expect(menuScaleVars(2560, 1440)['--lf-n']).toBe('4');
    for (const v of Object.values(menuScaleVars(1280, 720)).filter((s) => !s.endsWith('px'))) {
      expect(Number.isInteger(Number(v))).toBe(true);
    }
  });

  it('adds a step for Large text and pads the sides with the window', () => {
    expect(menuScaleVars(1280, 720, true)['--lf-n']).toBe('4');
    expect(menuScaleVars(300, 300)['--lf-pad-x']).toBe('24px');
    expect(menuScaleVars(3000, 300)['--lf-pad-x']).toBe('104px');
  });
});
