// Tests for the master chain and the impulse response, against a recording fake context.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAudioTune } from './audio-tune';
import { FakeAudioContext, type FakeNode } from './fake-audio-context';
import {
  chainMakeupDb,
  MASTER,
  MASTER_DEFAULTS,
  Master,
  makeupDb,
  roomImpulse,
  ROOM_SEEDS,
  roomSeeds,
  type RoomProfile,
  trimToCancelMakeup,
} from './master';
import { FIELD, PART_PAN } from './sound-field';

const asCtx = (c: FakeAudioContext): BaseAudioContext => c as unknown as BaseAudioContext;
const asNode = (n: FakeNode): AudioNode => n as unknown as AudioNode;

const panDefaults = structuredClone(PART_PAN);
const fieldDefaults = { ...FIELD };
afterEach(() => {
  vi.useRealTimers();
  Object.assign(MASTER, structuredClone(MASTER_DEFAULTS));
  Object.assign(FIELD, fieldDefaults);
  Object.assign(PART_PAN, structuredClone(panDefaults));
});

function build(coarse = false) {
  const ctx = new FakeAudioContext();
  const m = new Master(asCtx(ctx), asNode(ctx.destination), coarse);
  const biquads = ctx.all('biquad');
  const [comp, limiter] = ctx.all('compressor');
  return {
    ctx,
    m,
    sfx: m.sfxBus as unknown as FakeNode,
    music: m.musicBus as unknown as FakeNode,
    hpf: biquads[0]!,
    low: biquads[1]!,
    presence: biquads[2]!,
    high: biquads[3]!,
    sendHpf: biquads[4]!,
    sendLpf: biquads[5]!,
    comp: comp!,
    limiter: limiter!,
    trim: limiter!.out[0]!,
    predelay: ctx.all('delay')[0]!,
    convolver: ctx.all('convolver')[0]!,
    // The room crossfade: slot A (playing) and slot B (idle), each a predelay, a convolver and a gain.
    predelayB: ctx.all('delay')[1]!,
    convolverB: ctx.all('convolver')[1]!,
    fadeA: ctx.all('convolver')[0]!.out[0]!,
    fadeB: ctx.all('convolver')[1]!.out[0]!,
  };
}

