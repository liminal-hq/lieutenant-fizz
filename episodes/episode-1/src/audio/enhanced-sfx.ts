// The Enhanced sound effects: Classic's voices reshaped the way an AdLib sound chip shaped its effects.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { noteHz, type SfxVoice } from '@lieutenant-fizz/engine/audio';

// A chip like the OPL2 moved an effect's pitch every 1/140 s, and its filter-like modulator opened at each
// note's attack and closed as it settled. Classic's effects are one note per voice with a fixed filter, so
// Enhanced builds three of the chip's tricks out of the same Undertone voices:
//
// - a pitch curve, as a chain of very short notes that each sit at the next pitch (Undertone's `slide`
//   only falls, from an octave above the note);
// - a filter that opens at the attack and closes as the note settles, with a soft sine partner on the same
//   note, which gives a note the front and the fall a chip's envelopes gave it;
// - a quiet, short bell partial on the top notes of the jingles.
//
// Every effect keeps its length and its place in the mix, so Enhanced only adds to the sound.

const isNoise = (name: string): boolean => name === 'white' || name === 'pink' || name === 'brown';

/** A pitch curve: the shape of the pitch over the effect, in semitones from `from`. */
export interface Curve {
  shape: 'rise' | 'fall' | 'riseFall' | 'wobble' | 'fallWobble' | 'fallJitter';
  /** The starting note. */
  from: string;
  /** How far the pitch travels, in semitones (for a wobble, the size of the swing). */
  semitones: number;
  seconds: number;
  wave: NonNullable<SfxVoice['w']>;
  gain: number;
  lpf?: number;
  /** Seconds to wait before the curve starts. */
  start?: number;
  /** Wobbles a second, for the wobble shapes. */
  rate?: number;
}

/** The time between the short notes of a curve. */
const STEP = 0.025;

/** The pitch offset in semitones at `u` through the curve (0 to 1). */
function offsetAt(curve: Curve, u: number, step: number): number {
  const swing = curve.semitones;
  const wobble = (rate: number): number => Math.sin(2 * Math.PI * rate * curve.seconds * u);
  switch (curve.shape) {
    case 'rise':
      return swing * u;
    case 'fall':
      return -swing * u;
    case 'riseFall':
      return swing * Math.sin(Math.PI * u);
    case 'wobble':
      return swing * (1 - u) * wobble(curve.rate ?? 8);
    case 'fallWobble':
      return -swing * u + 0.6 * wobble(curve.rate ?? 14);
    case 'fallJitter':
      // A fixed pseudo-random jitter, so the effect sounds the same every time.
      return -swing * u + (((step * 7919) % 13) - 6) * 0.12;
  }
}

/** A curve as a run of short notes, one every 25 ms, each at the next pitch on the shape. */
export function curveVoices(curve: Curve): SfxVoice[] {
  const base = noteHz(curve.from);
  const count = Math.max(2, Math.ceil(curve.seconds / STEP));
  return Array.from({ length: count }, (_, step): SfxVoice => {
    const u = step / (count - 1);
    const voice: SfxVoice = {
      n: curve.from,
      hz: base * 2 ** (offsetAt(curve, u, step) / 12),
      w: curve.wave,
      a: 0.002,
      d: STEP * 1.5,
      r: 0.012,
      // The sound fades gently along the curve, as the chip's carriers do.
      g: curve.gain * (1 - 0.55 * u),
      nudge: (curve.start ?? 0) + step * STEP,
    };
    if (curve.lpf) voice.lpf = curve.lpf;
    return voice;
  });
}

/**
 * The effects that gain a pitch curve: which of Classic's voices (by index) the curves replace, and the
 * curves that take their place. Every other voice stays, shaped as below.
 */
export const CURVES: Record<string, { drop: number[]; add: Curve[] }> = {
  jump: {
    drop: [0, 1],
    add: [
      {
        shape: 'rise',
        from: 'e4',
        semitones: 9,
        seconds: 0.08,
        wave: 'square',
        gain: 0.2,
        lpf: 2600,
      },
    ],
  },
  boing: {
    drop: [0, 1],
    add: [
      {
        shape: 'wobble',
        from: 'g3',
        semitones: 5,
        rate: 9,
        seconds: 0.4,
        wave: 'triangle',
        gain: 0.42,
      },
    ],
  },
  sproing: {
    drop: [0, 1, 2],
    add: [
      { shape: 'rise', from: 'c3', semitones: 24, seconds: 0.15, wave: 'triangle', gain: 0.4 },
      {
        shape: 'wobble',
        from: 'c5',
        semitones: 3,
        rate: 12,
        seconds: 0.25,
        wave: 'sine',
        gain: 0.22,
        start: 0.15,
      },
    ],
  },
  vworp: {
    drop: [0],
    add: [
      {
        shape: 'riseFall',
        from: 'c5',
        semitones: 12,
        seconds: 0.42,
        wave: 'sawtooth',
        gain: 0.18,
        lpf: 2000,
      },
    ],
  },
  zap: {
    drop: [0],
    add: [
      {
        shape: 'fall',
        from: 'e5',
        semitones: 24,
        seconds: 0.1,
        wave: 'square',
        gain: 0.14,
        lpf: 2500,
      },
    ],
  },
  zzzap: {
    drop: [0],
    add: [
      {
        shape: 'fallJitter',
        from: 'c6',
        semitones: 24,
        seconds: 0.28,
        wave: 'sawtooth',
        gain: 0.2,
        lpf: 3000,
      },
    ],
  },
  hurt: {
    drop: [0, 1],
    add: [
      {
        shape: 'fallWobble',
        from: 'a3',
        semitones: 12,
        seconds: 0.46,
        wave: 'square',
        gain: 0.3,
        lpf: 900,
      },
    ],
  },
  // A slow falling alarm under the low sting: the AdLib way to make a note feel menacing.
  stinger: {
    drop: [],
    add: [
      {
        shape: 'fall',
        from: 'e4',
        semitones: 12,
        seconds: 1,
        wave: 'sawtooth',
        gain: 0.08,
        lpf: 700,
        start: 0.1,
      },
    ],
  },
  stun: {
    drop: [0],
    add: [
      {
        shape: 'wobble',
        from: 'a4',
        semitones: 3,
        rate: 18,
        seconds: 0.16,
        wave: 'square',
        gain: 0.2,
        lpf: 1500,
      },
    ],
  },
};

