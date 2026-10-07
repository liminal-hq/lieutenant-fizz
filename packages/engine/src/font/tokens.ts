// Private-use code points for controller buttons and keycaps, and the helper that writes hint text.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Controller button glyphs: a round or pill-shaped button with its label knocked out. */
export const BUTTON_CODES = {
  A: 0xe000,
  B: 0xe001,
  X: 0xe002,
  Y: 0xe003,
  LB: 0xe010,
  RB: 0xe011,
  LT: 0xe012,
  RT: 0xe013,
  Start: 0xe014,
  Select: 0xe015,
} as const;

/** The left end of a keycap: its side wall and the start of the top and bottom edges. */
export const KEY_LEFT = 0xe0f0;
/** A blank stretch of keycap, used for spaces inside a label. */
export const KEY_CENTRE = 0xe0f1;
/** The right end of a keycap. */
export const KEY_RIGHT = 0xe0f2;
/** Keycap label glyphs: `KEYED_BASE + (code point - 0x20)` for printable ASCII. */
export const KEYED_BASE = 0xe100;
/** Arrow characters that also have keycap label glyphs, at `KEYED_ARROW_BASE` in this order. */
export const KEYED_ARROWS = ['←', '→', '↑', '↓'] as const;
/** First code point of the keycap arrow glyphs. */
export const KEYED_ARROW_BASE = 0xe160;
/** Whole keycaps for common key names, drawn as one glyph each. */
export const FIXED_KEYS = [
  'Esc',
  'Enter',
  'Space',
  'Ctrl',
  'Alt',
  'Shift',
  'Tab',
  'F5',
  'F9',
] as const;
/** First code point of the {@link FIXED_KEYS} glyphs, in order. */
export const FIXED_KEY_BASE = 0xe200;

/** Letters whose tails would hit the keycap edge are drawn as capitals inside a keycap. */
const DESCENDER_FOLD: Record<string, string> = { g: 'G', j: 'J', p: 'P', q: 'Q', y: 'Y' };

/** The ASCII character whose shape a keycap label glyph uses. */
export const keyedShape = (ch: string): string => DESCENDER_FOLD[ch] ?? ch;

/** The private-use code point of one keycap label character. Anything unprintable becomes `?`. */
export function keyedCode(ch: string): number {
  const arrow = (KEYED_ARROWS as readonly string[]).indexOf(ch);
  if (arrow >= 0) return KEYED_ARROW_BASE + arrow;
  const cp = ch.codePointAt(0) ?? 0x3f;
  return KEYED_BASE + (cp >= 0x20 && cp <= 0x7e ? cp : 0x3f) - 0x20;
}

/** Wraps a label in a keycap: left end, one glyph per character, right end. */
export function keycap(label: string): string {
  let out = String.fromCodePoint(KEY_LEFT);
  for (const ch of label) out += String.fromCodePoint(keyedCode(ch));
  return out + String.fromCodePoint(KEY_RIGHT);
}

/**
 * Rewrites `{token}` markers as private-use glyphs, so hint text renders without needing the font's
 * `liga` feature.
 *
 * - `{A}`, `{Start}`, `{RT}` and the other button names become button glyphs.
 * - `{Esc}`, `{Enter}` and the other fixed key names become one whole keycap.
 * - `{[Z]}` or any other label becomes a keycap built from its characters.
 */
export function hintText(text: string): string {
  return text.replace(/\{([^}]+)\}/g, (_, raw: string) => {
    if (raw.startsWith('[') && raw.endsWith(']')) return keycap(raw.slice(1, -1));
    const button = (BUTTON_CODES as Record<string, number>)[raw];
    if (button !== undefined) return String.fromCodePoint(button);
    const fixed = (FIXED_KEYS as readonly string[]).indexOf(raw);
    if (fixed >= 0) return String.fromCodePoint(FIXED_KEY_BASE + fixed);
    return keycap(raw);
  });
}
