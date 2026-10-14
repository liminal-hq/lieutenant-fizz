// The launcher's score for an episode that is not out yet: a slow, dark loop in A phrygian, in Classic and Enhanced.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { MusicPart, MusicSong, MusicTrack } from '@lieutenant-fizz/engine/audio';
import { songFor, type SongDef } from '@lieutenant-fizz/engine/music-songs';

/** The name the score goes by in the launcher's music. */
export const TEASER_TRACK = 'teaser';

const P = (notes: string, o: Partial<MusicPart> = {}): MusicPart => ({
  notes,
  w: 'triangle',
  a: 0.005,
  d: 0.12,
  s: 0.3,
  r: 0.08,
  g: 0.2,
  ...o,
});

/**
 * The Classic loop: eight slow bars at 70 beats a minute, with the flat second (Bb over A) that makes the mood.
 * A held pad of open fifths, a bass that only ever stands on the root, a thin lead that wanders and stops, high
 * bells that answer it a long way off, a heartbeat once a bar and a breath of noise.
 */
export const TEASER_LOOP: MusicTrack = {
  bpm: 70,
  parts: [
    P(
      '<[a2,e3,a3] [a2,e3,a3] [a#2,f3,d4] [a2,e3,a3] [d3,a3,f4] [a2,e3,a3] [f2,c3,a3] [e2,b2,g#3]>',
      {
        role: 'pad',
        w: 'sine',
        a: 0.9,
        d: 0.6,
        s: 0.75,
        r: 1.6,
        g: 0.08,
        lpf: 1300,
        room: 0.6,
      },
    ),
    P('<a1 a1 a#1 a1 d2 a1 f1 e1>', { role: 'bass', g: 0.2, s: 0.8, r: 0.4 }),
    P(
      '<[a4 ~ ~ ~ c5 ~ b4 ~] [a4 ~ ~ ~ ~ ~ ~ ~] [a#4 ~ ~ ~ a4 ~ ~ ~] [e5 ~ ~ ~ ~ ~ ~ ~] [f5 ~ ~ e5 d5 ~ ~ ~] [c5 ~ ~ ~ a4 ~ ~ ~] [c5 ~ ~ ~ a4 ~ f4 ~] [g#4 ~ ~ ~ ~ ~ b4 ~]>',
      { role: 'lead', g: 0.06, d: 0.35, s: 0.25, r: 0.4, lpf: 2200, delay: 0.35, room: 0.4 },
    ),
    P('<[~ ~ ~ ~ e6 ~ ~ ~] [~ ~ d6 ~ ~ ~ ~ ~] [~ ~ ~ ~ ~ ~ f6 ~] [~ e6 ~ ~ ~ ~ ~ ~]>', {
      role: 'bell',
      w: 'sine',
      a: 0.002,
      d: 0.4,
      s: 0.05,
      r: 0.5,
      g: 0.045,
      delay: 0.55,
      room: 0.5,
    }),
    P('c1 ~ ~ ~ ~ ~ ~ ~', {
      role: 'kick',
      w: 'sine',
      d: 0.14,
      s: 0,
      r: 0.08,
      g: 0.28,
      slide: 0.09,
    }),
    P('~ ~ ~ ~ ~ white ~ ~', {
      role: 'hats',
      noise: true,
      d: 0.05,
      s: 0,
      r: 0.03,
      g: 0.025,
      hpf: 5000,
    }),
  ],
};

/** How the loop becomes a song: a fifth up for the contrast (E), no lift at the end, the pad arpeggiated. */
const SONG_DEF: SongDef = { trim: 0.9, contrast: 7, lift: 0, arp: true };

/** The Enhanced version: the loop written out as a song of about a minute, with the engine's depth and stereo. */
export const TEASER_SONG: MusicSong = songFor(TEASER_LOOP, SONG_DEF);
