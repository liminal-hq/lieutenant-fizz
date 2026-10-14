// Which menu sound an action makes: Back, a choice, a change, or "no" for a row that does nothing.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { MenuCue } from '@lieutenant-fizz/engine/menu/sounds';
import type { Action, LauncherState, Step } from './state';

/** The cue for an action and what it did, or nothing when it should be silent. */
export function cueOf(before: LauncherState, action: Action, step: Step): MenuCue | undefined {
  if (action.type === 'back') return step.state !== before ? 'back' : undefined;
  // Stepping to another stop is the swipe; at either end there is nowhere to step, so it is silent.
  if (action.type === 'stop') return step.state !== before ? 'swipe' : undefined;
  if (action.type === 'disarm' || action.type === 'saves') return undefined;
  // An arrow on a Settings row changes it, and is silent where there is nothing more to change (a full meter).
  if (action.type === 'pick-tab') return step.state !== before ? 'change' : undefined;
  if (action.type === 'step') return step.state !== before ? 'change' : undefined;
  // A late press on a row that is no longer on screen, or a row with nothing to do, is a "no".
  if (step.state === before && step.effects.length === 0) return 'deny';
  if (action.row === 'hide-debug' || action.row === 'tab' || action.row.startsWith('opt:')) {
    return 'change';
  }
  // The first tap on Reset only arms it; the second puts the values back.
  if (action.row === 'reset') {
    return step.effects.some((e) => e.kind === 'reset-options') ? 'change' : 'select';
  }
  if (action.row === 'back') return 'back';
  return 'select';
}
