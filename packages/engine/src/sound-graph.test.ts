// Tests for the routed context and the per-sound emitter, against a recording fake context.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as Undertone from '@liminal-hq/undertone';
import type { AudioContextLike } from '@liminal-hq/undertone';
import { describe, expect, it } from 'vitest';
import { FakeAudioContext, type FakeNode } from './fake-audio-context';
import { PANNED_MAKEUP } from './sound-field';
import { createEmitter, routedContext } from './sound-graph';

const asLike = (c: FakeAudioContext): AudioContextLike => c as unknown as AudioContextLike;
const asNode = (n: FakeNode): AudioNode => n as unknown as AudioNode;

describe('routedContext', () => {
  it('replaces only the destination', () => {
    const ctx = new FakeAudioContext();
    const sink = ctx.createGain();
    const routed = routedContext(asLike(ctx), asNode(sink));
    expect(routed.destination).toBe(sink);
    expect(routed.destination).not.toBe(ctx.destination);
    expect(routed.sampleRate).toBe(44100);
  });

  it('reads the clock live rather than copying it', () => {
    const ctx = new FakeAudioContext();
    const routed = routedContext(asLike(ctx), asNode(ctx.createGain()));
    expect(routed.currentTime).toBe(0);
    ctx.currentTime = 1.25;
    expect(routed.currentTime).toBe(1.25);
  });

  it('calls the real context’s factories as methods of it', () => {
    // Real AudioContext methods throw "Illegal invocation" when detached from the context.
    class Strict {
      currentTime = 0;
      sampleRate = 48000;
      destination = {};
      made: string[] = [];
      createOscillator() {
        this.made.push('osc');
        return {};
      }
      createGain() {
        this.made.push('gain');
        return {};
      }
      createBiquadFilter() {
        this.made.push('biquad');
        return {};
      }
      createStereoPanner() {
        this.made.push('panner');
        return {};
      }
      createChannelMerger(n: number) {
        this.made.push(`merger${n}`);
        return {};
      }
      createBufferSource() {
        this.made.push('source');
        return {};
      }
      createBuffer(c: number, l: number, r: number) {
        this.made.push(`buffer${c},${l},${r}`);
        return {};
      }
      createConvolver() {
        this.made.push('convolver');
        return {};
      }
      createDelay(m?: number) {
        this.made.push(`delay${m}`);
        return {};
      }
      async decodeAudioData() {
        this.made.push('decode');
        return {};
      }
    }
    const real = new Strict();
    const routed = routedContext(real as unknown as AudioContextLike, {} as AudioNode);
    routed.createOscillator();
    routed.createGain();
    routed.createBiquadFilter();
    routed.createStereoPanner();
    routed.createChannelMerger(2);
    routed.createBufferSource();
    routed.createBuffer(1, 10, 48000);
    routed.createConvolver();
    routed.createDelay(5);
    void routed.decodeAudioData(new ArrayBuffer(0));
    expect(real.made).toEqual([
      'osc',
      'gain',
      'biquad',
      'panner',
      'merger2',
      'source',
      'buffer1,10,48000',
      'convolver',
      'delay5',
      'decode',
    ]);
  });

  it('keeps the effects buses of a routed context apart from the real context’s', () => {
    const ctx = new FakeAudioContext();
    const sink = ctx.createGain();
    const routed = routedContext(asLike(ctx), asNode(sink));
    const real = Undertone.getOrbitBus(asLike(ctx), 1);
    const own = Undertone.getOrbitBus(routed, 1);
    expect(own).not.toBe(real);
    expect(Undertone.getOrbitBus(routed, 1)).toBe(own);
    // The routed bus feeds the routed destination; the real one still feeds the real destination.
    const convolvers = ctx.all('convolver');
    expect(convolvers).toHaveLength(2);
    expect(convolvers[0]!.out).toEqual([ctx.destination]);
    expect(convolvers[1]!.out).toEqual([sink]);
  });
});

describe('createEmitter', () => {
  it('wires a gain into a panner into the output', () => {
    const ctx = new FakeAudioContext();
    const out = ctx.createGain();
    const emitter = createEmitter(
      ctx as unknown as BaseAudioContext,
      { pan: 0.42, gain: 0.5 },
      asNode(out),
    );
    const [panner] = ctx.all('panner');
    expect(emitter).toBe(ctx.all('gain')[1]);
    expect((emitter as unknown as FakeNode).out).toEqual([panner]);
    expect(panner!.out).toEqual([out]);
    expect(panner!.pan.value).toBe(0.42);
  });

  it('applies the sound’s level times the make-up for the panner', () => {
    const ctx = new FakeAudioContext();
    const e = createEmitter(
      ctx as unknown as BaseAudioContext,
      { pan: 0, gain: 0.75 },
      asNode(ctx.destination),
    ) as unknown as FakeNode;
    expect(e.gain.value).toBeCloseTo(0.75 * PANNED_MAKEUP, 12);
    const centre = createEmitter(
      ctx as unknown as BaseAudioContext,
      { pan: 0, gain: 1 },
      asNode(ctx.destination),
    ) as unknown as FakeNode;
    expect(centre.gain.value).toBeCloseTo(Math.SQRT2, 12);
  });
});
