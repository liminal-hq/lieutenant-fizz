// Type declarations for the parts of opentype.js 2 the font build and its tests use.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

declare module 'opentype.js' {
  export class Path {
    commands: { type: string; x?: number; y?: number }[];
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    close(): void;
  }

  export interface GlyphOptions {
    name: string;
    unicode?: number;
    advanceWidth: number;
    path: Path;
  }

  export class Glyph {
    constructor(options: GlyphOptions);
    index: number;
    unicode?: number;
    advanceWidth?: number;
    path: Path;
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
  }

  export interface FontOptions {
    familyName: string;
    styleName: string;
    unitsPerEm: number;
    ascender: number;
    descender: number;
    glyphs: Glyph[];
    [option: string]: unknown;
  }

  export class Substitution {
    addLigature(feature: string, ligature: { sub: number[]; by: number }): void;
  }

  export class Font {
    constructor(options: FontOptions);
    names: unknown;
    tables: Record<string, unknown>;
    unitsPerEm: number;
    ascender: number;
    descender: number;
    glyphs: { length: number; get(index: number): Glyph };
    substitution: Substitution;
    charToGlyph(char: string): Glyph;
    charToGlyphIndex(char: string): number;
    toArrayBuffer(): ArrayBuffer;
  }

  export function parse(buffer: ArrayBuffer): Font;
}
