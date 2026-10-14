// Carries out what the launcher's state machine asks for: toasts, saving the unlock and leaving for another page.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { flushable, type KeyValueStorage } from '@lieutenant-fizz/engine/storage';
import { launchUrl } from '@lieutenant-fizz/engine/launch';
import { writeUnlocked } from './dev-unlock';
import type { Effect } from './state';

export interface EffectDeps {
  readonly store: KeyValueStorage;
  /** Shows a short message. */
  toast(message: string, options?: { replace?: boolean }): void;
  /** Opens a page in this window. */
  navigate(url: string): void;
  /** The page an episode runs on, relative to the launcher, or undefined when it is not installed. */
  pageOf?(episode: string): string | undefined;
  /** Hands Back to the system before the page is left; resolves once that has happened. */
  releaseBack?(): Promise<void>;
  /** Takes Back again when the page was not left after all. */
  reclaimBack?(): void;
}

/** The sets of dependencies that are leaving the page now, so a second press while the first is still writing does not leave twice. */
const leaving = new WeakSet<EffectDeps>();

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
      // Leaving: for a page of the app, or for an episode, which is started where the launch says. One at a time.
      if (leaving.has(deps)) return;
      let url: string;
      if (effect.kind === 'navigate') url = effect.url;
      else {
        const page = deps.pageOf?.(effect.episode);
        if (!page) {
          deps.toast("That episode isn't installed");
          return;
        }
        url = launchUrl(page, effect.launch);
      }
      leaving.add(deps);
      let saved: boolean;
      try {
        saved = (await flushable(deps.store)?.flush()) !== false;
      } catch (error) {
        console.warn('Writing the store before leaving failed', error);
        saved = false;
      }
      if (!saved) {
        leaving.delete(deps);
        deps.toast(SAVE_FAILED);
        return;
      }
      try {
        await deps.releaseBack?.();
        deps.navigate(url);
      } catch (error) {
        // The page was not left: the launcher is still here, so Back is its again.
        console.warn('Leaving the launcher failed', error);
        leaving.delete(deps);
        deps.reclaimBack?.();
        deps.toast("Couldn't open that page");
      }
      return;
    }
  }
}
