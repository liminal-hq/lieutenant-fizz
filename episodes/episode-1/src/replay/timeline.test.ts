// Tests for the marks on an attempt's scrub bar.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { findAttempts } from './replayer';
import { sessionOf } from './session-test-util';
import { markersOf } from './timeline';

/** The marks of the first attempt in a log of events that begins with its level start. */
function marks(events: object[]): [number, string][] {
  const s = sessionOf('s', events);
  return markersOf(s.events, findAttempts(s)[0]!).map((m) => [m.tick, m.kind]);
}

describe('markersOf', () => {
  it('marks a pause and a clear, in order', () => {
    expect(
      marks([
        { t: 100, e: 'level', id: 0, name: 'A', attempt: 1 },
        { t: 110, e: 'screen', to: 'pause' },
        { t: 150, e: 'ev', k: 'level_complete', a: 0, b: 0, c: 0 },
      ]),
    ).toEqual([
      [110, 'pause'],
      [150, 'clear'],
    ]);
  });

  it('stops at the first death, so a pause in the delay before the next level has no mark', () => {
    expect(
      marks([
        { t: 100, e: 'level', id: 0, name: 'A', attempt: 1 },
        { t: 120, e: 'death', cause: 3, detail: 5, x: 6, y: 2 },
        { t: 180, e: 'screen', to: 'pause' },
        { t: 200, e: 'level', id: 0, name: 'A', attempt: 2 },
      ]),
    ).toEqual([[120, 'death']]);
  });

  it('stops at the clear too', () => {
    expect(
      marks([
        { t: 100, e: 'level', id: 0, name: 'A', attempt: 1 },
        { t: 130, e: 'ev', k: 'level_complete', a: 0, b: 0, c: 0 },
        { t: 160, e: 'screen', to: 'pause' },
        { t: 300, e: 'level', id: 1, name: 'B', attempt: 1 },
      ]),
    ).toEqual([[130, 'clear']]);
  });
});
