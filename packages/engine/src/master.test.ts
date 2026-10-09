// Tests for the master chain and the impulse response, against a recording fake context.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { afterEach, describe, expect, it } from 'vitest';
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
  trimToCancelMakeup,
} from './master';
import { FIELD, PART_PAN } from './sound-field';

const asCtx = (c: FakeAudioContext): BaseAudioContext => c as unknown as BaseAudioContext;
const asNode = (n: FakeNode): AudioNode => n as unknown as AudioNode;

const panDefaults = structuredClone(PART_PAN);
const fieldDefaults = { ...FIELD };
afterEach(() => {
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
    expect(g.sendLpf.out).toEqual([g.predelay]);
    expect(g.predelay.out).toEqual([g.convolver]);
    expect(g.convolver.out).toEqual([g.comp]);
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
    expect(g.convolver.buffer).not.toBe(first);
  });

  it('adds no stereo widening to the dry path', () => {
    const g = build();
    for (const kind of ['panner', 'merger']) expect(g.ctx.all(kind), kind).toHaveLength(0);
    // The only delay is the reverb's predelay, on the send.
    expect(g.ctx.all('delay')).toEqual([g.predelay]);
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
});
