// The opening titles' score, eight bars at 150 beats a minute, in Classic and Enhanced.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { MusicPart, MusicSong, MusicTrack } from '@lieutenant-fizz/engine/audio';
import { arpeggiate, transposeNotes } from '@lieutenant-fizz/engine/music-songs';

/** The name the score goes by in the music table. */
export const OPENING_TITLES_TRACK = 'openingTitles';

/**
 * One bar is 1.6 s at 150 bpm, and the sequence's sections land on bars:
 *
 *   bars 1-2  Presents  0.0-3.2 s   the Liminal HQ mark slides in (a whoosh and a falling bell sparkle), "presents"
 *   bars 3-4  Words     3.2-6.4 s   Lieutenant whips in on beat 1, Fizz on the and of 2, the slam on beat 4; a roll builds
 *   bars 5-8  Chase     6.4-12.8 s  the band drops in on the downbeat with the title theme, Ben running from the Zargs
 *
 * The harmony runs Cmaj7 Fmaj7 | Ab Bb | C Am F G: the flat-six and flat-seven under the words lift into the title's
 * own C major, and bar 8's G turns straight back into bar 1 as the picture fades to black.
 */
const BPM = 150;

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

// ---------- The bars, one string per part, eight bars each ----------

const PAD_CHORDS =
  '<[c4,e4,g4,b4] [f3,a3,c4,e4] [g#3,c4,d#4] [a#3,d4,f4] [c4,e4,g4] [a3,c4,e4] [f3,a3,c4] [g3,b3,d4]>';

/** The lead: silent under the logo, three hits for the words and the pickup, then the title theme's first four bars. */
const LEAD =
  '<~ ~ [g#4 ~ ~ c5 ~ ~ d#5 ~] [~ ~ ~ ~ a#4 d5 f5 g5] [c5 ~ g4 c5 e5 g5 e5 c5] [a4 ~ e4 a4 c5 e5 c5 a4] [f4 a4 c5 f5 e5 c5 a4 c5] [g4 b4 d5 g5 f5 d5 b4 g4]>';

/** The sparkle as the mark lands (falling through Cmaj7), and an answer as "presents" comes up. */
const BELL = '<[e6 ~ b5 ~ g5 ~ e5 c6] [~ ~ a5 ~ e6 ~ ~ ~] ~ ~ ~ ~ ~ ~>';

/** Roots held under the logo, pumping octaves under the words and the chase. */
const BASS =
  '<c2 f1 [g#1 g#2]*4 [a#1 a#2 a#1 a#2 a#1 a#2 c3 d3] [c2 c3]*4 [a1 a2]*4 [f1 f2]*4 [g1 g2 g1 g2 g1 g2 b1 d2]>';

/** Sixteenths climbing the chord under the words; the chase keeps them going an octave down from the lead. */
const ARP =
  '<~ ~ [g#3 c4 d#4 c4]*4 [a#3 d4 f4 d4]*4 [c4 e4 g4 e4]*4 [a3 c4 e4 c4]*4 [f3 a3 c4 a3]*4 [g3 b3 d4 b3]*4>';

const KICK =
  '<~ ~ [c1 ~ ~ c1 ~ ~ c1 ~] [c1 ~ c1 ~ c1 c1 c1 c1] [c1 ~ ~ c1 c1 ~ ~ ~] [c1 ~ ~ c1 c1 ~ ~ ~] [c1 ~ ~ c1 c1 ~ ~ ~] [c1 ~ ~ c1 c1 ~ c1 ~]>';

/** The slam on beat 4 of bar 3, a roll that doubles up through bar 4, then the backbeat. */
const SNARE =
  '<~ ~ [~ ~ ~ ~ ~ ~ white ~] [~ white ~ white [white white] [white white] [white white white white] [white white white white]] [~ white ~ white] [~ white ~ white] [~ white ~ white] [~ white ~ white]>';

const HATS = '<~ [~ white]*4 white*8 white*8 white*8 white*8 white*8 white*8>';

/** Whooshes: the mark sliding in, Lieutenant and Fizz whipping across, Ben bursting on. */
const WHOOSH = '<[white ~ ~ ~ ~ ~ ~ ~] ~ [white ~ ~ white ~ ~ ~ ~] ~ [white ~ ~ ~ ~ ~ ~ ~] ~ ~ ~>';

/** A crash on the slam and on the chase's downbeat. */
const CRASH = '<~ ~ [~ ~ ~ ~ ~ ~ white ~] ~ white ~ ~ ~>';

// ---------- Classic ----------

