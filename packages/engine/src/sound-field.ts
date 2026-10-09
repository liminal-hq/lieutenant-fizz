// Pure sound-field maths: where a sound sits on screen, and how that maps to pan and loudness.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Classic plays today's sound untouched; Enhanced places sound effects in the stereo field. */
export type AudioMode = 'classic' | 'enhanced';

/**
 * The mode a player gets when nothing chose one. Enhanced is the default; Classic stays available
 * with `?audio=classic` until the Options row lands. `GameAudio` itself still starts in Classic, so
 * the engine never changes behaviour unless a game asks for a mode.
 */
export const AUDIO_DEFAULT: AudioMode = 'enhanced';

/** Reads a `?audio=` value: `classic` or `enhanced` choose a mode, anything else chooses nothing. */
export function parseAudioParam(value: string | null | undefined): AudioMode | undefined {
  return value === 'classic' || value === 'enhanced' ? value : undefined;
}

/** The mode in effect: the one chosen explicitly, or `AUDIO_DEFAULT`. */
export function resolveAudioMode(chosen: AudioMode | undefined): AudioMode {
  return chosen ?? AUDIO_DEFAULT;
}

/** Where a sound sits: `pan` from -1 (left) to 1 (right), and a loudness multiplier. */
export interface SoundAt {
  pan: number;
  gain: number;
}

/** How a world position becomes a place in the field. */
export interface FieldTuning {
  /** The widest pan, reached at or beyond the screen edge. */
  width: number;
  /** Distance, in half-screens from the camera, inside which a sound is at full level. */
  near: number;
  /** Level lost per half-screen beyond `near`. */
  slope: number;
  /** The quietest a sound gets: far sounds fade but are never lost. */
  floor: number;
}

export const FIELD: FieldTuning = { width: 0.6, near: 1, slope: 0.5, floor: 0.4 };

/**
 * A mono voice through a stereo panner at pan 0 is 3 dB down on the same voice sent straight to a
 * stereo output (0.707 per side against 1), so every panned path gets this make-up gain and the
 * centre stays as loud as Classic.
 */
export const PANNED_MAKEUP = Math.SQRT2;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Places a world position relative to the camera. Distance is measured in half-screens (1 is the
 * edge of the view) on whichever axis is further, so a sound straight above is as far as one level
 * with it. Pan follows the horizontal offset only.
 */
export function placeSound(
  x: number,
  y: number,
  cam: { x: number; y: number },
  half: { w: number; h: number },
  f: FieldTuning = FIELD,
): SoundAt {
  const dx = (x - cam.x) / half.w;
  const dy = (y - cam.y) / half.h;
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    pan: f.width * clamp(dx, -1, 1),
    gain: d <= f.near ? 1 : Math.max(f.floor, 1 - f.slope * (d - f.near)),
  };
}

/** The per-side gains of a `StereoPannerNode` on a mono input (equal power: `l² + r² = 1`). */
export function panGains(pan: number): { l: number; r: number } {
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return { l: Math.cos(a), r: Math.sin(a) };
}
