// Tests that the opening titles keep the DOS port's timing, stay deterministic and only use sprites the game has.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { PATTERNS } from './audio/patterns';
import {
  BEN_FROM,
  BEN_H,
  BEN_W,
  CUES,
  DESIGN,
  STUN_SECONDS,
  TITLES_H,
  TITLES_SECONDS,
  TITLES_TICKS,
  TITLES_W,
  benPose,
  enemies,
  fade,
  fizz,
  flash,
  presents,
  shotsPlanned,
  speedLines,
  stars,
  wordRows,
  wordmark,
} from './titles';
import { drawTitles, type TitlesAssets } from './titles-draw';
import { TITLES_SPRITES, gridPixels, titleSprites } from './titles-sprites';
import { defineSprites } from './sprites/catalog';

/** The time of a tick of the DOS port's 60 Hz loop. */
const tick = (n: number): number => n / 60;

describe('the titles’ timeline', () => {
  it('runs 768 ticks, which is the 12.8 seconds of the song', () => {
    expect(TITLES_TICKS / 60).toBeCloseTo(TITLES_SECONDS, 9);
    const song = PATTERNS.songs?.['openingTitles'];
    expect(song).toBeDefined();
    const seconds = (song!.cycles.reduce((a, b) => a + b, 0) * 240) / song!.bpm;
    expect(seconds).toBeCloseTo(TITLES_SECONDS, 9);
    expect(CUES).toEqual({ presents: 0, words: 3.2, chase: 6.4 });
  });

  it('brings in "Liminal HQ" at tick 43, "presents" at 91 and takes "presents" away by 180', () => {
    expect(presents(tick(42)).nameAlpha).toBe(0);
    expect(presents(tick(43)).nameAlpha).toBeGreaterThan(0);
    expect(presents(tick(90)).presentsAlpha).toBe(0);
    expect(presents(tick(91)).presentsAlpha).toBeGreaterThan(0);
    expect(presents(tick(179)).presentsAlpha).toBeGreaterThan(0);
    expect(presents(tick(180)).presentsAlpha).toBe(0);
  });

  it('whips the words in after the presents, and brings the kicker at tick 295 and the line at 469', () => {
    expect(wordmark(tick(192)).lieutenantX).toBe(2400);
    expect(wordmark(tick(210)).lieutenantX).toBeLessThan(2400);
    expect(wordmark(tick(294)).kickerAlpha).toBe(0);
    expect(wordmark(tick(295)).kickerAlpha).toBeGreaterThan(0);
    expect(wordmark(tick(468)).lineAlpha).toBe(0);
    expect(wordmark(tick(469)).lineAlpha).toBeGreaterThan(0);
  });

  it('settles the words where they stop, and slants them only while they move', () => {
    const early = wordmark(tick(200));
    expect(Math.abs(early.lieutenantSkew)).toBeGreaterThan(0);
    const late = wordmark(tick(400));
    expect(late.lieutenantX).toBe(0);
    expect(late.fizzX).toBe(0);
    expect(late.lieutenantSkew).toBe(0);
    for (let n = 0; n < TITLES_TICKS; n++) {
      expect(Math.abs(wordmark(tick(n)).lieutenantSkew)).toBeLessThanOrEqual(25);
    }
  });

  it('flashes white as "Fizz" slams in, and at no other time', () => {
    expect(flash(tick(250))).toBe(0);
    expect(flash(tick(265))).toBeGreaterThan(0.5);
    expect(flash(tick(268))).toBeGreaterThan(0.3);
    expect(flash(tick(300))).toBe(0);
    expect(flash(tick(600))).toBe(0);
  });

  it('is black at the start and the end, so the loop turns over unseen, and clear between', () => {
    expect(fade(0)).toBe(1);
    expect(fade(TITLES_SECONDS)).toBe(1);
    expect(fade(6)).toBe(0);
    // The fade out begins 1.3 s before the end and is black 0.2 s before it, so the last moment is a held black.
    expect(fade(TITLES_SECONDS - 1.4)).toBe(0);
    expect(fade(TITLES_SECONDS - 0.75)).toBeGreaterThan(0.3);
    expect(fade(TITLES_SECONDS - 0.75)).toBeLessThan(0.7);
    expect(fade(TITLES_SECONDS - 0.2)).toBe(1);
  });
});