/** A bell-like partial on one voice (by index) of a jingle. */
interface Partial {
  voice: number;
  ratio: number;
  gain: number;
  decay: number;
}

/**
 * The AdLib effects often put the modulator at a non-whole multiple of the carrier, which makes a
 * metallic, bell-like tone. A quiet sine at an inharmonic multiple of the note stands in for it. It
 * strikes with the note and dies well before it, so it adds a glint to the attack and never rings on at
 * the end of the effect.
 */
export const PARTIALS: Record<string, Partial[]> = {
  win: [
    { voice: 4, ratio: 2.76, gain: 0.3, decay: 0.12 },
    { voice: 3, ratio: 2.76, gain: 0.18, decay: 0.05 },
  ],
  life: [{ voice: 3, ratio: 2.76, gain: 0.2, decay: 0.1 }],
  usb: [{ voice: 3, ratio: 2.76, gain: 0.3, decay: 0.12 }],
  key: [{ voice: 2, ratio: 2.76, gain: 0.3, decay: 0.08 }],
};

/** The frequencies a wave carries besides its pitch: triangle and square have the odd multiples, saw all. */
function harmonicsOf(wave: SfxVoice['w'], hz: number): number[] {
  const multiples =
    wave === 'sine' ? [1] : wave === 'sawtooth' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 3, 5, 7, 9];
  return multiples.map((multiple) => multiple * hz);
}

/**
 * The ratio for a bell partial on this voice. A partial that lands close to one of the voice's own
 * harmonics beats against it and sounds rough (the third harmonic of a triangle sits only about a fifth
 * of an octave from 2.76 times its pitch), so such a voice gets whichever ratio is furthest from them as
 * a share of the ear's critical band, while the partial stays inharmonic.
 */
export function partialRatio(voice: SfxVoice, wanted: number): number {
  const hz = noteHz(voice.n);
  const score = (ratio: number): number => {
    const partial = hz * ratio;
    const nearest = Math.min(
      ...harmonicsOf(voice.w ?? 'triangle', hz).map((h) => Math.abs(h - partial)),
    );
    return nearest / Math.max(100, partial * 0.2);
  };
  if (score(wanted) >= 1) return wanted;
  return [2.4, 3.6, 3.3, 4.4, 5.4].reduce(
    (best, ratio) => (score(ratio) > score(best) ? ratio : best),
    wanted,
  );
}

function partialVoice(voice: SfxVoice, partial: Partial): SfxVoice {
  const hz = noteHz(voice.n) * partialRatio(voice, partial.ratio);
  // The ear is far more sensitive around 3 to 4 kHz than at the note itself, so a partial that high is
  // turned down as it goes up (about 1.5 kHz is left as it is).
  const hearing = Math.min(1, 1500 / hz);
  return {
    n: voice.n,
    hz,
    w: 'sine',
    a: 0.001,
    d: partial.decay,
    r: 0.03,
    g: voice.g * partial.gain * hearing,
    nudge: voice.nudge ?? 0,
  };
}

/**
 * One of Classic's pitched voices with the chip's shaping: a filter that opens at the attack and closes
 * as the note settles, and for the longer voices a soft sine partner on the same note a couple of
 * milliseconds late. Noise has no pitch to shape, and a deep thump gains nothing from a brighter attack.
 */
function shaped(voice: SfxVoice): SfxVoice[] {
  if (isNoise(voice.n) || noteHz(voice.n) < 100) return [voice];
  const cutoff = voice.lpf ?? Math.min(6000, Math.max(1800, noteHz(voice.n) * 4));
  const main: SfxVoice = {
    ...voice,
    lpf: cutoff,
    lpenv: cutoff * 1.2,
    lpa: 0.001,
    lpd: Math.max(0.05, (voice.d ?? 0.1) * 1.2),
    lps: 0.2,
    lpr: voice.r ?? 0.05,
  };
  if ((voice.d ?? 0.1) < 0.08 || voice.w === 'sine') return [main];
  const { slide: _slide, ...rest } = voice;
  return [main, { ...rest, w: 'sine', g: voice.g * 0.35, nudge: (voice.nudge ?? 0) + 0.002 }];
}

/** The Enhanced voices of one effect: its voices shaped, with a pitch curve and bell partials where it has them. */
export function enhanceEffect(name: string, voices: readonly SfxVoice[]): SfxVoice[] {
  const curve = CURVES[name];
  const kept = voices.filter((_, index) => !curve?.drop.includes(index));
  return [
    ...kept.flatMap(shaped),
    ...(curve?.add.flatMap(curveVoices) ?? []),
    ...(PARTIALS[name]?.map((partial) => partialVoice(voices[partial.voice]!, partial)) ?? []),
  ];
}

/** The Enhanced version of every effect. */
export function enhanceSfx(sfx: Record<string, SfxVoice[]>): Record<string, SfxVoice[]> {
  return Object.fromEntries(
    Object.entries(sfx).map(([name, voices]) => [name, enhanceEffect(name, voices)]),
  );
}