describe('Master chain', () => {
  it('runs both buses through the sum, EQ, compressor, limiter and trim to the destination', () => {
    const g = build();
    const sum = g.sfx.out[0]!;
    expect(g.music.out).toContain(sum);
    expect(sum.out).toEqual([g.hpf]);
    expect(g.hpf.out).toEqual([g.low]);
    expect(g.low.out).toEqual([g.presence]);
    expect(g.presence.out).toEqual([g.high]);
    expect(g.high.out).toEqual([g.comp]);
    expect(g.comp.out).toEqual([g.limiter]);
    expect(g.limiter.out).toEqual([g.trim]);
    expect(g.trim.kind).toBe('gain');
    expect(g.trim.out).toEqual([g.ctx.destination]);
    // Nothing else reaches the destination.
    expect(g.ctx.nodes.filter((n) => n.out.includes(g.ctx.destination))).toEqual([g.trim]);
  });

  it('sends a little of each bus through a filtered, delayed room back into the compressor', () => {
    const g = build();
    const [sfxSend, ...rest] = g.sfx.out.filter((n) => n.kind === 'gain' && n.gain.value < 1);
    const musicSend = g.music.out.find((n) => n.kind === 'gain' && n.gain.value < 1)!;
    expect(rest).toHaveLength(0);
    expect(sfxSend!.gain.value).toBeCloseTo(0.1, 12);
    expect(musicSend.gain.value).toBeCloseTo(0.06, 12);
    expect(sfxSend!.out).toEqual([g.sendHpf]);
    expect(musicSend.out).toEqual([g.sendHpf]);
    expect(g.sendHpf.out).toEqual([g.sendLpf]);
    expect(g.sendLpf.out).toEqual([g.predelay, g.predelayB]);
    expect(g.predelay.out).toEqual([g.convolver]);
    expect(g.predelayB.out).toEqual([g.convolverB]);
    expect(g.convolver.out).toEqual([g.fadeA]);
    expect(g.convolverB.out).toEqual([g.fadeB]);
    expect(g.fadeA.out).toEqual([g.comp]);
    expect(g.fadeB.out).toEqual([g.comp]);
    expect(g.fadeA.gain.value).toBe(1);
    expect(g.fadeB.gain.value).toBe(0);
    expect(g.convolverB.buffer).toBeNull();
    expect(g.sendHpf.type).toBe('highpass');
    expect(g.sendHpf.frequency.value).toBe(300);
    expect(g.sendLpf.type).toBe('lowpass');
    expect(g.sendLpf.frequency.value).toBe(5000);
    expect(g.predelay.delayTime.value).toBeCloseTo(0.012, 12);
  });

  it('starts at the documented EQ, dynamics and trim', () => {
    const g = build();
    expect([g.hpf.type, g.hpf.frequency.value, g.hpf.Q.value]).toEqual([
      'highpass',
      22,
      Math.SQRT1_2,
    ]);
    expect([g.low.type, g.low.frequency.value, g.low.gain.value]).toEqual(['lowshelf', 150, 1.5]);
    expect([
      g.presence.type,
      g.presence.frequency.value,
      g.presence.gain.value,
      g.presence.Q.value,
    ]).toEqual(['peaking', 3200, -1, 1]);
    expect([g.high.type, g.high.frequency.value, g.high.gain.value]).toEqual([
      'highshelf',
      9000,
      1,
    ]);
    const dyn = (n: FakeNode) => [
      n.threshold.value,
      n.knee.value,
      n.ratio.value,
      n.attack.value,
      n.release.value,
    ];
    expect(dyn(g.comp)).toEqual([-16, 10, 2.5, 0.006, 0.18]);
    expect(dyn(g.limiter)).toEqual([-2, 0, 20, 0.001, 0.08]);
    expect(g.trim.gain.value).toBe(0.55);
  });

  it('sets values directly while building and glides to them afterwards', () => {
    const g = build();
    expect(g.trim.gain.calls).toEqual([]);
    MASTER.trim = 0.7;
    MASTER.comp.ratio = 3;
    g.m.apply();
    expect(g.trim.gain.calls).toEqual([{ method: 'setTargetAtTime', args: [0.7, 0, 0.05] }]);
    expect(g.comp.ratio.calls).toEqual([{ method: 'setTargetAtTime', args: [3, 0, 0.05] }]);
  });

  it('builds a stereo impulse response of 0.8 s, or 0.6 s on a coarse pointer, from fixed seeds', () => {
    const g = build();
    const buf = g.convolver.buffer as { getChannelData(c: number): Float32Array };
    expect(buf.getChannelData(0)).toHaveLength(Math.round(44100 * 0.8));
    expect(buf.getChannelData(0)).toEqual(roomImpulse(44100, 0.8, ROOM_SEEDS[0]));
    expect(buf.getChannelData(1)).toEqual(roomImpulse(44100, 0.8, ROOM_SEEDS[1]));
    const coarse = build(true).convolver.buffer as { getChannelData(c: number): Float32Array };
    expect(coarse.getChannelData(0)).toHaveLength(Math.round(44100 * 0.6));
  });

  it('rebuilds the impulse response only when the room length changes', () => {
    const g = build();
    const first = g.convolver.buffer;
    g.m.apply();
    expect(g.convolver.buffer).toBe(first);
    MASTER.reverb.seconds = 1.2;
    g.m.apply();
    // The new length is built into the idle slot and crossfaded in; the first stays until it dies.
    expect(g.convolver.buffer).toBe(first);
    expect(g.convolverB.buffer).not.toBeNull();
    expect(g.convolverB.buffer).not.toBe(first);
  });

  it('adds no stereo widening to the dry path', () => {
    const g = build();
    for (const kind of ['panner', 'merger']) expect(g.ctx.all(kind), kind).toHaveLength(0);
    // The only delays are the two reverb slots' predelays, on the send.
    expect(g.ctx.all('delay')).toEqual([g.predelay, g.predelayB]);
  });

  it('disconnects every node when disposed', () => {
    const g = build();
    g.m.dispose();
    for (const n of g.ctx.nodes) expect(n.out, n.kind).toHaveLength(0);
  });
});

