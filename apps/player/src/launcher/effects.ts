// Carries out what the launcher's state machine asks for: toasts, saving the unlock and leaving for another page.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { flushable, type KeyValueStorage } from '@lieutenant-fizz/engine/storage';
import { writeUnlocked } from './dev-unlock';
import type { Effect } from './state';

export interface EffectDeps {
  readonly store: KeyValueStorage;
  /** Shows a short message. */
  toast(message: string, options?: { replace?: boolean }): void;
  /** Opens a page in this window. */
  navigate(url: string): void;
  /** Hands Back to the system before the page is left; resolves once that has happened. */
  releaseBack?(): Promise<void>;
}

/** What the player is told when the store would not take a write, so a page is not left with nothing saved. */
export const SAVE_FAILED = "Couldn't save: storage is full or blocked";

/**
 * Runs the effects in order. Leaving a page first writes the store out, and when that fails the launcher stays
 * where it is and says so, because what is held back lives only in this page.
 */
export async function applyEffects(effects: readonly Effect[], deps: EffectDeps): Promise<void> {
  for (const effect of effects) {
    if (effect.kind === 'toast') {
      deps.toast(
        effect.message,
        effect.replace === undefined ? undefined : { replace: effect.replace },
      );
    } else if (effect.kind === 'save-unlock') {
      if (!writeUnlocked(deps.store, effect.unlocked)) deps.toast(SAVE_FAILED);
    } else {
      let saved: boolean;
      try {
        saved = (await flushable(deps.store)?.flush()) !== false;
      } catch (error) {
        console.warn('Writing the store before leaving failed', error);
        saved = false;
      }
      if (!saved) {
        deps.toast(SAVE_FAILED);
        return;
      }
      await deps.releaseBack?.();
      deps.navigate(effect.url);
      return;
    }
  }
}
