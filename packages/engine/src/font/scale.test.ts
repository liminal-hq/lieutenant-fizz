// Tests for pixel scale selection and word wrapping.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  pixelScale,
  scaleSteps,
  sidePadding,
  verticalPadding,
  wordmarkScale,
  wordmarkTwoLines,
  wrapColumns,
  wrapText,
} from './scale';

describe('pixelScale', () => {
  it('is 2 under 480 px tall, 3 up to 900 px, and 4 above', () => {
    expect(pixelScale(300)).toBe(2);
    expect(pixelScale(479)).toBe(2);
    expect(pixelScale(480)).toBe(3);
    expect(pixelScale(615)).toBe(3);
    expect(pixelScale(899)).toBe(3);
    expect(pixelScale(900)).toBe(4);
    expect(pixelScale(1600)).toBe(4);
  });

  it('adds one for large text and never leaves 2 to 6', () => {
    expect(pixelScale(300, true)).toBe(3);
    expect(pixelScale(700, true)).toBe(4);
    expect(pixelScale(1200, true)).toBe(5);
    for (const h of [0, 100, 479, 480, 899, 900, 5000]) {
      for (const large of [false, true]) {
        const n = pixelScale(h, large);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('scaleSteps', () => {
  it('keeps body text at 2 or more and headings at 6 or less', () => {
    for (let item = 2; item <= 6; item++) {
      const s = scaleSteps(item);
      expect(s.small).toBeGreaterThanOrEqual(2);
      expect(s.head).toBeLessThanOrEqual(6);
      expect(s.hint).toBe(2);
      for (const v of Object.values(s)) expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('steps one down for small text and one up for headings', () => {
    expect(scaleSteps(4)).toEqual({ item: 4, small: 3, head: 5, hint: 2, bullet: 2 });
    expect(scaleSteps(2).small).toBe(2);
    expect(scaleSteps(6).head).toBe(6);
  });

  it('sizes the bullet from the item scale', () => {
    expect(scaleSteps(3).bullet).toBe(2);
    expect(scaleSteps(5).bullet).toBe(3);
  });
});

describe('wordmark', () => {
  it('breaks onto two lines under 720 px wide', () => {
    expect(wordmarkTwoLines(719)).toBe(true);
    expect(wordmarkTwoLines(720)).toBe(false);
  });

  it('fits the width and stays a whole number from 2 to 6', () => {
    expect(wordmarkScale(1280, sidePadding(1280), 3)).toBe(6);
    expect(wordmarkScale(1000, sidePadding(1000), 3)).toBe(6);
    expect(wordmarkScale(390, sidePadding(390), 2)).toBe(5);
    expect(wordmarkScale(200, 24, 2)).toBe(2);
  });

  it('never grows past the item scale plus three', () => {
    expect(wordmarkScale(1600, 100, 2)).toBe(5);
  });
});

describe('padding', () => {
  it('clamps side padding to 24 to 104 and vertical to 24 to 64', () => {
    expect(sidePadding(200)).toBe(24);
    expect(sidePadding(1000)).toBe(70);
    expect(sidePadding(4000)).toBe(104);
    expect(verticalPadding(300)).toBe(24);
    expect(verticalPadding(615)).toBe(37);
    expect(verticalPadding(2000)).toBe(64);
  });
});

describe('wrapping', () => {
  it('turns a width into a column count between 20 and 56', () => {
    expect(wrapColumns(100, 3)).toBe(20);
    expect(wrapColumns(600, 3)).toBe(33);
    expect(wrapColumns(5000, 2)).toBe(56);
  });

  it('wraps at word boundaries', () => {
    expect(wrapText('The first teleporter on the map is humming now', 20)).toEqual([
      'The first teleporter',
      'on the map is',
      'humming now',
    ]);
  });

  it('keeps a word longer than the line whole', () => {
    expect(wrapText('a supercalifragilistic day', 8)).toEqual(['a', 'supercalifragilistic', 'day']);
  });

  it('has no lines for empty text', () => {
    expect(wrapText('   ', 20)).toEqual([]);
  });
});