describe('roomImpulse', () => {
  const SR = 48000;
  const rms = (a: Float32Array, from: number, to: number): number => {
    let s = 0;
    for (let i = from; i < to; i++) s += a[i]! * a[i]!;
    return Math.sqrt(s / (to - from));
  };

  it('is deterministic for a seed and differs between seeds', () => {
    expect(roomImpulse(SR, 0.5, 7)).toEqual(roomImpulse(SR, 0.5, 7));
    expect(roomImpulse(SR, 0.5, 7)).not.toEqual(roomImpulse(SR, 0.5, 8));
  });

  it('has the length asked for and stays within full scale', () => {
    const ir = roomImpulse(SR, 0.8, 1);
    expect(ir).toHaveLength(38400);
    expect(Math.max(...ir.map(Math.abs))).toBeLessThanOrEqual(1);
  });

  it('fades in over 3 ms from silence', () => {
    const ir = roomImpulse(SR, 0.8, 1);
    expect(ir[0]).toBe(0);
    const fade = Math.round(SR * 0.003);
    expect(rms(ir, 0, fade / 3)).toBeLessThan(rms(ir, fade, fade * 4));
  });

  it('decays exponentially to -60 dB at the end', () => {
    const ir = roomImpulse(SR, 0.8, 1);
    const n = ir.length;
    const win = Math.round(n * 0.02);
    // Uniform noise in [-1, 1] has an RMS of 1/√3; the envelope is 10^(-3t/T) at fraction t/T.
    for (const frac of [0.1, 0.5, 0.95]) {
      const from = Math.round(n * frac);
      const expected = Math.pow(10, -3 * (frac + 0.01)) / Math.sqrt(3);
      expect(rms(ir, from, from + win) / expected, `at ${frac}`).toBeGreaterThan(0.85);
      expect(rms(ir, from, from + win) / expected, `at ${frac}`).toBeLessThan(1.15);
    }
    expect(Math.abs(ir[n - 1]!)).toBeLessThan(0.0011);
  });

  it('is decorrelated between the left and right seeds', () => {
    const l = roomImpulse(SR, 0.8, ROOM_SEEDS[0]);
    const r = roomImpulse(SR, 0.8, ROOM_SEEDS[1]);
    let lr = 0;
    let ll = 0;
    let rr = 0;
    for (let i = 0; i < l.length; i++) {
      lr += l[i]! * r[i]!;
      ll += l[i]! * l[i]!;
      rr += r[i]! * r[i]!;
    }
    expect(Math.abs(lr / Math.sqrt(ll * rr))).toBeLessThan(0.2);
  });
});

