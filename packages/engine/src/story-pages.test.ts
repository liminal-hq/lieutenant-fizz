// Tests page packing: greedy joins, hard breaks, mapping a beat to its page, tap counts and the allowed line count.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  allowedLines,
  commonPrefix,
  packBeats,
  pageOfBeat,
  paginate,
  singleBeats,
  tapCount,
  type PackScene,
} from './story-pages';

/** A fake measurer: the lines a text takes when it wraps at whole words into `cols` columns. */
function wrap(text: string, cols: number): number {
  let lines = 1;
  let used = 0;
  for (const word of text.split(' ')) {
    if (used === 0) used = word.length;
    else if (used + 1 + word.length <= cols) used += 1 + word.length;
    else {
      lines++;
      used = word.length;
    }
  }
  return lines;
}
const fitsIn =
  (cols: number, lines: number) =>
  (t: string): boolean =>
    wrap(t, cols) <= lines;

const BEATS = ['One two three,', 'four five six.', 'Seven.', 'Eight nine ten eleven twelve.'];

describe('packBeats', () => {
  it('joins consecutive beats with a single space while they fit', () => {
    const p = packBeats(BEATS, (t) => t.length <= 30);
    expect(p.texts).toEqual(['One two three, four five six.', 'Seven.', BEATS[3]]);
    expect(p.starts).toEqual([0, 2, 3]);
  });

  it('puts everything on one page when it all fits, and the page is the paragraph', () => {
    const p = packBeats(BEATS, () => true);
    expect(p.texts).toEqual([BEATS.join(' ')]);
    expect(p.starts).toEqual([0]);
  });

  it('gives each beat its own page when nothing joins', () => {
    const p = packBeats(BEATS, (t) => BEATS.includes(t));
    expect(p.texts).toEqual(BEATS);
    expect(p.starts).toEqual([0, 1, 2, 3]);
  });

  it('starts a new page at a hard break even when the beat would fit', () => {
    const p = packBeats(BEATS, () => true, [2]);
    expect(p.texts).toEqual([
      'One two three, four five six.',
      'Seven. Eight nine ten eleven twelve.',
    ]);
    expect(p.starts).toEqual([0, 2]);
    expect(packBeats(BEATS, () => true, [1, 2, 3]).starts).toEqual([0, 1, 2, 3]);
  });

  it('keeps a beat that is too long on a page of its own and flags it', () => {
    const p = packBeats(
      ['Short.', 'A beat far too long for the box.', 'Tail.'],
      (t) => t.length <= 10,
    );
    expect(p.texts).toEqual(['Short.', 'A beat far too long for the box.', 'Tail.']);
    expect(p.over).toEqual([false, true, false]);
  });

  it('never loses or repeats a beat: the pages joined are the beats joined', () => {
    for (let cols = 12; cols < 80; cols += 7) {
      for (let lines = 1; lines <= 3; lines++) {
        const p = packBeats(BEATS, fitsIn(cols, lines), [3]);
        expect(p.texts.join(' ')).toBe(BEATS.join(' '));
        expect(p.starts[0]).toBe(0);
        expect(p.starts).toEqual([...p.starts].sort((a, b) => a - b));
      }
    }
  });

  it('is greedy: no page could have taken the first beat of the next', () => {
    const fits = fitsIn(20, 2);
    const p = packBeats(BEATS, fits);
    p.texts.forEach((t, i) => {
      const next = BEATS[p.starts[i + 1] ?? -1];
      if (next !== undefined) expect(fits(`${t} ${next}`)).toBe(false);
    });
  });

  it('can start partway through the beats', () => {
    const p = packBeats(BEATS, () => true, [], 2);
    expect(p.texts).toEqual([BEATS.slice(2).join(' ')]);
    expect(p.starts).toEqual([2]);
  });
});

