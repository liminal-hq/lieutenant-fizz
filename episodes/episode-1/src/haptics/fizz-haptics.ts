// Episode 1's haptic cue table: which caption or menu action feels like what.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type {
  HapticCue,
  HapticEvent,
  HapticTable,
  Policy,
} from '@lieutenant-fizz/engine/haptic-pattern';

/** A tap: intensity and sharpness 0 to 1, `at` ms after the start. */
const tap = (intensity: number, sharpness: number, at = 0): HapticEvent => ({
  kind: 'transient',
  at,
  intensity,
  sharpness,
});

/** A hum of `duration` ms whose strength runs through `curve` (start, then optional middle points, then end). */
const hum = (
  at: number,
  duration: number,
  curve: readonly number[],
  sharpness: number,
): HapticEvent => ({
  kind: 'continuous',
  at,
  duration,
  intensity: curve.map((v, i) => ({ t: (duration * i) / Math.max(1, curve.length - 1), v })),
  sharpness,
});

interface Opts {
  priority: HapticCue['priority'];
  cooldownMs: number;
  policy: Policy;
  lane?: HapticCue['lane'];
  world?: boolean;
  calm?: boolean;
}

const cue = (events: HapticEvent[], o: Opts): HapticCue => ({
  pattern: { events },
  priority: o.priority,
  cooldownMs: o.cooldownMs,
  policy: o.policy,
  lane: o.lane ?? 'game',
  ...(o.world ? { world: true } : {}),
  ...(o.calm ? { calm: true } : {}),
});

export const FIZZ_HAPTICS: HapticTable = {
  cues: {
    jump: cue([tap(0.5, 0.7)], { priority: 1, cooldownMs: 100, policy: 'drop-if-busy' }),
    boing: cue([tap(0.55, 0.35)], { priority: 1, cooldownMs: 120, policy: 'interrupt' }),
    fzzt: cue([tap(0.35, 0.9)], { priority: 1, cooldownMs: 90, policy: 'drop-if-busy' }),
    bonk: cue([tap(0.7, 0.2)], { priority: 3, cooldownMs: 80, policy: 'interrupt' }),
    crunch: cue([tap(0.3, 0.9)], { priority: 1, cooldownMs: 0, policy: { coalesce: 60 } }),
    whoa: cue([tap(1, 0.6), hum(25, 120, [0.9, 0], 0.1)], {
      priority: 4,
      cooldownMs: 300,
      policy: 'interrupt',
    }),
    taDa: cue([hum(0, 120, [0.2, 0.7], 0.5), tap(0.8, 0.7, 140)], {
      priority: 4,
      cooldownMs: 500,
      policy: 'interrupt',
    }),
    thoom: cue([hum(0, 220, [1, 0.3], 0.05)], {
      priority: 4,
      cooldownMs: 250,
      policy: 'interrupt',
      world: true,
      calm: true,
    }),
    'ui.move': cue([tap(0.2, 1)], {
      priority: 0,
      cooldownMs: 40,
      policy: 'drop-if-busy',
      lane: 'ui',
    }),
    'ui.select': cue([tap(0.4, 0.8)], {
      priority: 1,
      cooldownMs: 80,
      policy: 'interrupt',
      lane: 'ui',
    }),
  },
  captions: {
    jump: 'jump',
    boing: 'boing',
    fzzt: 'fzzt',
    bonk: 'bonk',
    crunch: 'crunch',
    'whoa!': 'whoa',
    'ta-da!': 'taDa',
    THOOM: 'thoom',
  },
};