describe('the backdrop', () => {
  it('has seventy stars, in the space, and is deterministic', () => {
    const a = stars(2.5);
    expect(a).toHaveLength(70);
    expect(stars(2.5)).toEqual(a);
    for (const s of a) {
      expect(s.x).toBeGreaterThanOrEqual(-24);
      expect(s.x).toBeLessThanOrEqual(TITLES_W + 20);
      expect(s.y).toBeLessThanOrEqual(TITLES_H);
      expect(s.alpha).toBeGreaterThan(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
    }
  });

  it('drifts four rows of words, left and right in turn, that stay dim', () => {
    const rows = wordRows(5);
    expect(rows.map((r) => r.text.split('  ')[0])).toEqual([
      'Lieutenant',
      'Fizz',
      'Lieutenant',
      'Fizz',
    ]);
    expect(rows[0]!.x).toBeLessThan(wordRows(0)[0]!.x);
    expect(rows[1]!.x).toBeGreaterThan(wordRows(0)[1]!.x);
    for (const r of rows) expect(r.alpha).toBeLessThanOrEqual(0.55);
  });

  it('has fourteen speed lines, all inside the width plus their length', () => {
    for (const l of speedLines(8)) {
      expect(l.x).toBeLessThanOrEqual(TITLES_W);
      expect(l.x + l.length).toBeGreaterThan(0);
    }
    expect(speedLines(8)).toHaveLength(14);
  });
});

describe('the chase', () => {
  it('puts Ben on at the start of the chase, and keeps his muzzle near him', () => {
    expect(BEN_FROM).toBeGreaterThan(CUES.chase);
    const p = benPose(9);
    expect(p.run).toBeGreaterThanOrEqual(0);
    expect(p.run).toBeLessThanOrEqual(1);
    expect(Math.abs(p.muzzle.x - p.x)).toBeLessThan(BEN_W * 22);
    expect(Math.abs(p.muzzle.y - p.y)).toBeLessThan(BEN_H * 22);
  });

  it('fires no bubble before Ben’s first shot, and all are gone by the end', () => {
    const first = shotsPlanned()[0]!.fired;
    expect(first).toBeGreaterThan(CUES.chase + 1.2);
    expect(fizz(first - 0.01)).toEqual([]);
    expect(fizz(first + 0.1).length).toBeGreaterThan(0);
    for (const b of fizz(first + 0.3)) {
      expect(b.scale).toBeGreaterThan(0);
      expect(b.alpha).toBeGreaterThan(0);
      expect(b.alpha).toBeLessThanOrEqual(1);
    }
    expect(fizz(14)).toEqual([]);
  });

  it('sends seven Zargs in, each on one of its two frames, none stunned before a bubble lands', () => {
    const calm = enemies(7.0);
    expect(calm).toHaveLength(7);
    for (const e of calm) {
      expect(e.sprite).toMatch(/^[a-z]+[01]$/);
      expect(e.stunned).toBe(false);
      expect(e.flash).toBe(false);
    }
    expect(new Set(calm.map((e) => e.sprite.replace(/[01]$/, ''))).size).toBe(7);
    // Every one has arrived by the time Ben starts firing.
    expect(enemies(7.8).every((e) => e.x > -1400)).toBe(true);
  });

  it('flies every bubble straight left from the muzzle, never aimed', () => {
    for (const s of shotsPlanned()) {
      // The same height for the whole flight, from the first frame to the pop.
      for (const age of [0.02, 0.1, 0.25, 0.4]) {
        const f = fizz(s.fired + age).filter((b) => Math.abs(b.y - s.from.y) < 0.001);
        expect(f.length, `shot at ${s.fired}`).toBeGreaterThan(0);
        expect(f.every((b) => b.x <= s.from.x)).toBe(true);
      }
    }
  });

  it('times the shots to the hopper: each meets it near the top of a jump, and the gloop is stunned next', () => {
    const shots = shotsPlanned();
    const hopperHits = shots.filter((s) => s.hit?.enemy === 1);
    expect(hopperHits.length).toBeGreaterThanOrEqual(2);
    for (const s of hopperHits) {
      // The hopper jumps as |sin(4t + 1.1)|; the bubble arrives where that is near its peak.
      expect(Math.abs(Math.sin(4 * s.hit!.at + 1.1)), `hit at ${s.hit!.at}`).toBeGreaterThan(0.6);
    }
    // After the hopper is knocked out of the way, the next bubble that lands is on the gloop behind it.
    const order = shots.filter((s) => s.hit && s.hit.enemy <= 1).map((s) => s.hit!.enemy);
    expect(order.slice(0, 2)).toEqual([1, 0]);
    // Ben fires on the hopper's rhythm, not every 0.32 s: the first shot waits for a jump.
    expect(shots[0]!.fired).toBeGreaterThan(CUES.chase + 1.3);
  });

  it('stuns the hopper and the gloop, with the stars over them, and nothing before the first bubble lands', () => {
    const stunned = new Set<string>();
    let flashes = 0;
    let first = Infinity;
    for (let n = 0; n < TITLES_TICKS; n++) {
      const T = tick(n);
      for (const e of enemies(T)) {
        if (e.stunned) {
          stunned.add(e.sprite.replace(/[01]$/, ''));
          first = Math.min(first, T);
          // A stunned Zarg is on its first frame.
          expect(e.sprite).toMatch(/0$/);
        }
        if (e.flash) flashes++;
      }
    }
    expect(stunned.has('hopper')).toBe(true);
    expect(stunned.has('gloop')).toBe(true);
    expect(flashes).toBeGreaterThan(0);
    expect(first).toBeGreaterThan(shotsPlanned()[0]!.fired);
    expect(enemies(14).some((e) => e.stunned)).toBe(false);
  });

  it('keeps a Zarg down for 0.9 seconds after a hit, then lets it up', () => {
    // The gloop is hit and stays put, so follow it (the hopper is carried back until it recovers).
    const hit = shotsPlanned().find((s) => s.hit?.enemy === 0)!.hit!;
    expect(enemies(hit.at + 0.05)[0]!.stunned).toBe(true);
    expect(enemies(hit.at + STUN_SECONDS - 0.05)[0]!.stunned).toBe(true);
    expect(enemies(hit.at + STUN_SECONDS + 0.05)[0]!.stunned).toBe(false);
  });

  it('pops a bubble where it hits, and the pops are puffs of the game’s own sprite', () => {
    let pops = 0;
    for (let n = 0; n < TITLES_TICKS; n++)
      pops += fizz(tick(n)).filter((f) => f.kind === 'pop').length;
    expect(pops).toBeGreaterThan(0);
  });
});

describe('a screen of another shape', () => {
  it('spreads the stars and the speed lines across the whole width and height', () => {
    const wide = { w: 2560, h: 1080 };
    const tall = { w: 1920, h: 1440 };
    expect(Math.max(...stars(2, wide).map((s) => s.x))).toBeGreaterThan(DESIGN.w);
    expect(Math.max(...stars(2, tall).map((s) => s.y))).toBeGreaterThan(DESIGN.h);
    expect(Math.max(...speedLines(8, wide).map((l) => l.x))).toBeGreaterThan(DESIGN.w);
  });
});

/** Just enough of a 2D context for the sprites to be painted into. */
const fakeContext = (): unknown => ({
  createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData: () => undefined,
});

describe('the titles’ sprites', () => {
  const defs = defineSprites();

  it('are all in the game’s sprite set, and Ben is the size the layout assumes', () => {
    const names = new Set(defs.map((d) => d.name));
    for (const n of TITLES_SPRITES) expect(names.has(n), n).toBe(true);
    const ben = defs.find((d) => d.name === 'ben_shoot')!;
    expect([ben.grid.w, ben.grid.h]).toEqual([BEN_W, BEN_H]);
  });

  it('turns a grid into pixels, all in one colour for a silhouette', () => {
    const ben = defs.find((d) => d.name === 'ben_shoot')!;
    const full = gridPixels(ben.grid);
    const flat = gridPixels(ben.grid, '#000000');
    expect(full.width).toBe(BEN_W);
    expect(full.data.length).toBe(BEN_W * BEN_H * 4);
    let opaque = 0;
    for (let i = 3; i < full.data.length; i += 4) {
      expect(flat.data[i]).toBe(full.data[i]);
      if (full.data[i] === 255) {
        opaque++;
        expect([flat.data[i - 3], flat.data[i - 2], flat.data[i - 1]]).toEqual([0, 0, 0]);
      }
    }
    expect(opaque).toBeGreaterThan(50);
  });

  it('builds a canvas, a black silhouette and a white one for each', () => {
    const made: [number, number][] = [];
    const sprites = titleSprites(defs, (w, h) => {
      made.push([w, h]);
      return {
        width: w,
        height: h,
        getContext: () => fakeContext(),
      } as never;
    });
    expect([...sprites.keys()].sort()).toEqual([...TITLES_SPRITES].sort());
    expect(made).toHaveLength(TITLES_SPRITES.length * 3);
  });
});

describe('painting the titles', () => {
  /** A canvas context that records the numbers it is given and does nothing else. */
  function recorder(): {
    g: CanvasRenderingContext2D;
    numbers: number[];
    calls: Map<string, number>;
  } {
    const numbers: number[] = [];
    const calls = new Map<string, number>();
    const target: Record<string, unknown> = {};
    const g = new Proxy(target, {
      get(t, k: string) {
        if (k === 'measureText') return (text: string) => ({ width: text.length * 20 });
        if (k === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
        if (k in t) return t[k];
        return (...args: unknown[]) => {
          calls.set(k, (calls.get(k) ?? 0) + 1);
          for (const a of args) if (typeof a === 'number') numbers.push(a);
        };
      },
      set(t, k: string, v) {
        t[k] = v;
        return true;
      },
      has: () => false,
    }) as unknown as CanvasRenderingContext2D;
    return { g, numbers, calls };
  }

  const assets = (): TitlesAssets => ({
    sprites: titleSprites(
      defineSprites(),
      (w, h) =>
        ({
          width: w,
          height: h,
          getContext: () => fakeContext(),
        }) as never,
    ),
    mark: {} as CanvasImageSource,
  });

  it('draws every tick of the loop with finite numbers and nothing thrown', () => {
    const a = assets();
    const { g, numbers } = recorder();
    for (let n = 0; n < TITLES_TICKS; n += 3) drawTitles(g, tick(n), a);
    expect(numbers.length).toBeGreaterThan(1000);
    expect(numbers.every(Number.isFinite)).toBe(true);
  });

  it('shows the mark, the words, Ben and the Zargs at the times the sequence says', () => {
    const a = assets();
    const sees = (T: number): Map<string, number> => {
      const { g, calls } = recorder();
      drawTitles(g, T, a);
      return calls;
    };
    // Under the logo there is a mark to draw and no Ben; by the chase there are sprites and bubbles.
    expect(sees(1.5).get('drawImage') ?? 0).toBe(1);
    const chase = sees(9);
    expect(chase.get('drawImage') ?? 0).toBeGreaterThan(8);
    expect(chase.get('ellipse') ?? 0).toBeGreaterThan(0);
  });
});
