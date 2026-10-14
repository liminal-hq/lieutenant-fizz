// Episode 1's save-slot thumbnail: the engine's mini overworld, in the colours of this episode's areas.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  thumbDataUrl as drawThumb,
  thumbPixels as pixels,
  type ThumbData,
  type ThumbPalette,
} from '@lieutenant-fizz/engine/menu/overworld-thumb';

/** The ground colour of each overworld area, by area id, and the colours of the river, the nodes and Ben's marker. */
export const THUMB_PALETTE: ThumbPalette = {
  areas: [0x2e9d3f, 0xf29bc3, 0xa78bfa, 0xcfe6ff, 0x55d46a],
  river: 0x6b3f1f,
  nodeCleared: 0xffaa40,
  nodeOpen: 0xffffff,
  ben: 0xf43f5e,
};

/** The thumbnail as RGBA pixels (see the engine's `thumbPixels`), in Episode 1's colours. */
export const thumbPixels = (
  t: ThumbData,
  doneMask: number,
  map?: { x: number; y: number },
): Uint8ClampedArray<ArrayBuffer> => pixels(t, doneMask, map, THUMB_PALETTE);

/** The thumbnail as a PNG data URL, for an image the page scales up without smoothing. */
export const thumbDataUrl = (
  t: ThumbData,
  doneMask: number,
  map?: { x: number; y: number },
): string => drawThumb(t, doneMask, map, THUMB_PALETTE);
