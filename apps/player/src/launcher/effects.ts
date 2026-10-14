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
  /** Closes the app: leaves fullscreen, writes the store out and quits. Resolves false when it stayed open (the write failed). */
  quit?(): Promise<boolean>;
  /** Saves an app-wide option, or puts some back to their defaults; each returns false when the store would not take it. */
  options?: {
    save(key: string, value: number | boolean): boolean;
    reset(keys: readonly string[]): boolean;
  };
  /** Exports and imports the saves file; each resolves what to tell the player, or undefined when they closed the dialog. */
  saves?: { export(): Promise<string | undefined>; import(): Promise<string | undefined> };
  /** Starts the clock that disarms Reset if its second tap does not come. */
  arm?(): void;
}

/** The sets of dependencies that are leaving the page now, so a second press while the first is still writing does not leave twice. */
const leaving = new WeakSet<EffectDeps>();

/** The sets of dependencies with a file dialog open now. */
const filing = new WeakSet<EffectDeps>();

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
    } else if (effect.kind === 'save-option' || effect.kind === 'reset-options') {
      const ok =
        effect.kind === 'save-option'
          ? deps.options?.save(effect.key, effect.value)
          : deps.options?.reset(effect.keys);
      if (!ok) deps.toast(SAVE_FAILED);
      // Written out at once, so closing the window straight after a change does not lose it.
      else void Promise.resolve(flushable(deps.store)?.flush()).catch(() => {});
    } else if (effect.kind === 'export-saves' || effect.kind === 'import-saves') {
      // One file dialog at a time: a second tap while one is open does nothing.
      if (filing.has(deps) || !deps.saves) continue;
      filing.add(deps);
      try {
        const message = await (effect.kind === 'export-saves'
          ? deps.saves.export()
          : deps.saves.import());
        if (message) deps.toast(message);
      } catch (error) {
        console.warn('The saves file failed', error);
        deps.toast("Couldn't use the file");
      } finally {
        filing.delete(deps);
      }
    } else if (effect.kind === 'arm') {
      deps.arm?.();
    } else if (effect.kind === 'quit') {
      if (leaving.has(deps) || !deps.quit) return;
      leaving.add(deps);
      let closed = false;
      try {
        closed = await deps.quit();
      } catch (error) {
        console.warn('Closing the app failed', error);
      }
      if (!closed) {
        leaving.delete(deps);
        deps.toast(`${SAVE_FAILED}, so the app stays open`);
      }
      return;
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
