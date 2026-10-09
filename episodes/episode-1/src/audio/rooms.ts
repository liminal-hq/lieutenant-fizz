// The rooms Enhanced sound is heard in: one reverb character per kind of place.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { RoomProfile } from '@lieutenant-fizz/engine/master';
import { LEVELS } from '../story';
import { Mode } from '../sim/protocol';

/** The kinds of place. Every level, and every screen, has one. */
export type RoomName =
  'neutral' | 'map' | 'outdoor' | 'cave' | 'shaft' | 'citadel' | 'tower' | 'theatre' | 'foundry';

/**
 * The rooms, as data to tune by ear (`__lf.debugAudioTune({ rooms: { cave: { sfxSend: 0.15 } } })`;
 * every use reads the live values). Lengths in seconds, `coarseSeconds` being the shorter length
 * used on a phone; sends are linear; `lpf` and `hpf` shape the send in Hz; `predelay` is in
 * seconds; `damping` darkens the tail (0 to 1); `ring` adds a resonance at `hz`.
 *
 * `neutral` is the room before rooms existed (the title, the cinematics and the ending): it must
 * stay equal to `MASTER_DEFAULTS.reverb`, which a test checks.
 */
export const ROOMS: Record<RoomName, RoomProfile> = {
  neutral: {
    seconds: 0.8,
    coarseSeconds: 0.6,
    sfxSend: 0.1,
    musicSend: 0.06,
    hpf: 300,
    lpf: 5000,
    predelay: 0.012,
    damping: 0,
    seed: 0,
  },
  // The overworld: close and dry.
  map: {
    seconds: 0.5,
    coarseSeconds: 0.4,
    sfxSend: 0.05,
    musicSend: 0.04,
    hpf: 300,
    lpf: 4500,
    predelay: 0.006,
    damping: 0.5,
    seed: 1,
  },
  // Open air: almost no room at all.
  outdoor: {
    seconds: 0.4,
    coarseSeconds: 0.35,
    sfxSend: 0.04,
    musicSend: 0.03,
    hpf: 300,
    lpf: 4000,
    predelay: 0.005,
    damping: 0.6,
    seed: 2,
  },
  // Long, wet and a little dark: stone and water.
  cave: {
    seconds: 1.8,
    coarseSeconds: 1.2,
    sfxSend: 0.22,
    musicSend: 0.08,
    hpf: 300,
    lpf: 6500,
    predelay: 0.028,
    damping: 0.25,
    seed: 3,
  },
  // A tall crystal shaft: bright and clear.
  shaft: {
    seconds: 1.4,
    coarseSeconds: 1.0,
    sfxSend: 0.2,
    musicSend: 0.07,
    hpf: 300,
    lpf: 7500,
    predelay: 0.018,
    damping: 0.15,
    seed: 4,
  },
  // A stone hall with a low ring.
  citadel: {
    seconds: 1.3,
    coarseSeconds: 1.0,
    sfxSend: 0.16,
    musicSend: 0.07,
    hpf: 300,
    lpf: 4500,
    predelay: 0.022,
    damping: 0.4,
    ring: { hz: 420, amount: 0.15 },
    seed: 5,
  },
  // A metal tower: short with a brighter ring.
  tower: {
    seconds: 0.7,
    coarseSeconds: 0.5,
    sfxSend: 0.12,
    musicSend: 0.05,
    hpf: 300,
    lpf: 6000,
    predelay: 0.01,
    damping: 0.3,
    ring: { hz: 900, amount: 0.25 },
    seed: 6,
  },
  // A stage and a gallery: medium, soft.
  theatre: {
    seconds: 1.1,
    coarseSeconds: 0.8,
    sfxSend: 0.14,
    musicSend: 0.08,
    hpf: 300,
    lpf: 5000,
    predelay: 0.02,
    damping: 0.45,
    seed: 7,
  },
  // A hall of machines: hard and metallic.
  foundry: {
    seconds: 1.0,
    coarseSeconds: 0.8,
    sfxSend: 0.15,
    musicSend: 0.06,
    hpf: 300,
    lpf: 5500,
    predelay: 0.014,
    damping: 0.2,
    ring: { hz: 620, amount: 0.35 },
    seed: 8,
  },
};

/** What a phone's speaker does with a bigger reverb is mostly mud, so the sends are lowered. */
export const COARSE_SEND = 0.8;

/**
 * The room for a screen. The title, cinematics, ending and credits sit in the neutral room; once
 * the game is on the map or in a level (including its pause, card, dialogue and stinger screens)
 * the room is that of the place, so the pause menu does not change the room under the music.
 * `mode` is the simulation's mode (`Mode.MAP` or `Mode.LEVEL`).
 */
export function roomFor(screen: string, mode: number, levelId: number): RoomName {
  switch (screen) {
    case 'loading':
    case 'title':
    case 'cine':
    case 'ending':
    case 'credits':
      return 'neutral';
  }
  if (mode === Mode.MAP) return 'map';
  if (mode === Mode.LEVEL) return LEVELS[levelId]?.room ?? 'neutral';
  return 'neutral';
}

/** The profile to hand to the audio engine: the named room, with the sends lowered on a phone. */
export function roomProfile(name: RoomName, coarse: boolean): RoomProfile {
  const r = ROOMS[name];
  if (!coarse) return { ...r };
  return { ...r, sfxSend: r.sfxSend * COARSE_SEND, musicSend: r.musicSend * COARSE_SEND };
}