/**
 * The Classic loop: the eight bars as one track, as the game's other cues are written. A square lead as the title
 * theme has, a quiet sine pad, a triangle bass, a soft square arpeggio and the kit; the levels sit with the title.
 */
export const OPENING_TITLES_LOOP: MusicTrack = {
  bpm: BPM,
  parts: [
    P(LEAD, { role: 'lead', w: 'square', g: 0.075, lpf: 2600, d: 0.1 }),
    P(PAD_CHORDS, {
      role: 'pad',
      w: 'sine',
      a: 0.05,
      d: 0.5,
      s: 0.7,
      r: 1.1,
      g: 0.05,
      lpf: 1400,
      room: 0.3,
    }),
    P(BELL, {
      role: 'bell',
      w: 'sine',
      a: 0.002,
      d: 0.35,
      s: 0.05,
      r: 0.4,
      g: 0.08,
      delay: 0.4,
    }),
    P(BASS, { role: 'bass', g: 0.3, s: 0.45 }),
    P(ARP, { role: 'arp', w: 'square', g: 0.035, lpf: 1800, d: 0.06 }),
    P(KICK, { role: 'kick', w: 'sine', d: 0.12, s: 0, r: 0.06, g: 0.6, slide: 0.09 }),
    P(SNARE, { role: 'snare', noise: true, d: 0.09, s: 0, r: 0.05, g: 0.24, hpf: 1600 }),
    P(HATS, { role: 'hats', noise: true, d: 0.03, s: 0, r: 0.01, g: 0.08, hpf: 6000 }),
    P(WHOOSH, { role: 'perc', noise: true, a: 0.06, d: 0.28, s: 0, r: 0.1, g: 0.12, hpf: 2500 }),
    P(CRASH, { role: 'perc', noise: true, a: 0.001, d: 0.7, s: 0, r: 0.3, g: 0.12, hpf: 4500 }),
  ],
};

// ---------- Enhanced ----------

/** Picks one section's bars out of an eight-bar `<...>` string: `bars(LEAD, 4, 8)` is the chase's four. */
function bars(notes: string, from: number, to: number): string {
  const inner = notes.trim().replace(/^<|>$/g, '');
  const items: string[] = [];
  let depth = 0;
  let item = '';
  for (const ch of inner) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ' ' && depth === 0) {
      if (item) items.push(item);
      item = '';
    } else item += ch;
  }
  if (item) items.push(item);
  return `<${items.slice(from, to).join(' ')}>`;
}

/**
 * The depth the engine's songs give a voice (as `withDepth` in music-songs does): a filter that opens at the attack
 * and closes as the note settles, and for a melodic part a sine partner a few milliseconds late, panned opposite.
 */
function depth(part: MusicPart, side: number): MusicPart[] {
  if (part.noise || part.role === 'kick') return [part];
  const slow = part.role === 'pad' || part.role === 'drone';
  const cutoff = part.lpf ?? 2600;
  const main: MusicPart = {
    ...part,
    g: part.g * (slow ? 1 : 0.85),
    lpf: cutoff,
    lpenv: cutoff * (slow ? 0.8 : 1.4),
    lpa: slow ? 0.3 : 0.001,
    lpd: slow ? 1 : Math.min(0.4, Math.max(0.08, (part.d ?? 0.12) * 1.5)),
    lps: 0.2,
    lpr: part.r ?? 0.08,
  };
  if (slow) return [main];
  return [
    main,
    {
      ...part,
      w: 'sine',
      g: part.g * 0.5,
      a: Math.max(part.a ?? 0.005, 0.01),
      s: Math.max(part.s ?? 0.3, 0.5),
      lpf: 3200,
      nudge: 0.002,
      mirror: side,
    },
  ];
}

type Voices = Record<string, MusicPart>;

const lead = OPENING_TITLES_LOOP.parts[0]!;
const pad = OPENING_TITLES_LOOP.parts[1]!;
const bell = OPENING_TITLES_LOOP.parts[2]!;
const bass = OPENING_TITLES_LOOP.parts[3]!;
const arp = OPENING_TITLES_LOOP.parts[4]!;
const kick = OPENING_TITLES_LOOP.parts[5]!;
const snare = OPENING_TITLES_LOOP.parts[6]!;
const hats = OPENING_TITLES_LOOP.parts[7]!;
const whoosh = OPENING_TITLES_LOOP.parts[8]!;
const crash = OPENING_TITLES_LOOP.parts[9]!;

const cut = (part: MusicPart, from: number, to: number, o: Partial<MusicPart> = {}): MusicPart => ({
  ...part,
  notes: bars(part.notes, from, to),
  ...o,
});