describe('roomImpulse shapes', () => {
  const sha = (a: Float32Array): string =>
    createHash('sha256').update(Buffer.from(a.buffer)).digest('hex');

  it('is byte for byte the 8b.3 room with no shape, with damping 0 and no ring', () => {
    // Hashes of the samples the 8b.3 `roomImpulse(sampleRate, seconds, seed)` produced.
    const golden: [number, number, number, string][] = [
      [48000, 0.8, 0x5eed1, '9d58bc11696f51825ce1a7641545851d4c595e2f27b70d6346b6c470435e7ad5'],
      [44100, 0.8, 0x5eed2, 'ad463204749126d7adf6163c215a31a7dc93c783bb16b90e04e8ca846d4a736c'],
      [48000, 0.35, 7, 'c5945752025583ed0ed127b215f12f005aa0d63b02ac0ced6691205f9bbc4f8c'],
    ];
    for (const [sr, secs, seed, hash] of golden) {
      expect(sha(roomImpulse(sr, secs, seed))).toBe(hash);
      expect(sha(roomImpulse(sr, secs, seed, { damping: 0 }))).toBe(hash);
      expect(sha(roomImpulse(sr, secs, seed, { damping: 0, ring: { hz: 500, amount: 0 } }))).toBe(
        hash,
      );
    }
  });

  /** How bright a stretch is: the energy of its first difference over the energy of the signal. */
  const brightness = (a: Float32Array, from: number, to: number): number => {
    let d = 0;
    let e = 0;
    for (let i = from + 1; i < to; i++) {
      d += (a[i]! - a[i - 1]!) ** 2;
      e += a[i]! ** 2;
    }
    return d / e;
  };

  it('damping darkens the late tail more than the start', () => {
    const SR = 48000;
    const plain = roomImpulse(SR, 1, 3);
    const damped = roomImpulse(SR, 1, 3, { damping: 0.6 });
    const late: [number, number] = [Math.round(SR * 0.6), Math.round(SR * 0.9)];
    const early: [number, number] = [Math.round(SR * 0.02), Math.round(SR * 0.1)];
    expect(brightness(damped, ...late)).toBeLessThan(brightness(plain, ...late) * 0.75);
    // The start is almost untouched; the end is the darkest.
    expect(brightness(damped, ...early)).toBeGreaterThan(brightness(damped, ...late));
    expect(brightness(damped, ...early) / brightness(plain, ...early)).toBeGreaterThan(0.7);
    expect(damped).toHaveLength(plain.length);
  });

  it('ring shows a comb peak at its period and nowhere near it', () => {
    const SR = 48000;
    const hz = 600;
    const lag = Math.round(SR / hz);
    const corr = (a: Float32Array, k: number): number => {
      let ak = 0;
      let aa = 0;
      for (let i = k; i < a.length; i++) {
        ak += a[i]! * a[i - k]!;
        aa += a[i]! * a[i]!;
      }
      return ak / aa;
    };
    const plain = roomImpulse(SR, 0.8, 5);
    const rung = roomImpulse(SR, 0.8, 5, { damping: 0, ring: { hz, amount: 0.4 } });
    expect(Math.abs(corr(plain, lag))).toBeLessThan(0.05);
    expect(corr(rung, lag)).toBeGreaterThan(0.25);
    expect(Math.abs(corr(rung, Math.round(lag * 1.5)))).toBeLessThan(0.1);
    expect(rung).not.toEqual(plain);
  });

  it('is deterministic for a seed with a shape', () => {
    const shape = { damping: 0.4, ring: { hz: 420, amount: 0.15 } };
    expect(roomImpulse(48000, 0.5, 9, shape)).toEqual(roomImpulse(48000, 0.5, 9, shape));
    expect(roomImpulse(48000, 0.5, 9, shape)).not.toEqual(roomImpulse(48000, 0.5, 10, shape));
  });

  it('gives each room its own left and right seeds, and seed 0 the original pair', () => {
    expect(roomSeeds(0)).toEqual(ROOM_SEEDS);
    expect(roomSeeds(3)).toEqual([7, 8]);
    const seen = new Set<number>();
    for (let r = 0; r <= 8; r++) for (const sd of roomSeeds(r)) seen.add(sd);
    expect(seen.size).toBe(18);
    const [l, r] = roomSeeds(4);
    expect(roomImpulse(48000, 0.3, l)).not.toEqual(roomImpulse(48000, 0.3, r));
  });
});

const ROOM_ORIGINAL: RoomProfile = { ...MASTER_DEFAULTS.reverb, damping: 0, seed: 0 };
const CAVE: RoomProfile = {
  seconds: 1.8,
  coarseSeconds: 1.2,
  sfxSend: 0.22,
  musicSend: 0.08,
  hpf: 300,
  lpf: 6500,
  predelay: 0.028,
  damping: 0.25,
  seed: 3,
};
const TOWER: RoomProfile = {
  ...CAVE,
  seconds: 0.7,
  coarseSeconds: 0.5,
  sfxSend: 0.12,
  predelay: 0.01,
  ring: { hz: 900, amount: 0.25 },
  seed: 6,
};

