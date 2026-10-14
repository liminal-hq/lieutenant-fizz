// A save slot drawn as a menu row: its thumbnail, two lines of text and a pip for each level cleared.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A save slot shown as a row: thumbnail, two lines of text and the cleared-level pips. */
export interface SlotRow {
  title: string;
  detail: string;
  /** A shorter second line for narrow windows. */
  brief: string;
  /** PNG data URL of the mini overworld; empty for an empty slot. */
  thumb: string;
  empty: boolean;
  cleared: number;
  total: number;
}

const span = (className: string, text?: string): HTMLSpanElement => {
  const node = document.createElement('span');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Fills a row's plate with a slot's content: the thumbnail, two text lines and one pip per level. */
export function fillSlot(into: HTMLElement, s: SlotRow): void {
  let thumb: HTMLElement;
  // A save with no picture (the overworld is not known) keeps its thumbnail's room as the empty slot's dashed box does.
  if (s.empty || !s.thumb) {
    thumb = span('thumb none');
  } else {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = '';
    img.src = s.thumb;
    thumb = img;
  }
  const text = span('txt');
  text.append(span('l1', s.title), span('l2 full', s.detail), span('l2 brief', s.brief));
  const pips = span('pips-row');
  for (let k = 0; k < s.total; k++) {
    const pip = document.createElement('i');
    if (k < s.cleared) pip.className = 'on';
    pips.append(pip);
  }
  if (s.empty) pips.hidden = true;
  into.append(thumb, text, pips);
}
