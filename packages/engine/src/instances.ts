// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { AtlasRect } from './atlas';

/** Per-sprite draw options (same meaning as `PushOpts` in the Rust engine). */
export interface PushOptions {
  /** Uniform scale. */
  s?: number;
  /** Extra non-uniform scale on x / y. */
  sx?: number;
  sy?: number;
  flip?: boolean;
  /** Rotation in radians. */
  rot?: number;
  /** 24-bit RGB tint multiplied with the sprite. */
  tint?: number;
  alpha?: number;
  /** Emissive: bypasses lighting. */
  em?: boolean;
  /** Actor: lit with a minimum brightness. */
  act?: boolean;
}

/**
 * Writes sprite instances (20 floats each) into a Float32Array front to back. The Rust sim does
 * this for levels and the overworld; the shell uses this twin for cinematics and effects drawn
 * in TypeScript, so both fill the same buffer layout.
 */
export class InstanceWriter {
  n = 0;

  constructor(
    private buf: Float32Array,
    private readonly rects: Readonly<Record<string, AtlasRect>>,
  ) {}

  /** Points the writer at a (possibly new) backing array, e.g. after WASM memory growth. */
  rebind(buf: Float32Array): void {
    this.buf = buf;
  }

  reset(): void {
    this.n = 0;
  }

  get capacity(): number {
    return Math.floor(this.buf.length / 20);
  }

  /** Appends a sprite centred at (x, y) in world units. Unknown names and overflow are ignored. */
  push(x: number, y: number, name: string, o: PushOptions = {}): void {
    const sp = this.rects[name];
    if (!sp || this.n >= this.capacity) return;
    const b = this.buf;
    const i = this.n * 20;
    const sc = o.s ?? 1;
    const sx = (sp.w / 16) * sc * (o.flip ? -1 : 1) * (o.sx ?? 1);
    const sy = (sp.h / 16) * sc * (o.sy ?? 1);
    const r = o.rot ?? 0;
    if (r) {
      const cs = Math.cos(r);
      const sn = Math.sin(r);
      b[i] = cs * sx;
      b[i + 1] = sn * sx;
      b[i + 4] = -sn * sy;
      b[i + 5] = cs * sy;
    } else {
      b[i] = sx;
      b[i + 1] = 0;
      b[i + 4] = 0;
      b[i + 5] = sy;
    }
    b[i + 2] = 0;
    b[i + 6] = 0;
    b[i + 8] = 0;
    b[i + 9] = 0;
    b[i + 10] = 1;
    b[i + 11] = 0;
    b[i + 3] = sp.uw;
    b[i + 7] = sp.vh;
    b[i + 12] = x;
    b[i + 13] = y;
    b[i + 14] = 0;
    b[i + 15] = 1;
    b[i + 16] = sp.u;
    b[i + 17] = sp.v;
    b[i + 18] = o.tint ?? 0xffffff;
    b[i + 19] = (o.alpha ?? 1) + (o.em ? 2 : 0) + (o.act ? 4 : 0);
    this.n++;
  }
}

/**
 * Fixed-timestep accumulator (ENGINE_SPEC §4.2): feed it frame deltas, it tells you how many
 * fixed ticks to run and the interpolation alpha for rendering. Catch-up is capped so a stalled
 * tab never spirals.
 */
export class FixedStepper {
  private acc = 0;

  constructor(
    readonly step = 1 / 60,
    readonly maxCatchUp = 0.25,
  ) {}

  /** Advances by `dt` seconds, calling `tick` once per fixed step; returns the render alpha. */
  advance(dt: number, tick: () => void): number {
    this.acc += Math.min(Math.max(dt, 0), this.maxCatchUp);
    while (this.acc >= this.step) {
      tick();
      this.acc -= this.step;
    }
    return this.acc / this.step;
  }

  reset(): void {
    this.acc = 0;
  }
}
