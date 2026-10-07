// Typed wrapper around the Episode 1 WASM sim exports and its memory views.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { loadWasm, MemoryViews } from '@lieutenant-fizz/engine/wasm';
import { Out, STRIDE, Table } from './protocol';

/** Raw exports of the Episode 1 WASM sim. */
export interface SimExports {
  memory: WebAssembly.Memory;
  stride(): number;
  table_len(table: number): number;
  name_ptr(table: number, i: number): number;
  name_len(table: number, i: number): number;
  caption_colour(i: number): number;
  sprite_table_ptr(): number;
  instance_ptr(): number;
  instance_capacity(): number;
  out_ptr(): number;
  lights_pos_ptr(): number;
  lights_col_ptr(): number;
  events_ptr(): number;
  events_len(): number;
  events_clear(): void;
  game_new(): void;
  load_attract(): void;
  enter_level(id: number): void;
  enter_map(): void;
  enter_none(): void;
  set_view(halfW: number, halfH: number): void;
  step(held: number): void;
  render(alpha: number, flags: number): number;
  mode(): number;
  state_get(i: number): number;
  state_set(i: number, v: number): void;
  thumb_w(): number;
  thumb_h(): number;
  thumb_ptr(): number;
  area_of(x: number, y: number): number;
}

/** Atlas rectangle of a sprite: UV origin and size plus the size in logical pixels. */
export interface SpriteRect {
  u: number;
  v: number;
  uw: number;
  vh: number;
  w: number;
  h: number;
}

export interface SimEvent {
  kind: number;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
}

const EVENT_STRIDE = 6;

/** Typed wrapper over the WASM sim: shared-buffer views, name tables and event draining. */
export class Sim {
  readonly x: SimExports;
  private readonly views: MemoryViews;
  /** Capacity of the instance buffer, in instances. */
  readonly capacity: number;

  private constructor(x: SimExports) {
    this.x = x;
    this.views = new MemoryViews(x.memory);
    this.capacity = x.instance_capacity();
    if (x.stride() !== STRIDE) throw new Error(`instance stride mismatch: wasm ${x.stride()}`);
  }

  static async load(source: string | URL | BufferSource): Promise<Sim> {
    const { exports } = await loadWasm<SimExports>(source);
    return new Sim(exports);
  }

  /** Names of every entry in a Rust-owned table (sprites, captions, toasts). */
  names(table: number): string[] {
    const out: string[] = [];
    for (let i = 0, n = this.x.table_len(table); i < n; i++) {
      out.push(this.views.string(this.x.name_ptr(table, i), this.x.name_len(table, i)));
    }
    return out;
  }

  /**
   * The overworld flattened to one byte per tile, row 0 at the south: `kind | aux << 4`, where kind
   * 0 is grass (aux is the area), 1 is river and 2 is a level node (aux is the level id).
   */
  overworldThumb(): { w: number; h: number; cells: Uint8Array } {
    const w = this.x.thumb_w();
    const h = this.x.thumb_h();
    return { w, h, cells: this.views.u8('thumb', this.x.thumb_ptr(), w * h) };
  }

  /** The overworld area id at a tile position. */
  areaOf(x: number, y: number): number {
    return this.x.area_of(x, y);
  }

  captionColour(i: number): number {
    return this.x.caption_colour(i);
  }

  /** Sprite names the sim draws, in id order. */
  spriteNames(): string[] {
    return this.names(Table.SPRITES);
  }

  /** Fills the sim's sprite rect table; throws if the atlas lacks a sprite the sim draws. */
  setSprites(rects: Readonly<Record<string, SpriteRect>>): void {
    const names = this.spriteNames();
    const t = this.views.f32('sprites', this.x.sprite_table_ptr(), names.length * 6);
    names.forEach((name, i) => {
      const r = rects[name];
      if (!r) throw new Error(`atlas is missing sprite "${name}" required by the sim`);
      t.set([r.u, r.v, r.uw, r.vh, r.w, r.h], i * 6);
    });
  }

  /** Per-frame facts: instance count, camera, light count, clear colour, ambient. */
  get out(): Float32Array {
    return this.views.f32('out', this.x.out_ptr(), 16);
  }

  /** The first `n` instances (n * 20 floats) of the shared instance buffer. */
  instances(n: number): Float32Array {
    return this.views.f32('inst', this.x.instance_ptr(), n * STRIDE);
  }

  /** All 20-float-stride capacity, for uploading as the GPU buffer's backing array. */
  get instanceBuffer(): Float32Array {
    return this.views.f32('inst-all', this.x.instance_ptr(), this.capacity * STRIDE);
  }

  get lightPos(): Float32Array {
    return this.views.f32('lpos', this.x.lights_pos_ptr(), 64);
  }

  get lightCol(): Float32Array {
    return this.views.f32('lcol', this.x.lights_col_ptr(), 48);
  }

  /** Drains the event queue. */
  drainEvents(): SimEvent[] {
    const n = this.x.events_len();
    if (n === 0) return [];
    const f = this.views.f32('events', this.x.events_ptr(), n * EVENT_STRIDE);
    const list: SimEvent[] = [];
    for (let i = 0; i < n; i++) {
      const o = i * EVENT_STRIDE;
      list.push({
        kind: f[o] ?? 0,
        a: f[o + 1] ?? 0,
        b: f[o + 2] ?? 0,
        c: f[o + 3] ?? 0,
        d: f[o + 4] ?? 0,
        e: f[o + 5] ?? 0,
      });
    }
    this.x.events_clear();
    return list;
  }

  step(held: number): void {
    this.x.step(held);
  }

  render(alpha: number, flags: number): number {
    return this.x.render(alpha, flags);
  }

  get(i: number): number {
    return this.x.state_get(i);
  }

  set(i: number, v: number): void {
    this.x.state_set(i, v);
  }

  get camera(): { x: number; y: number } {
    const o = this.out;
    return { x: o[Out.CAM_X] ?? 0, y: o[Out.CAM_Y] ?? 0 };
  }
}
