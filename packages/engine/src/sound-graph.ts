// Web Audio wiring for the Enhanced sound field: routed contexts and per-sound emitters.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { AudioContextLike } from '@liminal-hq/undertone';
import { PANNED_MAKEUP, type SoundAt } from './sound-field';

/**
 * A view of `ctx` whose `destination` is `destination`. Undertone connects every voice to
 * `ctx.destination`, so passing this as `PlayOptions.ctx` sends the voices into our node instead.
 * Every other member delegates to the real context. It is a fresh object, so Undertone's per-context
 * effects buses (keyed by the context object) are separate from those of the real context.
 *
 * Nothing is spread: a real `AudioContext`'s members are prototype getters and methods, and
 * `currentTime` has to be read live.
 */
export function routedContext(ctx: AudioContextLike, destination: AudioNode): AudioContextLike {
  return {
    get currentTime() {
      return ctx.currentTime;
    },
    get sampleRate() {
      return ctx.sampleRate;
    },
    destination,
    createOscillator: () => ctx.createOscillator(),
    createGain: () => ctx.createGain(),
    createBiquadFilter: () => ctx.createBiquadFilter(),
    createStereoPanner: () => ctx.createStereoPanner(),
    createChannelMerger: (n) => ctx.createChannelMerger(n),
    createBufferSource: () => ctx.createBufferSource(),
    createBuffer: (c, l, r) => ctx.createBuffer(c, l, r),
    createConvolver: () => ctx.createConvolver(),
    createDelay: (max) => ctx.createDelay(max),
    decodeAudioData: (data) => ctx.decodeAudioData(data),
  };
}

/**
 * The input of one sound's path to the speakers: a gain (the sound's loudness times the make-up for
 * the panner) into a stereo panner into `out`. Voices connect to the returned gain. The nodes hold
 * no source, so they are collected once the voices have finished.
 */
export function createEmitter(ctx: BaseAudioContext, at: SoundAt, out: AudioNode): GainNode {
  const gain = ctx.createGain();
  gain.gain.value = at.gain * PANNED_MAKEUP;
  const panner = ctx.createStereoPanner();
  panner.pan.value = at.pan;
  gain.connect(panner);
  panner.connect(out);
  return gain;
}
