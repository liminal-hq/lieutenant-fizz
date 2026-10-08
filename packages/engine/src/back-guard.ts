// Holds one history entry so the browser's Back button can be answered by the game instead of leaving.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The slice of `History` the guard uses, so a test can stand in a fake. */
export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  back(): void;
}

/** The state stored on the guard entry; a reload that finds it knows the entry is left over. */
const MARKER = { lfBack: 1 };

function isMarked(state: unknown): boolean {
  return (
    typeof state === 'object' && state !== null && (state as { lfBack?: unknown }).lfBack === 1
  );
}

/**
 * Answers the browser's Back button with the game's own, while the game wants it.
 *
 * `set(true)` pushes one entry with the same URL; Back then pops it, the guard disarms and calls
 * `onBack`, and the game decides whether to `set(true)` again. `set(false)` removes the entry with
 * `history.back()`, so the page leaves normally on the next Back. There is never more than one guard
 * entry, however many screens open and close. `history.back()` is asynchronous, so the guard counts the
 * pops it caused (`skip`) and swallows them, and keeps only the latest want until they have all landed.
 */
export class BackGuard {
  private isArmed = false;
  private wanted = false;
  private skip = 0;
  private disposed = false;

  constructor(
    private readonly onBack: () => void,
    private readonly history: HistoryLike,
    private readonly target: EventTarget,
  ) {
    // A reload keeps the history state, so the page can open on a guard entry nothing is holding.
    if (isMarked(history.state)) history.replaceState(null, '');
    target.addEventListener('popstate', this.onPop);
  }

  /** Whether the guard entry is in place right now. */
  get armed(): boolean {
    return this.isArmed;
  }

  /** Asks for the entry to be in place (or not). Calls made while a removal is landing take effect after it. */
  set(want: boolean): void {
    if (this.disposed) return;
    this.wanted = want;
    this.reconcile();
  }

  /** Stops listening. The entry, if any, stays where it is. */
  dispose(): void {
    this.disposed = true;
    this.target.removeEventListener('popstate', this.onPop);
  }

  private reconcile(): void {
    if (this.skip > 0) return;
    if (this.wanted && !this.isArmed) {
      this.history.pushState(MARKER, '');
      this.isArmed = true;
    } else if (!this.wanted && this.isArmed) {
      this.isArmed = false;
      this.skip++;
      this.history.back();
    }
  }

  private readonly onPop = (): void => {
    if (this.skip > 0) {
      this.skip--;
      this.reconcile();
      return;
    }
    // A pop with no entry held (a Forward onto a stale entry) is not ours to answer.
    if (!this.isArmed) return;
    this.isArmed = false;
    this.onBack();
    // The game may have left the want standing without calling `set` (a screen that ignores Back).
    this.reconcile();
  };
}