describe('Master.setRoom', () => {
  const gains = (n: FakeNode) => (n.gain as unknown as FakeNode['gain']).calls;
  const sendOf = (g: ReturnType<typeof build>, bus: FakeNode) =>
    bus.out.find((n) => n.kind === 'gain' && n !== bus && n.gain.value < 1)!;

  it('builds the new room into the idle slot and crossfades with equal-power curves', () => {
    vi.useFakeTimers();
    const g = build();
    g.ctx.currentTime = 5;
    const before = g.convolver.buffer;
    g.m.setRoom(CAVE);
    // The playing slot keeps its response; the idle one gets the cave's.
    expect(g.convolver.buffer).toBe(before);
    const buf = g.convolverB.buffer as { getChannelData(c: number): Float32Array };
    const [l, r] = roomSeeds(3);
    const shape = { damping: 0.25, ring: undefined };
    expect(buf.getChannelData(0)).toEqual(roomImpulse(44100, 1.8, l, shape));
    expect(buf.getChannelData(1)).toEqual(roomImpulse(44100, 1.8, r, shape));
    expect(g.predelayB.delayTime.value).toBeCloseTo(0.028, 12);
    // Each crossfade gain is cancelled from now and given a 16-point curve over 0.8 s.
    for (const fade of [g.fadeA, g.fadeB]) {
      expect(fade.gain.calls.map((c) => c.method)).toEqual([
        'cancelScheduledValues',
        'setValueCurveAtTime',
      ]);
      expect(fade.gain.curves).toHaveLength(1);
      expect(fade.gain.curves[0]!.time).toBe(5);
      expect(fade.gain.curves[0]!.duration).toBe(0.8);
      expect(fade.gain.curves[0]!.values).toHaveLength(16);
    }
    const out = g.fadeA.gain.curves[0]!.values;
    const inn = g.fadeB.gain.curves[0]!.values;
    expect(out[0]).toBe(1);
    expect(out[15]).toBeCloseTo(0, 12);
    expect(inn[0]).toBeCloseTo(0, 12);
    expect(inn[15]).toBeCloseTo(1, 12);
    for (let i = 0; i < 16; i++) expect(out[i]! ** 2 + inn[i]! ** 2).toBeCloseTo(1, 6);
  });

  it('glides the sends, their filters and gives the new slot its predelay', () => {
    const g = build();
    g.ctx.currentTime = 2;
    g.m.setRoom(CAVE);
    const tau = 0.8 / 3;
    expect(sendOf(g, g.sfx).gain.calls).toEqual([
      { method: 'setTargetAtTime', args: [0.22, 2, tau] },
    ]);
    expect(sendOf(g, g.music).gain.calls).toEqual([
      { method: 'setTargetAtTime', args: [0.08, 2, tau] },
    ]);
    expect(g.sendLpf.frequency.calls).toEqual([
      { method: 'setTargetAtTime', args: [6500, 2, tau] },
    ]);
    expect(g.sendHpf.frequency.calls).toEqual([{ method: 'setTargetAtTime', args: [300, 2, tau] }]);
  });

  it('empties the old slot after the fade and the length of its tail, not before', () => {
    vi.useFakeTimers();
    const g = build();
    g.m.setRoom(CAVE);
    const old = g.convolver.buffer;
    expect(old).not.toBeNull();
    vi.advanceTimersByTime((0.8 + 1.8) * 1000 - 1);
    expect(g.convolver.buffer).toBe(old);
    vi.advanceTimersByTime(2);
    expect(g.convolver.buffer).toBeNull();
    expect(g.convolverB.buffer).not.toBeNull();
  });

  it('takes a response it has built before from the cache', () => {
    vi.useFakeTimers();
    const g = build();
    const create = vi.spyOn(g.ctx, 'createBuffer');
    g.m.setRoom(CAVE);
    expect(create).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(900);
    g.m.setRoom(TOWER);
    expect(create).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(900);
    const cached = g.convolverB.buffer;
    g.m.setRoom(CAVE);
    expect(create).toHaveBeenCalledTimes(2);
    expect(g.convolverB.buffer ?? g.convolver.buffer).toBeDefined();
    // The original room is also kept (it was built before any call), so going back builds nothing.
    vi.advanceTimersByTime(900);
    g.m.setRoom({ ...ROOM_ORIGINAL });
    expect(create).toHaveBeenCalledTimes(2);
    expect(cached).not.toBeNull();
  });

  it('only retargets when the response is the same', () => {
    vi.useFakeTimers();
    const g = build();
    g.m.setRoom({ ...CAVE });
    const fadeCalls = g.fadeA.gain.calls.length;
    vi.advanceTimersByTime(900);
    g.m.setRoom({ ...CAVE, sfxSend: 0.3, predelay: 0.04 });
    expect(g.fadeA.gain.calls).toHaveLength(fadeCalls);
    expect(g.predelayB.delayTime.calls.at(-1)).toEqual({
      method: 'setTargetAtTime',
      args: [0.04, 0, 0.8 / 3],
    });
  });

  it('waits out a running crossfade and then goes to the latest room asked for', () => {
    vi.useFakeTimers();
    const g = build();
    g.m.setRoom(CAVE);
    g.m.setRoom({ ...CAVE, seed: 11 });
    g.m.setRoom(TOWER);
    // Nothing more was scheduled, and the running crossfade was not touched.
    expect(g.fadeA.gain.curves).toHaveLength(1);
    expect(g.convolver.buffer).not.toBeNull();
    vi.advanceTimersByTime(800);
    expect(g.fadeA.gain.curves).toHaveLength(2);
    expect(g.fadeB.gain.curves).toHaveLength(2);
    const tower = g.convolver.buffer as { getChannelData(c: number): Float32Array };
    expect(tower.getChannelData(0)).toEqual(
      roomImpulse(44100, 0.7, roomSeeds(6)[0], { damping: 0.25, ring: { hz: 900, amount: 0.25 } }),
    );
    // The second crossfade starts where the first ended, so the curves never overlap.
    expect(g.fadeA.gain.curves[1]!.time).toBeGreaterThanOrEqual(0.8);
  });

  it('uses the shorter response on a coarse pointer', () => {
    const g = build(true);
    g.m.setRoom(CAVE);
    const buf = g.convolverB.buffer as { getChannelData(c: number): Float32Array };
    expect(buf.getChannelData(0)).toHaveLength(Math.round(44100 * 1.2));
  });

  it('starts in a room given to the constructor, with no crossfade', () => {
    const ctx = new FakeAudioContext();
    new Master(asCtx(ctx), asNode(ctx.destination), false, CAVE);
    const [a, b] = ctx.all('convolver');
    expect(
      (a!.buffer as { getChannelData(c: number): Float32Array }).getChannelData(0),
    ).toHaveLength(Math.round(44100 * 1.8));
    expect(b!.buffer).toBeNull();
    expect(a!.out[0]!.gain.calls).toEqual([]);
  });

  it('keeps the room through a master tune', () => {
    vi.useFakeTimers();
    const g = build();
    g.m.setRoom(CAVE);
    vi.advanceTimersByTime(900);
    MASTER.trim = 0.6;
    g.m.apply();
    expect(g.m.room).toBe(CAVE);
    expect(g.fadeA.gain.curves).toHaveLength(1);
  });

  it('clears its timers when disposed', () => {
    vi.useFakeTimers();
    const g = build();
    g.m.setRoom(CAVE);
    g.m.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('make-up gain', () => {
  it('estimates what the browser compressor adds on its own', () => {
    // (1 / curve(1.0)) ^ 0.6 on Chromium's static curve. Rendering a chord through the same
    // compressor, limiter and a 0.8 trim in an OfflineAudioContext in Chromium measured the chain
    // 3.2 dB louder than the dry signal, which is these 5.13 dB less the 1.94 dB of the 0.8 trim.
    expect(makeupDb(MASTER.comp)).toBeCloseTo(3.99, 2);
    expect(makeupDb(MASTER.limiter)).toBeCloseTo(1.14, 2);
    expect(chainMakeupDb()).toBeCloseTo(5.13, 2);
    expect(20 * Math.log10(trimToCancelMakeup())).toBeCloseTo(-5.13, 2);
  });

  it('starts the trim within half a decibel of cancelling it', () => {
    expect(Math.abs(20 * Math.log10(MASTER.trim / trimToCancelMakeup()))).toBeLessThan(0.5);
  });

  it('grows with the ratio and with a lower threshold', () => {
    expect(makeupDb({ ...MASTER.comp, ratio: 4 })).toBeGreaterThan(makeupDb(MASTER.comp));
    expect(makeupDb({ ...MASTER.comp, threshold: -24 })).toBeGreaterThan(makeupDb(MASTER.comp));
  });
});

describe('applyAudioTune', () => {
  it('changes MASTER, FIELD and PART_PAN and reports what it set', () => {
    const report = applyAudioTune({
      master: { trim: 0.7, comp: { ratio: 3 }, reverb: { sfxSend: 0.2 } },
      field: { width: 0.4 },
      partPan: { bell: 0.2, arp: [-0.4, 0.4] },
    });
    expect(MASTER.trim).toBe(0.7);
    expect(MASTER.comp.ratio).toBe(3);
    expect(MASTER.reverb.sfxSend).toBe(0.2);
    expect(FIELD.width).toBe(0.4);
    expect(PART_PAN.bell).toBe(0.2);
    expect(PART_PAN.arp).toEqual([-0.4, 0.4]);
    expect(report.applied).toEqual([
      'master.trim',
      'master.comp.ratio',
      'master.reverb.sfxSend',
      'field.width',
      'partPan.bell',
      'partPan.arp',
    ]);
    expect(report.ignored).toEqual([]);
  });

  it('skips unknown keys, non-numbers and pans outside -1 to 1 without changing anything', () => {
    const report = applyAudioTune({
      master: { nope: 1, trim: Infinity, comp: 'loud' } as never,
      field: { width: '0.4' } as never,
      partPan: { bell: 2, kazoo: 0.1, lead: [0.1] } as never,
    });
    expect(report.applied).toEqual([]);
    expect(report.ignored).toEqual([
      'master.nope',
      'master.trim',
      'master.comp',
      'field.width',
      'partPan.bell',
      'partPan.kazoo',
      'partPan.lead',
    ]);
    expect(MASTER).toEqual(MASTER_DEFAULTS);
    expect(PART_PAN.bell).toBe(0.3);
  });

  it('changes the named mix states, and refuses unknown states, keys and out-of-range values', () => {
    const mix = { pause: { lpf: 900, gain: 0.7 } };
    const report = applyAudioTune(
      { mix: { pause: { lpf: 700 }, nowhere: { gain: 0.5 } } },
      { mix },
    );
    expect(mix.pause.lpf).toBe(700);
    expect(report.applied).toEqual(['mix.pause.lpf']);
    expect(report.ignored).toEqual(['mix.nowhere.gain']);
    const bad = applyAudioTune({ mix: { pause: { lpf: 5, gain: 9, q: 1 } as never } }, { mix });
    expect(bad.applied).toEqual([]);
    expect(bad.ignored).toEqual(['mix.pause.lpf', 'mix.pause.gain', 'mix.pause.q']);
    expect(mix.pause).toEqual({ lpf: 700, gain: 0.7 });
    // Without mix states there is nothing to change.
    expect(applyAudioTune({ mix: { pause: { lpf: 800 } } }).ignored).toEqual(['mix.pause.lpf']);
  });

  it('tunes a named room of the table it is given, and ignores unknown rooms and values', () => {
    const rooms = { cave: structuredClone(CAVE), tower: structuredClone(TOWER) };
    const report = applyAudioTune(
      {
        rooms: {
          cave: { sfxSend: 0.15, seconds: 2.2 },
          nowhere: { sfxSend: 1 },
          tower: { ring: { hz: 700 } },
        } as never,
      },
      { rooms },
    );
    expect(rooms.cave.sfxSend).toBe(0.15);
    expect(rooms.cave.seconds).toBe(2.2);
    expect(rooms.tower.ring).toEqual({ hz: 700, amount: 0.25 });
    expect(report.applied).toEqual([
      'rooms.cave.sfxSend',
      'rooms.cave.seconds',
      'rooms.tower.ring.hz',
    ]);
    expect(report.ignored).toEqual(['rooms.nowhere']);
    // Without a table every room is ignored.
    expect(applyAudioTune({ rooms: { cave: { sfxSend: 1 } } }).ignored).toEqual(['rooms.cave']);
  });
});
