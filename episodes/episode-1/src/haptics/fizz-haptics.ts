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

const I = 'interrupt';
const D = 'drop-if-busy';
const Q = 'queue';

export const FIZZ_HAPTICS: HapticTable = {
  cues: {
    // Ben's moves.
    jump: cue([tap(0.5, 0.7)], { priority: 1, cooldownMs: 100, policy: D }),
    boing: cue([tap(0.55, 0.35)], { priority: 1, cooldownMs: 120, policy: I }),
    kick: cue([tap(0.6, 0.6)], { priority: 2, cooldownMs: 100, policy: I }),
    heave: cue([hum(0, 90, [0.2, 0.45], 0.3)], { priority: 2, cooldownMs: 200, policy: I }),
    pogoOn: cue([tap(0.6, 0.7), tap(0.6, 0.7, 90)], { priority: 2, cooldownMs: 100, policy: I }),
    pogoOff: cue([tap(0.5, 0.7)], { priority: 2, cooldownMs: 100, policy: I }),
    clunk: cue([tap(0.6, 0.25)], { priority: 2, cooldownMs: 150, policy: I }),
    vworp: cue([hum(0, 250, [0.2, 0.6, 0], 0.4)], { priority: 3, cooldownMs: 400, policy: I }),

    // Fizz shots and what they hit.
    fzzt: cue([tap(0.35, 0.9)], { priority: 1, cooldownMs: 90, policy: D }),
    outOfFizz: cue([tap(0.45, 0.2), tap(0.45, 0.2, 60)], {
      priority: 2,
      cooldownMs: 250,
      policy: I,
    }),
    bonk: cue([tap(0.7, 0.2)], { priority: 3, cooldownMs: 80, policy: I }),
    fizzled: cue([tap(0.5, 0.8)], { priority: 2, cooldownMs: 80, policy: D }),
    plink: cue([tap(0.2, 0.9)], { priority: 1, cooldownMs: 80, policy: D }),
    ting: cue([tap(0.25, 0.9)], { priority: 1, cooldownMs: 80, policy: D }),
    pop: cue([tap(0.45, 0.7)], { priority: 1, cooldownMs: 80, policy: D }),
    clink: cue([tap(0.3, 0.9)], { priority: 1, cooldownMs: 150, policy: D }),
    click: cue([tap(0.35, 0.8)], { priority: 1, cooldownMs: 150, policy: D }),
    needsDrive: cue([tap(0.35, 0.2), tap(0.35, 0.2, 70)], {
      priority: 1,
      cooldownMs: 400,
      policy: D,
    }),

    // Marshmallows.
    sproing: cue([tap(0.6, 0.5), tap(0.3, 0.5, 70)], { priority: 3, cooldownMs: 100, policy: I }),
    bwomp: cue([tap(0.5, 0.3)], { priority: 2, cooldownMs: 100, policy: D }),
    blorp: cue([tap(0.25, 0.3)], { priority: 1, cooldownMs: 100, policy: D }),

    // Pickups.
    crunch: cue([tap(0.3, 0.9)], { priority: 1, cooldownMs: 0, policy: { coalesce: 60 } }),
    fsssht: cue([tap(0.3, 0.8), tap(0.5, 0.8, 30), tap(0.7, 0.8, 60)], {
      priority: 2,
      cooldownMs: 200,
      policy: Q,
    }),
    gumdrop: cue([tap(0.5, 0.6), tap(0.4, 0.6, 80)], { priority: 2, cooldownMs: 150, policy: Q }),
    goldUsb: cue([hum(0, 150, [0.3, 0.6], 0.5), tap(0.7, 0.7, 170)], {
      priority: 3,
      cooldownMs: 300,
      policy: Q,
    }),
    extraLife: cue([hum(0, 180, [0.3, 0.7, 0.3], 0.5)], {
      priority: 3,
      cooldownMs: 300,
      policy: Q,
    }),

    // Things that happen out in the level: felt only when they are on screen.
    crumble: cue([hum(0, 140, [0.35, 0.1], 0.2)], {
      priority: 1,
      cooldownMs: 200,
      policy: D,
      world: true,
    }),
    thunk: cue([tap(0.3, 0.2)], {
      priority: 1,
      cooldownMs: 150,
      policy: D,
      world: true,
      calm: true,
    }),
    krunch: cue([tap(0.5, 0.15)], {
      priority: 1,
      cooldownMs: 150,
      policy: D,
      world: true,
      calm: true,
    }),
    clang: cue([tap(0.8, 0.9), hum(30, 100, [0.4, 0], 0.6)], {
      priority: 4,
      cooldownMs: 250,
      policy: I,
      world: true,
      calm: true,
    }),
    thoom: cue([hum(0, 220, [1, 0.3], 0.05)], {
      priority: 4,
      cooldownMs: 250,
      policy: I,
      world: true,
      calm: true,
    }),

    // Big moments.
    whoa: cue([tap(1, 0.6), hum(25, 120, [0.9, 0], 0.1)], {
      priority: 4,
      cooldownMs: 300,
      policy: I,
    }),
    zzzap: cue([tap(1, 0.7), hum(20, 80, [0.6, 0], 0.4)], {
      priority: 4,
      cooldownMs: 150,
      policy: I,
    }),
    taDa: cue([hum(0, 120, [0.2, 0.7], 0.5), tap(0.8, 0.7, 140)], {
      priority: 4,
      cooldownMs: 500,
      policy: I,
    }),
    bossDown: cue([hum(0, 400, [0.9, 0.2], 0.2)], { priority: 4, cooldownMs: 0, policy: I }),
    gameOver: cue([hum(0, 360, [0.8, 0.2], 0.1)], {
      priority: 4,
      cooldownMs: 0,
      policy: I,
      calm: true,
    }),

    // Menus: the phone's own lane.
    'ui.move': cue([tap(0.2, 1)], { priority: 0, cooldownMs: 40, policy: D, lane: 'ui' }),
    'ui.select': cue([tap(0.4, 0.8)], { priority: 1, cooldownMs: 80, policy: I, lane: 'ui' }),
    'ui.back': cue([tap(0.3, 0.5)], { priority: 1, cooldownMs: 80, policy: I, lane: 'ui' }),
    'ui.reject': cue([tap(0.3, 0.2), tap(0.3, 0.2, 60)], {
      priority: 1,
      cooldownMs: 150,
      policy: I,
      lane: 'ui',
    }),
    'ui.toggleOn': cue([tap(0.4, 0.6), tap(0.4, 0.6, 70)], {
      priority: 1,
      cooldownMs: 80,
      policy: I,
      lane: 'ui',
    }),
    'ui.toggleOff': cue([tap(0.35, 0.6)], { priority: 1, cooldownMs: 80, policy: I, lane: 'ui' }),
  },
  // Every caption the sim can raise (and the stage scene's "♪ low sting"), by the text on screen.
  // `null` is silent on purpose: enemy noises and the like, which a player can tune in later.
  captions: {
    jump: 'jump',
    boing: 'boing',
    kick: 'kick',
    heave: 'heave',
    clunk: 'clunk',
    vworp: 'vworp',
    fzzt: 'fzzt',
    'click — no fizz': 'outOfFizz',
    bonk: 'bonk',
    fizzled: 'fizzled',
    plink: 'plink',
    ting: 'ting',
    'pop!': 'pop',
    clink: 'clink',
    'click-clack': 'click',
    'beep boop': 'click',
    'needs a drive': 'needsDrive',
    sproing: 'sproing',
    bwomp: 'bwomp',
    blorp: 'blorp',
    crunch: 'crunch',
    fsssht: 'fsssht',
    'red gumdrop': 'gumdrop',
    'blue gumdrop': 'gumdrop',
    'green gumdrop': 'gumdrop',
    chime: 'gumdrop',
    'gold USB drive': 'goldUsb',
    'ding! extra life': 'extraLife',
    crumble: 'crumble',
    thunk: 'thunk',
    KRUNCH: 'krunch',
    'CLANG — dome open!': 'clang',
    THOOM: 'thoom',
    'whoa!': 'whoa',
    ZZZAP: 'zzzap',
    'ta-da!': 'taDa',
    // Silent on purpose.
    snort: null,
    skreee: null,
    pfff: null,
    'zap zap zap': null,
    brrrt: null,
    splorp: null,
    poof: null,
    '♪ low sting': null,
  },
};