/**
 * Presents: the room opens up. The pad is wider and wetter, the bell sparkle is doubled an octave up and echoes,
 * a pink-noise swell rises through bar 2 into the words, and the bass only stands on its roots.
 */
const PRESENTS: Voices = {
  pad: cut(pad, 0, 2, { g: 0.07, a: 0.4, room: 0.6 }),
  bell: cut(bell, 0, 2, { g: 0.09, delay: 0.45, room: 0.5 }),
  bellHigh: cut(bell, 0, 2, {
    notes: transposeNotes(bars(BELL, 0, 2), 12),
    g: 0.035,
    delay: 0.5,
    room: 0.6,
  }),
  bass: cut(bass, 0, 2, { s: 0.8, r: 0.6, g: 0.22 }),
  hats: cut(hats, 0, 2, { g: 0.05 }),
  whoosh: cut(whoosh, 0, 2),
  swell: P('<~ pink>', {
    role: 'perc',
    noise: true,
    a: 1.4,
    d: 0.2,
    s: 0.8,
    r: 0.05,
    g: 0.08,
    lpf: 3000,
  }),
};

/**
 * Words: the hits. The lead's three notes are doubled by a sawtooth brass an octave down, so Lieutenant, Fizz and
 * the slam land hard; the arpeggio climbs under them, and the roll doubles up through bar 4 as Classic's does.
 */
const WORDS: Voices = {
  lead: cut(lead, 2, 4),
  brass: cut(lead, 2, 4, {
    notes: transposeNotes(bars(LEAD, 2, 4), -12),
    role: 'counter',
    w: 'sawtooth',
    g: 0.05,
    lpf: 1600,
    d: 0.18,
    s: 0.2,
  }),
  pad: cut(pad, 2, 4, { g: 0.06 }),
  bass: cut(bass, 2, 4),
  arp: cut(arp, 2, 4),
  kick: cut(kick, 2, 4),
  snare: cut(snare, 2, 4),
  hats: cut(hats, 2, 4),
  whoosh: cut(whoosh, 2, 4),
  crash: cut(crash, 2, 4),
};

/**
 * Chase: the full band on the title theme, with the theme doubled an octave up as the engine's last tune is, the
 * pad spread into an eighth-note arpeggio, and the backbeat. Bar 8 ends on G so the loop turns back to bar 1.
 */
const CHASE: Voices = {
  lead: cut(lead, 4, 8),
  octave: cut(lead, 4, 8, { notes: transposeNotes(bars(LEAD, 4, 8), 12), g: lead.g * 0.55 }),
  pad: cut(pad, 4, 8),
  padArp: {
    ...pad,
    notes: transposeNotes(arpeggiate(bars(PAD_CHORDS, 4, 8)), 12),
    role: 'arp',
    w: 'triangle',
    a: 0.005,
    d: 0.1,
    s: 0.2,
    r: 0.1,
    g: 0.05,
    lpf: 2400,
    room: 0.3,
  },
  bass: cut(bass, 4, 8),
  arp: cut(arp, 4, 8, { g: 0.03 }),
  kick: cut(kick, 4, 8),
  snare: cut(snare, 4, 8),
  hats: cut(hats, 4, 8),
  whoosh: cut(whoosh, 4, 8),
  crash: cut(crash, 4, 8),
};

const SECTIONS: { cycles: number; voices: Voices }[] = [
  { cycles: 2, voices: PRESENTS },
  { cycles: 2, voices: WORDS },
  { cycles: 4, voices: CHASE },
];

/** A level trim that keeps the summed peak under about 0.9, as the other songs have. */
const TRIM = 0.8;

/** The Enhanced version: the three sections as one stream per voice, each with the engine's depth and stereo. */
export const OPENING_TITLES_SONG: MusicSong = (() => {
  const keys = [...new Set(SECTIONS.flatMap((section) => Object.keys(section.voices)))];
  const streams: (MusicPart | null)[][] = [];
  keys.forEach((key, index) => {
    const side = index % 2 === 0 ? -0.22 : 0.22;
    const voicesIn = (voices: Voices): MusicPart[] | undefined => {
      const part = voices[key];
      return part ? depth({ ...part, g: part.g * TRIM }, side) : undefined;
    };
    const first = SECTIONS.map((section) => voicesIn(section.voices)).find(Boolean);
    if (!first) return;
    for (let layer = 0; layer < first.length; layer++) {
      streams.push(SECTIONS.map((section) => voicesIn(section.voices)?.[layer] ?? null));
    }
  });
  return { bpm: BPM, cycles: SECTIONS.map((section) => section.cycles), streams };
})();