describe('paginate', () => {
  const scenes: PackScene[] = [
    { beats: BEATS },
    { beats: ['Up we go.', 'A hatch slid open.', 'Higher.'], breaks: [1] },
  ];

  it('never joins beats across a scene boundary', () => {
    const p = paginate(scenes, { fits: () => true });
    expect(p.map((s) => s.texts)).toEqual([
      [BEATS.join(' ')],
      ['Up we go.', 'A hatch slid open. Higher.'],
    ]);
  });

  it('packs the last page of the last scene again for a narrower box', () => {
    const wide = (t: string): boolean => t.length <= 40;
    const narrow = (t: string): boolean => t.length <= 20;
    const plain = paginate(scenes, { fits: wide });
    const withLast = paginate(scenes, { fits: wide, fitsLast: narrow });
    expect(plain[1]?.texts).toEqual(['Up we go.', 'A hatch slid open. Higher.']);
    expect(withLast[1]?.texts).toEqual(['Up we go.', 'A hatch slid open.', 'Higher.']);
    expect(withLast[1]?.starts).toEqual([0, 1, 2]);
    // The scenes before it are not touched.
    expect(withLast[0]).toEqual(plain[0]);
  });

  it('leaves the last scene alone when the narrow fit changes nothing', () => {
    const fits = (t: string): boolean => t.length <= 40;
    expect(paginate(scenes, { fits, fitsLast: fits })).toEqual(paginate(scenes, { fits }));
  });
});

describe('beats and pages', () => {
  it('gives every beat a page when nothing is packed', () => {
    const p = singleBeats([{ beats: BEATS }]);
    expect(p[0]?.texts).toEqual(BEATS);
    expect(p[0]?.starts).toEqual([0, 1, 2, 3]);
  });

  it('finds the page that holds a beat', () => {
    const starts = [0, 2, 5];
    expect([0, 1, 2, 3, 4, 5, 9].map((b) => pageOfBeat(starts, b))).toEqual([0, 0, 1, 1, 1, 2, 2]);
    expect(pageOfBeat([], 3)).toBe(0);
  });

  it('keeps the place across a re-pack: the new page holds the start of the old one', () => {
    const beats = Array.from({ length: 12 }, (_, i) => `Beat number ${i}.`);
    const wide = packBeats(beats, fitsIn(50, 3));
    const narrow = packBeats(beats, fitsIn(22, 2));
    for (let page = 0; page < wide.starts.length; page++) {
      const start = wide.starts[page]!;
      const moved = pageOfBeat(narrow.starts, start);
      expect(narrow.starts[moved]!).toBeLessThanOrEqual(start);
      expect(narrow.starts[moved + 1] ?? Infinity).toBeGreaterThan(start);
    }
  });

  it('counts a tap for every page of every scene', () => {
    expect(tapCount(paginate([{ beats: BEATS }, { beats: BEATS }], { fits: () => true }))).toBe(2);
    expect(tapCount(singleBeats([{ beats: BEATS }, { beats: BEATS }]))).toBe(8);
    expect(tapCount([])).toBe(0);
  });

  it('counts the characters two texts share', () => {
    expect(commonPrefix('abcdef', 'abcxyz')).toBe(3);
    expect(commonPrefix('abc', 'abcdef')).toBe(3);
    expect(commonPrefix('', 'a')).toBe(0);
  });
});

describe('allowedLines', () => {
  // The real strips: 16 px of padding, a 30 px line and a 48 px button.
  const strip = { lineHeight: 30, chrome: 16, floor: 48 };

  it('is three when three lines stay within 30 % of the height, otherwise two', () => {
    // 106 px for three lines.
    expect(allowedLines({ ...strip, height: 390 })).toBe(3);
    expect(allowedLines({ ...strip, height: 360 })).toBe(3);
    expect(allowedLines({ ...strip, height: 354 })).toBe(3);
    expect(allowedLines({ ...strip, height: 353 })).toBe(2);
    expect(allowedLines({ ...strip, height: 320 })).toBe(2);
  });

  it('never goes under two lines, however short the screen', () => {
    expect(allowedLines({ ...strip, height: 100 })).toBe(2);
  });

  it('counts the button when it is taller than the text', () => {
    expect(
      allowedLines({ lineHeight: 10, chrome: 16, floor: 48, height: 100, maxShare: 0.5, least: 1 }),
    ).toBe(1);
    expect(
      allowedLines({
        lineHeight: 10,
        chrome: 16,
        floor: 48,
        height: 160,
        maxShare: 0.5,
        most: 4,
        least: 1,
      }),
    ).toBe(4);
  });

  it('follows the share it is given', () => {
    expect(allowedLines({ ...strip, height: 320, maxShare: 0.35 })).toBe(3);
    expect(allowedLines({ ...strip, height: 390, maxShare: 0.2 })).toBe(2);
  });
});
