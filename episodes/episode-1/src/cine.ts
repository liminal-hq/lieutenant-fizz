// Opening cinematic scenes (yard, lab, liftoff, flight) drawn as sprite instances.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { InstanceWriter, PushOptions } from '@lieutenant-fizz/engine/instances';

/** Deterministic 2D hash in [0, 1) (same function as the sim's `hashf`). */
export function hashf(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Star {
  x: number;
  y: number;
  z: number;
}

interface Puff {
  x: number;
  y: number;
  t: number;
  life: number;
  vx: number;
  vy: number;
  tint: number;
}

/** Visible half height of a cinematic scene, in tiles. */
export const CINE_TALL = 14;

const GROUND = -2.5;

/**
 * The opening cinematic's scenes, drawn in TypeScript into the shared instance buffer: the
 * backyard, the secret lab, liftoff, then the flight to Zargoth (ported from the prototype).
 */
export class Cinematic {
  t = 0;
  stage = 0;
  private stT = 0;
  /** The Liftoff scene waits for `launch()`, so the hatch and the climb follow the text that describes them. */
  private held = false;
  private readonly stars: Star[] = [];
  private fx: Puff[] = [];
  private sx = 0;
  private sy = 2;
  private ly = -4.4;
  private scroll = 0;

  constructor(private readonly random: () => number = Math.random) {
    for (let i = 0; i < 260; i++) {
      this.stars.push({
        x: (hashf(i, 1) - 0.5) * 60,
        y: (hashf(i, 2) - 0.5) * 30,
        z: 0.2 + hashf(i, 3) * 0.8,
      });
    }
  }

  /** Switches to a scene (0 yard, 1 lab, 2 liftoff, 3..7 flight and landing). */
  start(stage: number): void {
    this.stage = stage;
    this.stT = 0;
    this.held = stage === 2;
    this.ly = -4.4;
    this.scroll = 0;
    if (stage === 3) {
      this.sx = 0;
      this.sy = 0.5;
      this.fx = [];
    }
  }

  /** Lets the Liftoff scene's hatch open and the saucer rise (the scene's clock starts here). */
  launch(): void {
    this.held = false;
  }

  /** True while the Liftoff scene is waiting for `launch()`. */
  get waiting(): boolean {
    return this.held;
  }

  tick(dt: number): void {
    this.t += dt;
    if (!this.held) this.stT += dt;
    for (const f of this.fx) {
      f.t += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    this.fx = this.fx.filter((f) => f.t < f.life);
    const tick20 = Math.floor(this.t * 20) !== Math.floor((this.t - dt) * 20);
    if (this.stage === 2) {
      const T = this.stT;
      const prev = this.ly;
      this.ly = -4.4 + Math.max(0, T - 1.3) ** 2 * 1.7;
      this.scroll = Math.max(0, this.ly - 0.5);
      const v = (this.ly - prev) / Math.max(dt, 1e-4);
      if (T > 1.3 && this.ly > -3.2 && tick20) {
        this.fx.push({
          x: (this.random() - 0.5) * 1.4,
          y: this.ly - this.scroll - 0.7,
          t: 0,
          life: 0.9,
          vx: (this.random() - 0.5) * 2,
          vy: -2 - (this.scroll > 0 ? v : 0),
          tint: 0xff5555,
        });
      }
      return;
    }
    if (this.stage < 2) return;
    const os = this.stage - 2;
    const sp = ([
      [0, 0.3],
      [0, -8],
      [-3, 0],
      [-40, 0],
      [-6, 0],
      [-1, 0.5],
    ][os] ?? [0, 0]) as [number, number];
    for (const st of this.stars) {
      st.x += sp[0] * st.z * dt;
      st.y += sp[1] * st.z * dt;
      if (st.x < -30) st.x += 60;
      if (st.x > 30) st.x -= 60;
      if (st.y < -15) st.y += 30;
      if (st.y > 15) st.y -= 30;
    }
    this.sy +=
      ((os === 5 ? 2.6 - Math.min(this.stT, 4) * 0.3 : 3) - this.sy) * Math.min(1, dt * 1.5);
    if (tick20) {
      this.fx.push(
        os === 1
          ? {
              x: this.sx + (this.random() - 0.5) * 1.2,
              y: this.sy - 0.7,
              t: 0,
              life: 0.8,
              vx: 0,
              vy: -5,
              tint: 0xff5555,
            }
          : {
              x: this.sx - 1.6,
              y: this.sy - 0.1 + Math.sin(this.t * 9) * 0.1,
              t: 0,
              life: 0.8,
              vx: -6,
              vy: 0,
              tint: 0xff5555,
            },
      );
    }
  }

  draw(w: InstanceWriter): void {
    const { stage } = this;
    if (stage === 0) this.drawYard(w, 0, false);
    else if (stage === 1) this.drawLab(w);
    else if (stage === 2) this.drawYard(w, this.scroll, true);
    else {
      const os = stage - 2;
      for (const st of this.stars) {
        const str = os === 3 ? 1 + st.z * 10 : 1;
        const strY = os === 1 ? 1 + st.z * 3 : 1;
        w.push(st.x, st.y, 'star', {
          s: 0.6 + st.z * 0.6,
          sx: str,
          sy: strY,
          em: true,
          alpha: 0.5 + st.z * 0.5,
          tint: st.z > 0.8 ? 0xffff55 : 0xffffff,
        });
      }
      if (os >= 4) {
        const k = os === 4 ? Math.min(1, this.stT / 6) : 1;
        const sc = os === 4 ? 1.5 + k * 3.5 : 9;
        const px = os === 4 ? 9 - k * 3 : 0;
        const py = os === 4 ? 3.5 : -10 - Math.min(this.stT, 4) * 0.2;
        w.push(px, py, 'planet', { s: sc, em: true });
      }
    }
    for (const f of this.fx) {
      w.push(f.x, f.y, 'puff', { s: 0.6 + f.t, em: true, alpha: 1 - f.t / f.life, tint: f.tint });
    }
    if (stage >= 3) {
      w.push(this.sx, this.sy + Math.sin(this.t * 2.2) * 0.12, 'saucer', {
        s: 1.6,
        em: true,
        rot: stage === 7 ? -0.08 : Math.sin(this.t * 1.3) * 0.03,
      });
    }
  }

  private drawYard(w: InstanceWriter, oy: number, launch: boolean): void {
    const { t, stT: T } = this;
    const F = 'fill';
    const G = GROUND;
    const P = (x: number, y: number, name: string, o: PushOptions = {}): void =>
      w.push(x, y - oy, name, { em: true, ...o });
    w.push(0, 0, F, { sx: 40, sy: 20, tint: 0x070718, em: true });
    P(0, G + 2.4, F, { sx: 40, sy: 3, tint: 0x110d2c });
    P(0, G + 1.1, F, { sx: 40, sy: 1.4, tint: 0x22143a });
    for (const st of this.stars) {
      const yy = ((((st.y + 15 - oy * 0.3 * st.z) % 30) + 30) % 30) - 15;
      if (yy > G - oy + 1.4) {
        w.push(st.x * 0.45, yy, 'star', {
          s: 0.35 + st.z * 0.4,
          em: true,
          alpha: 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.6 + st.z * 40)),
          tint: st.z > 0.85 ? 0xffff55 : 0xffffff,
        });
      }
    }
    w.push(-6.5, 4.4 - oy * 0.3, 'moon', { s: 1.5, em: true });
    for (let x = -14; x < 14; x++) P(x + 0.5, G + 0.9, 'hillTop', { tint: 0x1b1638 });
    P(0, G + 0.2, F, { sx: 40, sy: 0.42, tint: 0x1b1638 });
    P(-8.2, G + 1.75, 'house', { s: 1.4, tint: 0x8a90bb });
    P(-9.1, G + 1.3, 'puff', { s: 1.8, alpha: 0.2, tint: 0xffd866 });
    for (let x = -13.5; x <= 13.5; x++) P(x, G + 0.5, 'fence', { tint: 0x5e6490 });
    P(6, G + 3.75, 'bigTree', { s: 1.5, tint: 0x9aa2cc });
    P(5.16, G + 4.5, 'puff', { s: 2, alpha: 0.2, tint: 0xffd866 });
    if (!launch) {
      P(6, G + 0.45, 'puff', { s: 1.3 + 0.15 * Math.sin(t * 3), alpha: 0.4, tint: 0xffcc44 });
      P(6, G + 1.4, F, { sx: 0.5, sy: 1.8, alpha: 0.1, tint: 0xffdd88 });
    }
    const sau = (): void => P(0, this.ly, 'saucer', { s: 1.6, rot: Math.sin(t * 6) * 0.02 });
    if (launch && this.ly < -3.2) sau();
    P(0, G - 4, F, { sx: 40, sy: 8, tint: 0x0b2412 });
    P(0, G - 0.06, F, { sx: 40, sy: 0.14, tint: 0x2f7a34 });
    const k = launch ? Math.min(1, T / 1.2) : 0;
    if (k > 0) {
      P(0, G - 0.08, F, { sx: 2.6 * k, sy: 0.2, tint: 0x000000 });
      P(0, G + 0.15, 'puff', { s: 2.2 * k, alpha: 0.35 * k, tint: 0x55ffff });
    }
    P(-0.65 - k * 1.3, G - 0.04, F, { sx: 1.3, sy: 0.14, tint: 0x8888aa });
    P(0.65 + k * 1.3, G - 0.04, F, { sx: 1.3, sy: 0.14, tint: 0x8888aa });
    if (launch && this.ly >= -3.2) sau();
    if (!launch) {
      const bx = -10 + Math.min(T, 6.6) * 2.2;
      const walk = T < 6.6;
      P(bx, G + 0.75, walk ? (Math.floor(t * 8) & 1 ? 'ben_run1' : 'ben_run2') : 'ben_stand', {
        tint: 0xc8ccee,
      });
    }
    for (let i = 0; i < 9; i++) {
      const fx = hashf(i, 9) * 22 - 11 + Math.sin(t * 0.6 + i) * 1.2;
      const fy = G + 0.6 + hashf(i, 4) * 3 + Math.sin(t * 1.3 + i * 2) * 0.4;
      P(fx, fy, 'star', {
        s: 0.6,
        alpha: 0.25 + 0.75 * Math.max(0, Math.sin(t * 2.4 + i * 1.7)),
        tint: 0xffff55,
      });
    }
  }

  private drawLab(w: InstanceWriter): void {
    const { t, stT: T } = this;
    const F = 'fill';
    const G = GROUND;
    const f = Math.floor(t * 3) & 1;
    const P = (x: number, y: number, name: string, o: PushOptions = {}): void =>
      w.push(x, y, name, { em: true, ...o });
    for (let x = -14; x < 14; x++)
      for (let y = Math.floor(G); y < 8; y++) P(x + 0.5, y + 0.5, 'labPanel', { tint: 0x5a5a88 });
    P(0, 5.6, F, { sx: 40, sy: 0.3, tint: 0x3a3a55 });
    P(0, 5.38, F, { sx: 40, sy: 0.1, tint: 0x8a8ab0 });
    P(-4.2, 1.6, 'blueprint', { s: 1.3 });
    P(-1.1, 2.1, 'blueprint', { flip: true });
    P(6, 5.1, F, { sx: 4.6, sy: 0.35, tint: 0x0c0c18 });
    P(6, 4.88, F, { sx: 4.6, sy: 0.08, tint: 0x55ffff, alpha: 0.6 + 0.4 * f });
    P(-11.3, G + 1, `console${f}`);
    P(11.3, G + 1, `console${1 - f}`, { flip: true });
    P(6, G + 0.3, 'pad', { s: 1.2 });
    P(6, G + 1.4 + Math.sin(t * 2) * 0.05, 'saucer', { s: 1.6 });
    P(-1.2, 4.4, 'lamp');
    for (let y = Math.floor(G); y < 8; y++) P(-8, y + 0.5, 'ladder');
    P(0, G - 4, F, { sx: 40, sy: 8, tint: 0x22223a });
    P(0, G - 0.06, F, { sx: 40, sy: 0.14, tint: 0x9a9ac0 });
    P(-1, G + 0.5, 'bench');
    P(-1.22, G + 0.78, 'puff', { s: 0.9 + 0.15 * Math.sin(t * 4), alpha: 0.35, tint: 0xffff88 });
    let bx = -8;
    let by = G + 0.75;
    let walk = false;
    if (T < 2.2) by = 4 + (G + 0.75 - 4) * (T / 2.2);
    else {
      const ww = Math.min(T - 2.2, 2.35);
      bx = -8 + ww * 2.3;
      walk = ww < 2.35;
    }
    P(bx, by, walk ? (Math.floor(t * 8) & 1 ? 'ben_run1' : 'ben_run2') : 'ben_stand');
  }
}
