// The marks a replay's scrub bar shows for one attempt: where Ben died, where the level was cleared, and the pauses.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { num, type SessionEvent } from '@lieutenant-fizz/engine/session/log';
import { causeText } from './names';
import type { ReplayAttempt } from './replayer';

export type MarkerKind = 'death' | 'clear' | 'pause';

/** A mark on an attempt's timeline. */
export interface Marker {
  /** The recorded tick. A pause marks the tick it began on; no ticks pass while paused. */
  tick: number;
  kind: MarkerKind;
  /** Words for the mark: how Ben died, "Cleared", "Paused". */
  text: string;
  /** Where Ben died, in tiles. */
  x?: number;
  y?: number;
}

/** The marks of one attempt, in tick order. */
export function markersOf(events: readonly SessionEvent[], attempt: ReplayAttempt): Marker[] {
  const out: Marker[] = [];
  for (let i = attempt.index; i < attempt.end; i++) {
    const e = events[i]!;
    if (e.e === 'death') {
      out.push({
        tick: e.t,
        kind: 'death',
        text: causeText(num(e, 'cause'), num(e, 'detail')),
        x: num(e, 'x'),
        y: num(e, 'y'),
      });
    } else if (e.e === 'ev' && e['k'] === 'level_complete') {
      out.push({ tick: e.t, kind: 'clear', text: 'Cleared' });
    } else if (e.e === 'screen' && e['to'] === 'pause') {
      out.push({ tick: e.t, kind: 'pause', text: 'Paused' });
    }
  }
  return out;
}
