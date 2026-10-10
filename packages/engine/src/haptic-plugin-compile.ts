// The plugin compiler's tunable constants, apart from the compiler so `GameHaptics` can hold them without loading it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Tunable constants of the plugin compiler. */
export interface PluginCompile {
  /** Intensity below this plays nothing. */
  floor: number;
  /** Length of one slice of a hum in a waveform, in ms. */
  slice: number;
  /** The longest effect sent, in ms. */
  maxMs: number;
  /** Perceptual curve: the strength sent is `gain * intensity ^ gamma`, so a quiet cue is still felt. 1 is linear. */
  gamma: number;
  /** Multiplies the curved strength (it is clamped to 1 after, so full strength stays full). */
  gain: number;
  /** The quietest primitive scale sent for a tap that passes the floor. */
  primMin: number;
  /** The quietest amplitude sent (0 to 1 of the motor's range) for a tap or a hum slice that passes the floor. */
  ampMin: number;
  /** A tap sharper than this is a tick (the lightest primitive). */
  tickAt: number;
  /** A tap sharper than this (and less than `tickAt`) is a click. */
  clickAt: number;
  /** A tap sharper than this (and less than `clickAt`) is a low tick; duller than it is a thud. */
  lowAt: number;
  /** A tap at or above this strength (before the curve) gets a thud after its primitive; above 1 never. */
  doubleAt: number;
}

/**
 * The plugin compiler's defaults, tuned from a Pixel 8 Pro's first feedback: the curve (`0.6`) and gain
 * (`1.3`) lift a half-strength tap to 0.86 at Strong, 0.72 at Medium and 0.57 at Light, and no primitive is
 * sent below 0.3.
 */
export const PLUGIN_COMPILE: Readonly<PluginCompile> = {
  floor: 0.08,
  slice: 20,
  maxMs: 1000,
  gamma: 0.6,
  gain: 1.3,
  primMin: 0.3,
  ampMin: 0.25,
  tickAt: 0.85,
  clickAt: 0.5,
  lowAt: 0.3,
  doubleAt: 0.7,
};

/** The range each plugin compile constant may take when tuned. */
export const PLUGIN_LIMITS: Readonly<Record<keyof PluginCompile, readonly [number, number]>> = {
  floor: [0, 1],
  slice: [5, 100],
  maxMs: [50, 3000],
  gamma: [0.2, 1.5],
  gain: [0.5, 3],
  primMin: [0, 1],
  ampMin: [0, 1],
  tickAt: [0, 1],
  clickAt: [0, 1],
  lowAt: [0, 1],
  doubleAt: [0, 1.01],
};
