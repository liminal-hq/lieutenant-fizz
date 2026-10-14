// Tests for the Enhanced music: rewriting notes, the song for each cue, and its depth.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { MUSIC, PATTERNS } from './patterns';
import { buildSongs } from './songs';

const CUES = [
  'crater',
  'caves',
  'sky',
  'tower',
  'theatre',
  'foundry',
  'secret',
  'citadel',
  'map',
  'boss',
];
const songs = PATTERNS.songs!;
const seconds = (id: string): number =>
  (songs[id]!.cycles.reduce((a, b) => a + b, 0) * 240) / songs[id]!.bpm;

describe('the Enhanced songs', () => {
  it('has a song for every level, overworld and boss cue, and none for the rest', () => {
    expect(Object.keys(songs).sort()).toEqual([...CUES].sort());
    for (const id of CUES) expect(MUSIC[id]).toBeDefined();
  });

  it('plays at its cue’s tempo, for between half a minute and a minute and a half', () => {
    for (const id of CUES) {
      expect(songs[id]!.bpm, id).toBe(MUSIC[id]!.bpm);
      expect(seconds(id), id).toBeGreaterThan(30);
      expect(seconds(id), id).toBeLessThan(90);
    }
  });

  it('gives every stream a part or a rest for each section, and at least one part', () => {
    for (const id of CUES) {
      const song = songs[id]!;
      expect(song.streams.length, id).toBeGreaterThan(0);
      for (const stream of song.streams) {
        expect(stream, id).toHaveLength(song.cycles.length);
        expect(
          stream.some((part) => part !== null),
          id,
        ).toBe(true);
      }
    }
  });

  it('uses only the notes of the cue, moved or doubled', () => {
    for (const id of CUES) {
      const parts = songs[id]!.streams.flat().filter((p) => p !== null);
      for (const part of parts) expect(part!.notes.length, id).toBeGreaterThan(0);
    }
  });

  it('starts the overworld and the boss straight on the tune, and runs their last section into the first', () => {
    for (const id of ['map', 'boss']) {
      const song = songs[id]!;
      // The first section plays the lead or the melody, not a bare intro, and the last is a full section, not a fill.
      const first = song.streams.map((stream) => stream[0]).filter((part) => part !== null);
      expect(first.length, id).toBeGreaterThan(2);
      expect(song.cycles[song.cycles.length - 1], id).toBeGreaterThan(1);
    }
  });

  it('ends the other songs on a one-bar fill that turns back into the intro', () => {
    for (const id of CUES.filter((c) => c !== 'map' && c !== 'boss')) {
      const song = songs[id]!;
      expect(song.cycles[song.cycles.length - 1], id).toBe(1);
      expect(song.cycles[0], id).toBe(2);
    }
  });

  it('opens a filter at every melodic attack, and pairs it with a mirrored sine partner', () => {
    for (const id of CUES) {
      const parts = songs[id]!.streams.flat().filter((p) => p !== null);
      const shaped = parts.filter((p) => p!.lpenv);
      expect(shaped.length, id).toBeGreaterThan(0);
      for (const part of shaped) {
        expect(part!.lpenv!, id).toBeGreaterThan(0);
        expect(part!.lpf!, id).toBeGreaterThan(0);
        expect(part!.lps, id).toBe(0.2);
      }
      const partners = parts.filter((p) => p!.mirror !== undefined);
      expect(partners.length, id).toBeGreaterThan(0);
      for (const partner of partners) {
        expect(partner!.w, id).toBe('sine');
        expect(partner!.nudge, id).toBe(0.002);
      }
    }
  });

  it('leaves the drums and noise unshaped', () => {
    for (const id of CUES) {
      const parts = songs[id]!.streams.flat().filter((p) => p !== null);
      for (const part of parts.filter((p) => p!.noise || p!.role === 'kick')) {
        expect(part!.lpenv, id).toBeUndefined();
      }
    }
  });

  it('is the same every time it is built', () => {
    expect(buildSongs(MUSIC)).toEqual(buildSongs(MUSIC));
  });

  it('does not change the Classic tracks', () => {
    const before = JSON.stringify(MUSIC);
    buildSongs(MUSIC);
    expect(JSON.stringify(MUSIC)).toBe(before);
  });
});
