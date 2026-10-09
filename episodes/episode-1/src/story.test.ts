// Tests the intro and ending beats: their shape, their length and that docs/STORY.md carries the same intro.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { paginate } from '@lieutenant-fizz/engine/story-pages';
import { CINE, CINE_TRACK, END, LIFTOFF_BEAT } from './story';

/** The longest beat that was measured to fit two lines at 640 px wide (the longest in the story is 84). */
const LONGEST_BEAT = 90;

const SCENES = [
  ['intro', CINE],
  ['ending', END],
] as const;

describe.each(SCENES)('the %s', (_name, scenes) => {
  it('has places and beats that are non-empty and trimmed', () => {
    for (const s of scenes) {
      expect(s.place.trim()).toBe(s.place);
      expect(s.place.length).toBeGreaterThan(0);
      expect(s.beats.length).toBeGreaterThan(0);
      for (const b of s.beats) {
        expect(b, b).toBe(b.trim());
        expect(b.length, b).toBeGreaterThan(0);
        expect(b.length, b).toBeLessThanOrEqual(LONGEST_BEAT);
      }
    }
  });

  it('keeps curly quotes whole inside a beat, with no double hyphen or double space', () => {
    for (const b of scenes.flatMap((s) => s.beats)) {
      expect([...b].filter((c) => c === '“').length, b).toBe(
        [...b].filter((c) => c === '”').length,
      );
      expect(b).not.toContain('--');
      expect(b).not.toMatch(/\s{2,}/);
    }
  });

  it('has no beat twice', () => {
    const all = scenes.flatMap((s) => s.beats);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('the intro', () => {
  it('is eight scenes and 40 beats, with a music track for each scene', () => {
    expect(CINE).toHaveLength(8);
    expect(CINE.flatMap((s) => s.beats)).toHaveLength(40);
    expect(CINE.map((s) => s.beats.length)).toEqual([4, 5, 3, 7, 6, 4, 5, 6]);
    expect(CINE_TRACK).toHaveLength(CINE.length);
  });

  it('launches the saucer on the beat that opens the hatch', () => {
    expect(CINE[2]?.place).toBe('Liftoff');
    expect(CINE[2]?.beats[LIFTOFF_BEAT]).toMatch(/^A hatch in the lawn/);
  });

  it('always starts a page at the beat that opens the hatch, and nowhere else is forced', () => {
    expect(CINE.map((s) => s.breaks ?? [])).toEqual([[], [], [LIFTOFF_BEAT], [], [], [], [], []]);
    const pages = paginate(CINE, { fits: () => true });
    expect(pages[2]?.starts).toEqual([0, LIFTOFF_BEAT]);
    expect(pages[2]?.texts[1]).toMatch(/^A hatch in the lawn slid open\./);
  });

  it('packs into the author paragraph of each scene when everything fits one page', () => {
    const pages = paginate(CINE, { fits: () => true });
    CINE.forEach((s, i) => {
      expect(pages[i]?.texts.join(' '), s.place).toBe(s.beats.join(' '));
      expect(pages[i]?.texts.length, s.place).toBe(i === 2 ? 2 : 1);
    });
  });

  it('is the intro that docs/STORY.md lists', () => {
    const doc = readFileSync(new URL('../../../docs/STORY.md', import.meta.url), 'utf8');
    const section = doc.split('\n## ').find((s) => s.startsWith('Opening cinematic')) ?? '';
    const listed: { place: string; beats: string[] }[] = [];
    for (const line of section.split('\n')) {
      const head = /^### \d+\. (.+)$/.exec(line);
      const beat = /^\d+\. (.+)$/.exec(line);
      if (head) listed.push({ place: head[1]!, beats: [] });
      else if (beat) listed.at(-1)?.beats.push(beat[1]!);
    }
    expect(listed).toEqual(CINE.map((s) => ({ place: s.place, beats: [...s.beats] })));
  });
});

/** The ending as the game had it before it was cut into beats: the beats only split it, so nothing is dropped. */
const ENDING_BEFORE = [
  "The gold USB drive slid into the security terminal with a satisfying click. Lines of green text raced up the screen. Mildred's security system blinked, sputtered, and gave up.",
  'The cage door swung open. Billy stepped out, straightened his football helmet and grinned. “Took you long enough, Lieutenant Fizz.”',
  "Somewhere above, a hatch slammed. Mildred McMire's voice echoed down the chocolate halls: “This isn't over, Ben Blaze! Mortimer and I have plenty more castles to build!”",
  "The cousins raced back to the spaghetti with meatballs flying saucer, its hold stuffed with every cocoa bean the Zargs had taken. Earth's chocolate was safe — for now.",
];

describe('the ending', () => {
  it('is four scenes and 12 beats', () => {
    expect(END).toHaveLength(4);
    expect(END.map((s) => s.beats.length)).toEqual([3, 3, 3, 3]);
  });

  it('is the game text before the beats, split and not edited', () => {
    expect(END.map((s) => s.beats.join(' '))).toEqual(ENDING_BEFORE);
  });

  // docs/STORY.md still lists a shorter paraphrase of the ending; which text is canonical is undecided,
  // so it is deliberately not compared here.
});
