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

/** What a music part does in the mix, which decides where it sits in the stereo field. */
export type PartRole =
  | 'bass'
  | 'kick'
  | 'snare'
  | 'pad'
  | 'drone'
  | 'lead'
  | 'counter'
  | 'bell'
  | 'hats'
  | 'perc'
  | 'arp';

/** A fixed pan, or a pair that alternates on each step of the cycle (ping-pong). */
export type PartPan = number | readonly [number, number];

/**
 * Where each role sits. Low and central things (bass, kick, snare, pads, drones) stay in the middle
 * with no panner at all; the rest lean a little, never past 0.3, so the field is felt more than
 * heard and the music still reads on one speaker. The arpeggio alternates left and right on every
 * eighth of the cycle.
 */
export const PART_PAN: Record<PartRole, PartPan> = {
  bass: 0,
  kick: 0,
  snare: 0,
  pad: 0,
  drone: 0,
  lead: -0.15,
  counter: 0.2,
  bell: 0.3,
  hats: 0.25,
  perc: -0.3,
  arp: [-0.3, 0.3],
};

/** How many steps of an alternating pan fit in one cycle. */
export const ARP_STEPS = 8;

/** The pan of a part at `cyclePos`, the position in its cycle from 0 up to (not including) 1. */
export function partPanAt(role: PartRole, cyclePos: number): number {
  const p = PART_PAN[role];
  if (typeof p === 'number') return p;
  const step = Math.floor(cyclePos * ARP_STEPS + 1e-9);
  return p[((step % 2) + 2) % 2]!;
}

/** True when the role is panned: it has a panner, and the make-up gain that goes with one. */
export function isPanned(role: PartRole | undefined): boolean {
  return role !== undefined && PART_PAN[role] !== 0;
}

/**
 * The pan to give Undertone's `.pan()` for a role: a number, or a mini-notation pattern that
 * alternates every step of the cycle, or undefined for a centred role (no panner is made, so a
 * centred part is exactly as loud as in Classic).
 */
export function undertonePan(role: PartRole | undefined): number | string | undefined {
  if (!role || !isPanned(role)) return undefined;
  const p = PART_PAN[role];
  return typeof p === 'number' ? p : `[${p[0]} ${p[1]}]*${ARP_STEPS / 2}`;
}

/** The make-up gain a part's voices need: one for centred parts, `PANNED_MAKEUP` for panned. */
export function partMakeup(role: PartRole | undefined): number {
  return isPanned(role) ? PANNED_MAKEUP : 1;
}
