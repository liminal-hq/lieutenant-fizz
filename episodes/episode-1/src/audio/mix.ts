// Episode 1's mix states: how the music is heard on each screen (muffled on pause, ducked under speech).
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { MIX_OPEN, type MixShape } from '@lieutenant-fizz/engine/mix';
import type { ShellScreen, SubScreen } from '../touch-menus';

/**
 * The mix states, in Enhanced only. They are mutable so `__lf.debugAudioTune({ mix: ... })` can
 * tune them by ear; `mixFor` reads them live.
 *
 * - `open`: the music as it is
 * - `pause`: muffled to a dull room-through-a-wall sound, and lower
 * - `pauseCoarse`: the same on a phone, whose small speaker has little left below 900 Hz
 * - `card`: lightly muffled behind the level-cleared and game-over cards
 * - `dialogue`: not muffled, about 3 dB down so speech sits on top
 * - `cine`: about 1.4 dB down under the cinematic and ending panels
 */
export const MIX: Record<'open' | 'pause' | 'pauseCoarse' | 'card' | 'dialogue' | 'cine', MixShape> =
  {
    open: { ...MIX_OPEN },
    pause: { lpf: 900, gain: 0.7 },
    pauseCoarse: { lpf: 1400, gain: 0.7 },
    card: { lpf: 2200, gain: 0.8 },
    dialogue: { lpf: 20000, gain: 0.7 },
    cine: { lpf: 20000, gain: 0.85 },
  };

/**
 * The mix for a screen, and the sub-screen open over it. Pause and everything opened from it
 * (Options, Saves, Controls) are muffled; the title and its sub-screens, play (which includes the
 * map) and the credits are open. A Sound screen, when it exists, stays open even from Pause, so the music can be
 * judged while its volume is changed. The result is a copy, so the caller cannot change `MIX`.
 */
export function mixFor(screen: ShellScreen, sub: SubScreen, coarse = false): MixShape {
  void sub; // Pause muffles whatever is open over it; the title's sub-screens are open like the title.
  switch (screen) {
    case 'pause':
      return { ...(coarse ? MIX.pauseCoarse : MIX.pause) };
    case 'card':
      return { ...MIX.card };
    case 'dialogue':
      return { ...MIX.dialogue };
    case 'cine':
    case 'ending':
      return { ...MIX.cine };
    case 'loading':
    case 'title':
    case 'play':
    case 'credits':
    case 'stinger':
      return { ...MIX.open };
  }
}
