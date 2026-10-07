// Where Ben is, and which pose he is in, on the title screen. Pure: the shell draws the result.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The sprites Ben uses on the title. */
export type BenPose = 'stand' | 'jump' | 'shoot' | 'pogo' | 'pogo2';

/** One frame of Ben on the title, in whole CSS pixels from the bottom-left of the wordmark. */
export interface BenFrame {
  pose: BenPose;
  /** Pixels right of the wordmark's left edge to the sprite's left edge. */
  x: number;
  /** Pixels above the wordmark's bottom edge to the sprite's feet. */
  y: number;
  /** Faces left. */
  flip: boolean;
  /** Lean in degrees. */
  rot: number;
}

/** Sizes the animation depends on, in CSS pixels. */
export interface BenBox {
  /** Width of the wordmark. */
  logoW: number;
  /** Height of the wordmark. */
  logoH: number;
  /** Width Ben is drawn at: 16 sprite pixels times the scale. */
  width: number;
}

/** What is happening on the menu right now. */
export interface BenCues {
  /** Reduced motion: Ben stands still. */
  reduced: boolean;
  /** Seconds left of the wave after a menu item is picked; 0 when not waving. */
  waveLeft: number;
  /** The selection moved a moment ago, so Ben turns to face the menu. */
  looking: boolean;
}

/** Seconds the whole loop takes. */
export const BEN_CYCLE = 14;
/** Seconds of the wave when an item is picked. */
export const BEN_WAVE = 0.9;
/** Seconds Ben keeps facing the menu after the selection moves. */
export const BEN_LOOK = 1.6;

/** Whole pixels per sprite pixel for Ben on the title, from the window height: 2 to 4. */
export const benScale = (viewportHeight: number): number =>
  Math.max(2, Math.min(4, Math.round(viewportHeight / 220)));

const frame = (pose: BenPose, x: number, y: number, flip: boolean, rot = 0): BenFrame => ({
  pose,
  x: Math.round(x),
  y: Math.max(0, Math.round(y)),
  flip,
  rot,
});

/**
 * Ben at `t` seconds. He stands at the end of the wordmark with a one-pixel bob, leans on the logo
 * now and then, hops up and pogoes across the top of it and back, faces the menu when the selection
 * moves, and waves (the shoot pose) when an item is picked. Under reduced motion he only stands.
 */
export function benFrame(box: BenBox, t: number, cues: BenCues): BenFrame {
  const { logoW, logoH, width: bw } = box;
  const home = logoW + 6;
  if (cues.reduced) return frame('stand', home, 0, false);
  if (cues.waveLeft > 0) {
    const k = 1 - cues.waveLeft / BEN_WAVE;
    return frame('shoot', home, Math.sin(k * Math.PI) * bw * 0.4, true);
  }
  const p = ((t % BEN_CYCLE) + BEN_CYCLE) % BEN_CYCLE;
  const bob = Math.floor(p * 1.5) % 2 ? Math.round(bw / 16) : 0;
  if (p >= 4.5 && p < 6.5) return frame('stand', home - bw / 6, 0, cues.looking, -12);
  if (p >= 9 && p < 13) {
    const topY = logoH - bw * 0.3;
    const startX = home - bw;
    if (p < 9.4) {
      const k = (p - 9) / 0.4;
      return frame(
        'jump',
        home + (startX - home) * k,
        topY * k + Math.sin(k * Math.PI) * bw * 0.5,
        true,
      );
    }
    if (p < 12.6) {
      const q = p < 11 ? (p - 9.4) / 1.6 : 1 - (p - 11) / 1.6;
      const hop = Math.abs(Math.sin((p - 9.4) * Math.PI * 2.5));
      return frame(hop < 0.25 ? 'pogo2' : 'pogo', startX * (1 - q), topY + hop * bw * 0.45, p < 11);
    }
    const k = (p - 12.6) / 0.4;
    return frame(
      'jump',
      startX + (home - startX) * k,
      topY * (1 - k) + Math.sin(k * Math.PI) * bw * 0.4,
      false,
    );
  }
  return frame('stand', home, bob, cues.looking);
}
