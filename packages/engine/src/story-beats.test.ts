// Tests the beat cursor: typing, the complete-then-advance rule, scene progress and reduced motion.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { BEAT_CHARS_PER_SECOND, BeatCursor, type BeatScene } from './story-beats';

const scenes: BeatScene[] = [
  { place: 'Yard', beats: ['One two.', 'Three.'] },
  { place: 'Lab', beats: ['Only one beat here.'] },
  { place: 'Sky', beats: ['Up we go.', 'Higher.', 'Last.'] },
];

/** Types the current beat out by ticking, as the frame loop would. */
const finish = (c: BeatCursor): void => {
  while (!c.done) c.tick(0.1);
};

describe('BeatCursor', () => {
  it('starts on the first beat of the first scene, with nothing typed', () => {
    const c = new BeatCursor(scenes);
    expect(c.scene).toBe(0);
    expect(c.beat).toBe(0);
    expect(c.typed).toBe(0);
    expect(c.done).toBe(false);
    const v = c.view();
    expect(v.shown).toBe('');
    expect(v.hidden).toBe('One two.');
    expect(v.place).toBe('Yard');
  });

  it('types at 83 characters a second and reports when the screen needs to redraw', () => {
    const c = new BeatCursor(scenes);
    expect(c.tick(1 / BEAT_CHARS_PER_SECOND / 2)).toBe(false);
    expect(c.typed).toBe(0);
    expect(c.tick(1 / BEAT_CHARS_PER_SECOND)).toBe(true);
    expect(c.typed).toBe(1);
    expect(c.view().shown).toBe('O');
    // 8 characters in 8 / 83 s: the whole beat, and nothing to redraw once it is typed.
    expect(c.tick(1)).toBe(true);
    expect(c.done).toBe(true);
    expect(c.tick(1)).toBe(false);
  });

  it('a press while typing completes the beat without advancing', () => {
    const c = new BeatCursor(scenes);
    c.tick(0.02);
    expect(c.press()).toBe('complete');
    expect(c.done).toBe(true);
    expect(c.scene).toBe(0);
    expect(c.beat).toBe(0);
    expect(c.view().hidden).toBe('');
  });

  it('the next press moves to the next beat, then the next scene, resetting the typing each time', () => {
    const c = new BeatCursor(scenes);
    c.press();
    expect(c.press()).toBe('beat');
    expect([c.scene, c.beat, c.typed]).toEqual([0, 1, 0]);
    c.press();
    expect(c.press()).toBe('scene');
    expect([c.scene, c.beat, c.typed]).toEqual([1, 0, 0]);
    expect(c.view().place).toBe('Lab');
  });

  it('a press on a finished last beat of the last scene ends the sequence and stays put', () => {
    const c = new BeatCursor([{ place: 'A', beats: ['x'] }]);
    expect(c.press()).toBe('complete');
    expect(c.press()).toBe('end');
    expect(c.press()).toBe('end');
    expect([c.scene, c.beat, c.done]).toEqual([0, 0, true]);
  });

  it('walks every beat in order with two presses each, and ends after the last', () => {
    const c = new BeatCursor(scenes);
    const seen: string[] = [];
    for (;;) {
      seen.push(c.view().text);
      c.press();
      const r = c.press();
      if (r === 'end') break;
    }
    expect(seen).toEqual([
      'One two.',
      'Three.',
      'Only one beat here.',
      'Up we go.',
      'Higher.',
      'Last.',
    ]);
  });

  it('the dots count scenes, not beats', () => {
    const c = new BeatCursor(scenes);
    expect(c.view().pips).toBe('●○○');
    finish(c);
    c.press();
    expect(c.view().pips).toBe('●○○');
    finish(c);
    c.press();
    expect(c.view().pips).toBe('●●○');
    finish(c);
    c.press();
    expect(c.view().pips).toBe('●●●');
    finish(c);
    c.press();
    expect(c.view().pips).toBe('●●●');
  });

  it('flags the end of a scene and the last beat', () => {
    const c = new BeatCursor(scenes);
    expect(c.view().sceneEnd).toBe(false);
    finish(c);
    c.press();
    expect(c.view().sceneEnd).toBe(true);
    expect(c.view().last).toBe(false);
    for (let i = 0; i < 5; i++) {
      finish(c);
      c.press();
    }
    expect(c.view().text).toBe('Last.');
    expect(c.view().last).toBe(true);
  });

  it('announces the whole beat once, led by the place only when the scene starts', () => {
    const c = new BeatCursor(scenes);
    expect(c.view().announcement).toBe('Yard. One two.');
    c.tick(0.03);
    expect(c.view().announcement).toBe('Yard. One two.');
    finish(c);
    c.press();
    expect(c.view().announcement).toBe('Three.');
    finish(c);
    c.press();
    expect(c.view().announcement).toBe('Lab. Only one beat here.');
  });

  it('start() goes back to the beginning, and can take other scenes', () => {
    const c = new BeatCursor(scenes);
    c.press();
    c.press();
    c.start();
    expect([c.scene, c.beat, c.typed]).toEqual([0, 0, 0]);
    c.start([{ place: 'End', beats: ['Fin.'] }]);
    expect(c.view().place).toBe('End');
    expect(c.view().pips).toBe('●');
  });

  it('under reduced motion a beat is whole as soon as it starts, so one press advances', () => {
    const c = new BeatCursor(scenes, { reduced: true });
    expect(c.done).toBe(true);
    expect(c.view().shown).toBe('One two.');
    expect(c.press()).toBe('beat');
    expect(c.done).toBe(true);
    expect(c.press()).toBe('scene');
    expect(c.view().hidden).toBe('');
  });

  it('turning reduced motion on finishes the beat being typed, and tick never types it slowly', () => {
    const c = new BeatCursor(scenes);
    c.tick(0.02);
    c.setReduced(true);
    expect(c.done).toBe(true);
    c.press();
    expect(c.view().shown).toBe('Three.');
    c.setReduced(false);
    expect(c.press()).toBe('scene');
    expect(c.done).toBe(false);
  });

  it('copes with a scene list that is empty', () => {
    const c = new BeatCursor([]);
    expect(c.view().text).toBe('');
    expect(c.press()).toBe('end');
  });

  it('reports the beats in each scene', () => {
    expect(new BeatCursor(scenes).beatCounts).toEqual([2, 1, 3]);
  });
});
