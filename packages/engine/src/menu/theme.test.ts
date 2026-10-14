// Tests for the menu theme.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { Pen } from '../pen';
import { BULLET_STEP_MS, bulletCycleMs, bulletFrames, themeVars } from './theme';

const frame = () => new Pen(16, 16);

describe('the menu theme', () => {
  it('sets only the properties it gives, so the page defaults fill the rest', () => {
    expect(themeVars({})).toEqual({});
    expect(themeVars({ colours: { accent: '#00aaaa', ink: '#000' } })).toEqual({
      '--lf-accent': '#00aaaa',
      '--lf-ink': '#000',
    });
    expect(themeVars({ plate: ['#111', '#222', '#333'] })).toEqual({
      '--lf-plate-a': '#111',
      '--lf-plate-b': '#222',
      '--lf-plate-c': '#333',
    });
  });

  it('writes every colour it has', () => {
    const vars = themeVars({
      colours: { text: 'a', dim: 'b', accent: 'c', muted: 'd', ink: 'e' },
    });
    expect(Object.keys(vars).sort()).toEqual(
      ['--lf-accent', '--lf-dim', '--lf-ink', '--lf-muted', '--lf-text'].sort(),
    );
  });

  it('counts the bullet as no frames, one frame or many', () => {
    expect(bulletFrames({})).toHaveLength(0);
    expect(bulletFrames({ bullet: frame() })).toHaveLength(1);
    expect(bulletFrames({ bullet: [frame(), frame(), frame()] })).toHaveLength(3);
  });

  it('times a whole run of frames, with a default step', () => {
    expect(bulletCycleMs({ bullet: [frame(), frame(), frame(), frame()] })).toBe(
      4 * BULLET_STEP_MS,
    );
    expect(bulletCycleMs({ bullet: [frame(), frame()], bulletStepMs: 100 })).toBe(200);
    expect(bulletCycleMs({})).toBe(BULLET_STEP_MS);
  });
});
