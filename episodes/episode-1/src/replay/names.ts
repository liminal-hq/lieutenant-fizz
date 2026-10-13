// Names for the numbers the game writes: how Ben died, the enemy kinds, and the input bits.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { Death, Input } from '../sim/protocol';

/** How Ben died, by the `death` events' `cause`. */
export const CAUSE_NAMES: Record<number, string> = {
  [Death.NONE]: 'Unknown',
  [Death.FELL]: 'Fell out of the world',
  [Death.SPIKES]: 'Spikes',
  [Death.CHOCOLATE]: 'Chocolate',
  [Death.MOLTEN_METAL]: 'Molten metal',
  [Death.ENEMY]: 'An enemy',
  [Death.PUFF]: 'A pod’s puff',
  [Death.SHOT]: 'A shot',
};

/**
 * The enemy kinds in the order of `ents::Kind` in the Rust crate, which is the number a death's `detail` holds
 * for an enemy or a puff. A test compares this list with the Rust source so the two cannot drift.
 */
export const KIND_NAMES: readonly string[] = [
  'Gloop',
  'Hopper',
  'Marsh',
  'Beetle',
  'Bat',
  'Pod',
  'Phantom',
  'Roller',
  'Sentry',
  'Drone',
  'Boss',
  'Switch',
  'Terminal',
  'Cage',
  'Mirror',
  'Swivel',
  'CrystalSwitch',
  'Press',
  'Target',
  'Glyph',
  'Cameo',
];

/** A death in words: "An enemy (Gloop)", "Spikes". */
export function causeText(cause: number, detail: number): string {
  const base = CAUSE_NAMES[cause] ?? `Cause ${cause}`;
  if (cause === Death.ENEMY || cause === Death.PUFF) {
    const kind = KIND_NAMES[detail];
    return kind ? `${base} (${kind})` : base;
  }
  return base;
}

/** The input bits the game merges keys, pad and touch into, by name. */
export const INPUT_BITS: readonly { name: string; bit: number }[] = [
  { name: 'Left', bit: Input.LEFT },
  { name: 'Right', bit: Input.RIGHT },
  { name: 'Up', bit: Input.UP },
  { name: 'Down', bit: Input.DOWN },
  { name: 'Jump', bit: Input.JUMP },
  { name: 'Pogo', bit: Input.POGO },
  { name: 'Fizz', bit: Input.FIRE },
];
