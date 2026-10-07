// Tests for Ben's title screen animation.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { BEN_CYCLE, BEN_WAVE, benFrame, benScale, type BenBox, type BenCues } from './titleBen';

const box: BenBox = { logoW: 400, logoH: 80, width: 48 };
const idle: BenCues = { reduced: false, waveLeft: 0, looking: false };
const home = box.logoW + 6;

describe('benScale', () => {
  it('is a whole number from 2 to 4 that follows the window height', () => {
    expect(benScale(300)).toBe(2);
    expect(benScale(615)).toBe(3);
    expect(benScale(720)).toBe(3);
    expect(benScale(900)).toBe(4);
    expect(benScale(3000)).toBe(4);
  });
});

describe('benFrame', () => {
  it('stands at the end of the wordmark when idle', () => {
    const f = benFrame(box, 1, idle);
    expect(f).toMatchObject({ pose: 'stand', x: home, flip: false, rot: 0 });
  });

  it('bobs by one sprite pixel every two thirds of a second', () => {
    const ys = new Set([0, 0.3, 0.7, 1.0, 1.4, 2.0].map((t) => benFrame(box, t, idle).y));
    expect([...ys].sort()).toEqual([0, 3]);
  });

  it('only stands under reduced motion, whatever else is going on', () => {
    for (const t of [0, 5, 10, 11.5, 12.8]) {
      expect(benFrame(box, t, { reduced: true, waveLeft: 0.4, looking: true })).toEqual({
        pose: 'stand',
        x: home,
        y: 0,
        flip: false,
        rot: 0,
      });
    }
  });

  it('leans back on the logo between 4.5 and 6.5 seconds', () => {
    const f = benFrame(box, 5, idle);
    expect(f.rot).toBe(-12);
    expect(f.pose).toBe('stand');
    expect(f.x).toBeLessThan(home);
    expect(benFrame(box, 4.4, idle).rot).toBe(0);
    expect(benFrame(box, 6.6, idle).rot).toBe(0);
  });

  it('hops onto the logo and pogoes across the top of it', () => {
    const jump = benFrame(box, 9.2, idle);
    expect(jump.pose).toBe('jump');
    expect(jump.flip).toBe(true);
    const topY = box.logoH - box.width * 0.3;
    const poses = new Set<string>();
    for (let t = 9.5; t < 12.5; t += 0.05) {
      const f = benFrame(box, t, idle);
      poses.add(f.pose);
      expect(f.y).toBeGreaterThanOrEqual(Math.round(topY));
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThanOrEqual(home);
    }
    expect(poses.has('pogo')).toBe(true);
    expect(poses.has('pogo2')).toBe(true);
  });

  it('crosses to the left end and comes back facing the other way', () => {
    const out = benFrame(box, 10.9, idle);
    const back = benFrame(box, 11.1, idle);
    expect(out.flip).toBe(true);
    expect(back.flip).toBe(false);
    expect(benFrame(box, 11, idle).x).toBeLessThan(10);
    expect(benFrame(box, 9.45, idle).x).toBeGreaterThan(benFrame(box, 10.5, idle).x);
  });

  it('jumps back down to the end of the wordmark', () => {
    const f = benFrame(box, 12.9, idle);
    expect(f.pose).toBe('jump');
    expect(f.flip).toBe(false);
    expect(benFrame(box, 13.2, idle).pose).toBe('stand');
    expect(benFrame(box, 13.2, idle).x).toBe(home);
  });

  it('faces the menu while the selection has just moved', () => {
    expect(benFrame(box, 1, { ...idle, looking: true }).flip).toBe(true);
    expect(benFrame(box, 5, { ...idle, looking: true }).flip).toBe(true);
  });

  it('waves in the shoot pose, rising and settling over 0.9 seconds', () => {
    const start = benFrame(box, 1, { ...idle, waveLeft: BEN_WAVE });
    const mid = benFrame(box, 1, { ...idle, waveLeft: BEN_WAVE / 2 });
    const end = benFrame(box, 1, { ...idle, waveLeft: 0.001 });
    expect(start.pose).toBe('shoot');
    expect(start.flip).toBe(true);
    expect(start.y).toBe(0);
    expect(mid.y).toBe(Math.round(box.width * 0.4));
    expect(end.y).toBeLessThanOrEqual(1);
  });

  it('repeats every 14 seconds', () => {
    for (const t of [0.3, 5, 9.7, 11.3, 12.8]) {
      expect(benFrame(box, t + BEN_CYCLE, idle)).toEqual(benFrame(box, t, idle));
    }
  });

  it('only returns whole pixels and never goes below the logo', () => {
    for (let t = 0; t < 28; t += 0.07) {
      const f = benFrame(box, t, idle);
      expect(Number.isInteger(f.x)).toBe(true);
      expect(Number.isInteger(f.y)).toBe(true);
      expect(f.y).toBeGreaterThanOrEqual(0);
    }
  });
});
