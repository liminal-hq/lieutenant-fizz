// Tests the intro and ending beats: their shape, their length and that docs/STORY.md carries the same intro.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CINE, CINE_TRACK, LIFTOFF_BEAT } from './story';

/** The longest beat that was measured to fit two lines at 640 px wide (the longest in the story is 84). */
const LONGEST_BEAT = 90;

const SCENES = [['intro', CINE]] as const;

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
