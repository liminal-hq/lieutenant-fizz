// The player's own keyboard layout, so a hint can name a key by what is printed on it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** What the browser's Keyboard API gives, where it has one (Chromium browsers; not Firefox or Safari). */
export interface KeyboardLike {
  getLayoutMap?: () => Promise<ReadonlyMap<string, string>>;
  addEventListener?: (type: 'layoutchange', listener: () => void) => void;
  removeEventListener?: (type: 'layoutchange', listener: () => void) => void;
}

const keyboardOf = (nav: object): KeyboardLike | null => {
  const k = (nav as { keyboard?: unknown }).keyboard;
  return k && typeof k === 'object' ? (k as KeyboardLike) : null;
};

/** The layout map (a key code to the character it types), or null where the browser has none or refuses it. */
export async function readLayoutMap(
  nav: object = navigator,
): Promise<ReadonlyMap<string, string> | null> {
  const k = keyboardOf(nav);
  if (!k?.getLayoutMap) return null;
  try {
    return await k.getLayoutMap();
  } catch {
    // A page in a frame or without focus policy can be refused; the labels are then the US ones.
    return null;
  }
}

/**
 * Reads the layout map now and again whenever the player's layout changes, calling `onMap` with each. Returns a
 * function that stops watching. Where there is no Keyboard API, `onMap` is not called and nothing is watched.
 */
export function watchLayoutMap(
  onMap: (map: ReadonlyMap<string, string> | null) => void,
  nav: object = navigator,
): () => void {
  const k = keyboardOf(nav);
  if (!k?.getLayoutMap) return () => {};
  let live = true;
  const read = (): void => {
    void readLayoutMap(nav).then((m) => {
      if (live) onMap(m);
    });
  };
  read();
  k.addEventListener?.('layoutchange', read);
  return () => {
    live = false;
    k.removeEventListener?.('layoutchange', read);
  };
}
