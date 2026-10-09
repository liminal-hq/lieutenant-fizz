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

describe('BeatCursor with packed pages', () => {
  const story: BeatScene[] = [
    { place: 'Yard', beats: ['Aaa aaa,', 'bbb bbb.', 'Ccc ccc.', 'Ddd ddd.'] },
    { place: 'Sky', beats: ['Up.', 'Hatch.', 'Higher.'], breaks: [1] },
  ];
  /** A fake measurer: a page fits when it is at most this many characters. */
  const upTo = (n: number) => ({ fits: (t: string) => t.length <= n });
  const pagesOf = (c: BeatCursor): string[] => {
    const out: string[] = [];
    for (let guard = 0; guard < 50; guard++) {
      finish(c);
      out.push(c.view().text);
      if (c.press() === 'end') break;
    }
    return out;
  };

  it('shows a page of joined beats, with the first beat and the page count in the view', () => {
    const c = new BeatCursor(story);
    c.start(story, upTo(18));
    const v = c.view();
    expect(v.text).toBe('Aaa aaa, bbb bbb.');
    expect([v.scene, v.beat, v.page, v.pageCount]).toEqual([0, 0, 0, 2]);
    expect(c.pageCounts).toEqual([2, 2]);
    expect(c.beatCounts).toEqual([4, 3]);
    finish(c);
    c.press();
    expect([c.view().text, c.beat, c.page]).toEqual(['Ccc ccc. Ddd ddd.', 2, 1]);
  });

  it('presses through every page and scene, joined text equal to the beats, and a page is a tap', () => {
    const c = new BeatCursor(story, { reduced: true });
    c.start(story, upTo(18));
    expect(pagesOf(c)).toEqual(['Aaa aaa, bbb bbb.', 'Ccc ccc. Ddd ddd.', 'Up.', 'Hatch. Higher.']);
  });

  it('never joins across a scene and always starts a page at a break', () => {
    const c = new BeatCursor(story, { reduced: true });
    c.start(story, upTo(1000));
    expect(pagesOf(c)).toEqual(['Aaa aaa, bbb bbb. Ccc ccc. Ddd ddd.', 'Up.', 'Hatch. Higher.']);
  });

  it('puts a beat on every page without a fit, as before', () => {
    const c = new BeatCursor(story, { reduced: true });
    expect(pagesOf(c)).toEqual([
      'Aaa aaa,',
      'bbb bbb.',
      'Ccc ccc.',
      'Ddd ddd.',
      'Up.',
      'Hatch.',
      'Higher.',
    ]);
  });

  it('the dots count scenes however many pages a scene has', () => {
    const c = new BeatCursor(story, { reduced: true });
    c.start(story, upTo(18));
    expect(c.view().pips).toBe('●○');
    c.press();
    expect(c.view().pips).toBe('●○');
    c.press();
    expect(c.view().pips).toBe('●●');
  });

  it('marks the last page of a scene and of the sequence', () => {
    const c = new BeatCursor(story, { reduced: true });
    c.start(story, upTo(18));
    const flags: [boolean, boolean][] = [];
    do flags.push([c.view().sceneEnd, c.view().last]);
    while (c.press() !== 'end');
    expect(flags).toEqual([
      [false, false],
      [true, false],
      [false, false],
      [true, true],
    ]);
  });

  it('reads the place with the first page of a scene only', () => {
    const c = new BeatCursor(story, { reduced: true });
    c.start(story, upTo(18));
    expect(c.view().announcement).toBe('Yard. Aaa aaa, bbb bbb.');
    c.press();
    expect(c.view().announcement).toBe('Ccc ccc. Ddd ddd.');
  });

  it('a press completes a typing page before it advances', () => {
    const c = new BeatCursor(story);
    c.start(story, upTo(18));
    c.tick(0.05);
    expect(c.press()).toBe('complete');
    expect(c.view().text).toBe('Aaa aaa, bbb bbb.');
    expect(c.press()).toBe('beat');
    expect(c.view().beat).toBe(2);
  });

  it('a re-pack keeps the place: the page that holds the start of the page being read', () => {
    const c = new BeatCursor(story, { reduced: true });
    c.start(story, upTo(18));
    c.press();
    expect(c.view().beat).toBe(2);
    c.setFit(upTo(9));
    expect([c.view().text, c.beat]).toEqual(['Ccc ccc.', 2]);
    c.setFit(upTo(1000));
    // The wider page starts earlier, so the player is back at its start.
    expect([c.view().text, c.beat, c.page]).toEqual(['Aaa aaa, bbb bbb. Ccc ccc. Ddd ddd.', 0, 0]);
    c.setFit(null);
    expect([c.view().text, c.beat]).toEqual(['Ccc ccc.', 2]);
  });

  it('a re-pack passing through other widths puts the player back where they were', () => {
    const c = new BeatCursor(story, { reduced: true });
    c.start(story, upTo(18));
    c.press();
    expect(c.beat).toBe(2);
    // An in-between pack puts beat 2 inside a page that starts earlier; the place is still beat 2.
    c.setFit(upTo(1000));
    expect(c.beat).toBe(0);
    c.setFit(upTo(18));
    expect([c.beat, c.view().text]).toEqual([2, 'Ccc ccc. Ddd ddd.']);
    // Moving on from the earlier page moves the place with it.
    c.setFit(upTo(1000));
    expect(c.press()).toBe('scene');
    c.setFit(upTo(18));
    expect(c.scene).toBe(1);
  });

  it('a re-pack that gives the same page does not type it again', () => {
    const c = new BeatCursor(story);
    c.start(story, upTo(18));
    finish(c);
    c.setFit(upTo(20));
    expect(c.done).toBe(true);
    expect(c.view().shown).toBe('Aaa aaa, bbb bbb.');
    // Nor does it drop what is typed of a page that is still typing.
    const d = new BeatCursor(story);
    d.start(story, upTo(18));
    d.tick(5 / BEAT_CHARS_PER_SECOND);
    d.setFit(upTo(19));
    expect(d.typed).toBe(5);
    expect(d.done).toBe(false);
  });

  it('a re-pack keeps the typed text of a page that grows or shrinks, and types only what is new', () => {
    const c = new BeatCursor(story);
    c.start(story, upTo(8));
    finish(c);
    expect(c.view().text).toBe('Aaa aaa,');
    c.setFit(upTo(18));
    expect(c.view().shown).toBe('Aaa aaa,');
    expect(c.view().hidden).toBe(' bbb bbb.');
    expect(c.done).toBe(false);
    finish(c);
    c.setFit(upTo(8));
    expect(c.view().text).toBe('Aaa aaa,');
    expect(c.done).toBe(true);
  });

  it('a re-pack under reduced motion shows the whole page', () => {
    const c = new BeatCursor(story, { reduced: true });
    c.start(story, upTo(8));
    c.setFit(upTo(18));
    expect(c.done).toBe(true);
    expect(c.view().hidden).toBe('');
  });

  it('a re-pack never loses or repeats a beat while reading forward', () => {
    const c = new BeatCursor(story, { reduced: true });
    const fits = [upTo(8), upTo(18), upTo(30), upTo(1000), upTo(12)];
    c.start(story, fits[0]);
    const seen = new Set<number>();
    let n = 0;
    do {
      seen.add(c.beat + c.scene * 10);
      c.setFit(fits[n++ % fits.length] ?? null);
    } while (c.press() !== 'end' && n < 40);
    // Every scene's first beat was reached, and the walk reached the end.
    expect(seen.has(0)).toBe(true);
    expect(seen.has(10)).toBe(true);
  });

  it('starting again keeps the fit unless told otherwise, and null clears it', () => {
    const c = new BeatCursor(story, { reduced: true });
    c.start(story, upTo(18));
    c.start();
    expect(c.view().text).toBe('Aaa aaa, bbb bbb.');
    c.start(story, null);
    expect(c.view().text).toBe('Aaa aaa,');
  });

  it('seeks a page, untyped, and clamps what is out of range', () => {
    const c = new BeatCursor(story);
    c.start(story, upTo(18));
    c.seek(1, 1);
    expect([c.scene, c.page, c.beat, c.typed]).toEqual([1, 1, 1, 0]);
    c.seek(9, 9);
    expect([c.scene, c.page]).toEqual([1, 1]);
  });
});
