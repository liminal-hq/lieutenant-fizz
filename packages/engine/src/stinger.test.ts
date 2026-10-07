// Tests the stinger timing: silence, one sting, doorway, typed line, skipping and continuing.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { StingerScene, STINGER_TIMES, STINGER_TYPE_RATE, type StingerContent } from './stinger';

const content: StingerContent = {
  name: 'Someone',
  place: 'Somewhere',
  text: 'x'.repeat(83),
  sprite: 'sprite',
  caption: '♪ low sting',
};

/** Advances by `seconds` in fixed injected steps and counts the stings that fired. */
const run = (s: StingerScene, seconds: number, dt = 0.05): number => {
  let stings = 0;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) if (s.tick(dt)) stings++;
  return stings;
};

describe('StingerScene', () => {
  it('starts in silence with nothing typed', () => {
    const s = new StingerScene(content);
    expect(s.phase).toBe('silence');
    expect(s.typed).toBe(0);
    expect(s.done).toBe(false);
  });

  it('moves through the stages at the designed times', () => {
    const s = new StingerScene(content);
    run(s, STINGER_TIMES.slit - 0.1);
    expect(s.phase).toBe('silence');
    run(s, 0.2);
    expect(s.phase).toBe('slit');
    run(s, STINGER_TIMES.doorway - STINGER_TIMES.slit);
    expect(s.phase).toBe('doorway');
    run(s, STINGER_TIMES.line - STINGER_TIMES.doorway);
    expect(s.phase).toBe('line');
  });

  it('sounds the sting exactly once, at the slit', () => {
    const s = new StingerScene(content);
    let when = -1;
    let count = 0;
    for (let i = 0; i < 200; i++) {
      if (s.tick(0.05)) {
        count++;
        when = s.time;
      }
    }
    expect(count).toBe(1);
    expect(when).toBeGreaterThanOrEqual(STINGER_TIMES.slit);
    expect(when).toBeLessThan(STINGER_TIMES.slit + 0.06);
  });

  it('even a single huge step sounds the sting once', () => {
    const s = new StingerScene(content);
    expect(s.tick(10)).toBe(true);
    expect(s.tick(10)).toBe(false);
  });

  it('types the line only once the line stage begins', () => {
    const s = new StingerScene(content);
    run(s, STINGER_TIMES.line - 0.05);
    expect(s.typed).toBe(0);
    run(s, 0.5);
    expect(s.typed).toBeGreaterThan(0);
    expect(s.typed).toBeLessThan(content.text.length);
    run(s, 1);
    expect(s.typed).toBe(content.text.length);
    expect(s.done).toBe(true);
    expect(STINGER_TYPE_RATE).toBe(83);
  });

  it('ignores Jump before the line, completes the typing, then continues', () => {
    const s = new StingerScene(content);
    run(s, 3);
    expect(s.press()).toBe('ignored');
    expect(s.finished).toBe(false);
    run(s, STINGER_TIMES.line - 3 + 0.3);
    expect(s.done).toBe(false);
    expect(s.press()).toBe('finishTyping');
    expect(s.done).toBe(true);
    expect(s.finished).toBe(false);
    expect(s.press()).toBe('finish');
    expect(s.finished).toBe(true);
  });

  it('can be skipped at any time, including in the silence', () => {
    const s = new StingerScene(content);
    s.skip();
    expect(s.finished).toBe(true);
    expect(s.tick(5)).toBe(false);
  });
});
