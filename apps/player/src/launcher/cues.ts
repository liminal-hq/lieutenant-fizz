// Which menu sound an action makes: Back, a choice, a change, or "no" for a row that does nothing.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { MenuCue } from '@lieutenant-fizz/engine/menu/sounds';
import type { Action, LauncherState, Step } from './state';

/** The cue for an action and what it did, or nothing when it should be silent. */
export function cueOf(before: LauncherState, action: Action, step: Step): MenuCue | undefined {
  if (action.type === 'back') return step.state !== before ? 'back' : undefined;
  // A late press on a row that is no longer on screen, or a row with nothing to do, is a "no".
  if (step.state === before && step.effects.length === 0) return 'deny';
  if (action.row === 'hide-debug') return 'change';
  if (action.row === 'back') return 'back';
  return 'select';
}
