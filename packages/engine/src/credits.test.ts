// Tests the credits sequencing: rolling, speeding up, holding, paging, skipping and re-layout.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  CREDITS_MAX_STEP,
  CREDITS_MIN_SPEED,
  CreditsRoll,
  creditsPageCount,
  type CreditsContent,
} from './credits';

const content: CreditsContent = {
  title: 'T',
  subtitle: 'S',
  sections: [
    { head: 'A', lines: [{ role: 'r', name: 'n' }] },
    { head: 'B', lines: [{ role: 'r', name: 'n' }] },
  ],
  thanks: 'Thanks',
  thanksLine: 'Line',
  returnLine: 'Back soon',
};

/** Runs the roll with fixed injected frame times for `seconds`. */
const run = (roll: CreditsRoll, seconds: number, dt = 1 / 60): void => {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) roll.tick(dt);
};

describe('CreditsRoll (scrolling)', () => {
  const make = (): CreditsRoll => {
    const r = new CreditsRoll({ reduced: false, pages: creditsPageCount(content) });
    r.layout(600, 3000); // 60 px/s, 3000 px of travel: 50 s at normal speed
    return r;
  };

  it('starts at the beginning and advances at a fixed speed', () => {
    const r = make();
    expect(r.offset).toBe(0);
    expect(r.held).toBe(false);
    run(r, 10);
    expect(r.offset).toBeCloseTo(600, 0);
  });

  it('has a minimum speed on short viewports', () => {
    const r = new CreditsRoll({ reduced: false, pages: 5 });
    r.layout(100, 1000);
    run(r, 1);
    expect(r.offset).toBeCloseTo(CREDITS_MIN_SPEED, 0);
  });

  it('reaches the hold and stops exactly at the target', () => {
    const r = make();
    run(r, 60);
    expect(r.held).toBe(true);
    expect(r.offset).toBe(3000);
    run(r, 5);
    expect(r.offset).toBe(3000);
  });

  it('speeds up four times on the first press and slows down on the second', () => {
    const r = make();
    expect(r.press()).toBe('speedUp');
    expect(r.sped).toBe(true);
    run(r, 5);
    expect(r.offset).toBeCloseTo(1200, 0);
    expect(r.press()).toBe('normalSpeed');
    expect(r.sped).toBe(false);
    run(r, 5);
    expect(r.offset).toBeCloseTo(1500, 0);
  });

  it('only continues once it is holding, and then marks itself finished', () => {
    const r = make();
    expect(r.press()).toBe('speedUp');
    run(r, 20);
    expect(r.held).toBe(true);
    expect(r.finished).toBe(false);
    expect(r.press()).toBe('finish');
    expect(r.finished).toBe(true);
  });

  it('skips from any point', () => {
    const r = make();
    run(r, 3);
    r.skip();
    expect(r.finished).toBe(true);
    const at = r.offset;
    run(r, 3);
    expect(r.offset).toBe(at);
  });

  it('clamps long frames so a stalled tab does not jump the roll', () => {
    const r = make();
    r.tick(30);
    expect(r.offset).toBeCloseTo(CREDITS_MAX_STEP * 60, 5);
    r.tick(-5);
    expect(r.offset).toBeCloseTo(CREDITS_MAX_STEP * 60, 5);
  });

  it('keeps and clamps progress when the layout changes', () => {
    const r = make();
    run(r, 20);
    expect(r.offset).toBeCloseTo(1200, 0);
    r.layout(600, 800);
    expect(r.offset).toBe(800);
    expect(r.held).toBe(true);
  });

  it('holds immediately when there is nothing to scroll', () => {
    const r = new CreditsRoll({ reduced: false, pages: 3 });
    r.layout(600, 0);
    expect(r.held).toBe(true);
  });
});

describe('CreditsRoll (reduced motion)', () => {
  it('counts a page per section plus the title card and the close', () => {
    expect(creditsPageCount(content)).toBe(4);
  });

  it('never scrolls, and pages forward on each press', () => {
    const r = new CreditsRoll({ reduced: true, pages: creditsPageCount(content) });
    r.layout(600, 3000);
    run(r, 30);
    expect(r.offset).toBe(0);
    expect(r.page).toBe(0);
    expect(r.press()).toBe('nextPage');
    expect(r.press()).toBe('nextPage');
    expect(r.press()).toBe('nextPage');
    expect(r.page).toBe(3);
    expect(r.held).toBe(true);
    expect(r.finished).toBe(false);
    expect(r.press()).toBe('finish');
    expect(r.finished).toBe(true);
  });

  it('can be skipped from the first page', () => {
    const r = new CreditsRoll({ reduced: true, pages: 4 });
    r.skip();
    expect(r.finished).toBe(true);
  });
});
