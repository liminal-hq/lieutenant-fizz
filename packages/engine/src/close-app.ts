// Closing the desktop app safely: leave fullscreen, write the store out, then quit.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The steps of closing the app, as a page wires them (the game and the launcher). */
export interface CloseSteps {
  exitFullscreen(): Promise<unknown>;
  /** The store's flush when it has one; it resolves `false` when the write failed. */
  flush?(): Promise<boolean>;
  quit(): Promise<void>;
}

/**
 * Leaves fullscreen, writes the store out and closes the app. A failed flush (for example no space left)
 * keeps the app open, since quitting would discard what only memory holds; it resolves `false` so the
 * caller can say so, and a second try flushes again. Resolves `true` once `quit` has been asked for.
 */
export async function closeApp(steps: CloseSteps): Promise<boolean> {
  await steps.exitFullscreen();
  if (steps.flush && !(await steps.flush())) return false;
  await steps.quit();
  return true;
}
