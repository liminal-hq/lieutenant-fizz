// Runs a play sample's replay for every attempt and says, in words, whether it matches what was recorded.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Session } from '@lieutenant-fizz/engine/session/log';
import type { Sim } from '../sim/sim';
import { clockText } from './navigation';
import { Replayer, type Drift } from './replayer';

const WHAT: Record<Drift['kind'], string> = {
  pos: 'position',
  st: 'lives, ammo or score',
  death: 'death',
  clear: 'clear',
};

/**
 * For each attempt, by its place in the session, whether the replay matches the recording: "matches the recording",
 * "stops matching at 0:03.1 (position)" or "cannot be replayed" (the log does not hold how it started). It runs
 * every attempt on the sim it is given, so give it one of its own.
 */
export function verdictsFor(sim: Sim, session: Session): Map<number, string> {
  const replayer = new Replayer(sim, session);
  const out = new Map<number, string>();
  replayer.attempts.forEach((a, i) => {
    if (!a.entry) {
      out.set(i, 'cannot be replayed');
      return;
    }
    replayer.load(i);
    replayer.run();
    const drift = replayer.drift;
    out.set(
      i,
      drift
        ? `stops matching at ${clockText(drift.tick - (a.startTick - replayer.lateBy))} (${WHAT[drift.kind]})`
        : 'matches the recording',
    );
  });
  return out;
}
