// EGA colour palette and colour conversion helpers for the sprite DSL.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The 16-colour EGA palette, keyed by the single-character codes the sprite DSL uses. */
export const EGA = {
  k: '#000000',
  B: '#0000aa',
  G: '#00aa00',
  C: '#00aaaa',
  R: '#aa0000',
  M: '#aa00aa',
  N: '#aa5500',
  L: '#aaaaaa',
  D: '#555555',
  b: '#5555ff',
  g: '#55ff55',
  c: '#55ffff',
  r: '#ff5555',
  m: '#ff55ff',
  y: '#ffff55',
  W: '#ffffff',
} as const;

export type Colour = keyof typeof EGA;

export function isColour(c: string): c is Colour {
  return Object.hasOwn(EGA, c);
}

/** Parses `#rrggbb` into 0..255 channels. */
export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Perceptual luminance of a palette colour in 0..1 (drives the generated normal maps). */
export function luminance(c: Colour): number {
  const [r, g, b] = hexToRgb(EGA[c]);
  return (r * 0.3 + g * 0.59 + b * 0.11) / 255;
}
