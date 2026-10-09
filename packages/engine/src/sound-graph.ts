// Web Audio wiring for the Enhanced sound field: routed contexts and per-sound emitters.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { AudioContextLike } from '@liminal-hq/undertone';
import { MIX_OPEN, MIX_OPEN_LPF, valueAt, type MixShape, type Ramp } from './mix';
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

/** The music's way to the speakers in Enhanced: a bus, the mix stage after it, and a routed context. */
export interface MusicBus {
  /** Every music voice, and the music's room and echo buses, end here. */
  bus: GainNode;
  /** The real context with `destination` replaced by `bus`: pass it to Undertone's `loop`. */
  routed: AudioContextLike;
  /** The music volume, so a change of volume does not restart the loop. */
  level: GainNode;
  /**
   * The mix's low-pass: muffles the music. A cutoff of `MIX_OPEN_LPF` (open) is set as the context's
   * Nyquist frequency, where the filter is exactly transparent; see `lpfHz`.
   */
  lpf: BiquadFilterNode;
  /** Half the context's sample rate, which an open cutoff is set to (see `lpfHz`). */
  nyquist: number;
  /** The mix's gain: lowers the music for a card or under speech. */
  mix: GainNode;
}

/**
 * The frequency to give the mix low-pass for a cutoff of `hz`, on a context whose Nyquist frequency is `nyquist`. A cutoff at or above `MIX_OPEN_LPF`
 * means open, and is set as the context's Nyquist frequency: a biquad low-pass at exactly Nyquist
 * is the identity in Chromium, Firefox and Safari, whereas one at 20 kHz is not open at all on a
 * 44.1 or 48 kHz context (measured in Chromium: -1.2 dB at 20 kHz and -5 dB at 22 kHz on 48 kHz,
 * with a 0.3 to 0.9 dB lift from 12 to 18 kHz from the resonance of its Q of 0 dB).
 */
export function lpfHz(nyquist: number, hz: number): number {
  return hz >= MIX_OPEN_LPF ? nyquist : hz;
}

/**
 * Builds the music bus into `out`: `bus -> level -> lpf -> mix -> out`. The routed context is one
 * object for the life of the bus, so Undertone's room and echo buses (kept per context object) are
 * made once and feed this bus; the real context's own buses, which Classic uses, are never touched.
 * The low-pass starts open and the gains at 1; `GameAudio` sets them from the volume and the mix.
 */
export function createMusicBus(ctx: BaseAudioContext, out: AudioNode): MusicBus {
  const bus = ctx.createGain();
  const level = ctx.createGain();
  const lpf = ctx.createBiquadFilter();
  const mix = ctx.createGain();
  lpf.type = 'lowpass';
  // A low-pass's Q is in dB; 0 is flat at the cutoff, with none of the default 1 dB ring.
  lpf.Q.value = 0;
  lpf.frequency.value = lpfHz(ctx.sampleRate / 2, MIX_OPEN.lpf);
  bus.connect(level);
  level.connect(lpf);
  lpf.connect(mix);
  mix.connect(out);
  return {
    bus,
    routed: routedContext(ctx as unknown as AudioContextLike, bus),
    level,
    lpf,
    nyquist: ctx.sampleRate / 2,
    mix,
  };
}

/**
 * Sets `param` to run along `ramp`, starting from its value at the ramp's start. `map` converts the
 * ramp's values to the parameter's (for the cutoff, `lpfHz`).
 */
export function scheduleRamp(
  param: AudioParam,
  ramp: Ramp,
  map: (v: number) => number = (v) => v,
): void {
  param.cancelScheduledValues(ramp.t0);
  param.setValueAtTime(map(ramp.from), ramp.t0);
  if (ramp.t1 <= ramp.t0) return;
  if (ramp.kind === 'exp') param.exponentialRampToValueAtTime(map(ramp.to), ramp.t1);
  else param.linearRampToValueAtTime(map(ramp.to), ramp.t1);
}

/** Puts the mix stage at `shape` now, without a ramp. */
export function setMixNow(bus: MusicBus, shape: MixShape, now: number): void {
  bus.lpf.frequency.cancelScheduledValues(now);
  bus.lpf.frequency.setValueAtTime(lpfHz(bus.nyquist, shape.lpf), now);
  bus.mix.gain.cancelScheduledValues(now);
  bus.mix.gain.setValueAtTime(shape.gain, now);
}

/** The mix a pair of plans have reached at `t`. */
export function mixAt(plan: { lpf: Ramp; gain: Ramp }, t: number): MixShape {
  return { lpf: valueAt(plan.lpf, t), gain: valueAt(plan.gain, t) };
}
