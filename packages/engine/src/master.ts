// The Enhanced master chain: EQ, bus compressor, limiter, output trim and a small room reverb send.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A bus compressor or limiter. Times are in seconds, levels in dB. */
export interface DynamicsTuning {
  threshold: number;
  knee: number;
  ratio: number;
  attack: number;
  release: number;
}

/** A peaking or shelving filter. */
export interface BandTuning {
  freq: number;
  /** Boost or cut in dB. */
  gain: number;
  q: number;
}

export interface MasterTuning {
  /** Removes rumble below the range of any voice. */
  hpf: { freq: number; q: number };
  lowShelf: BandTuning;
  presence: BandTuning;
  highShelf: BandTuning;
  comp: DynamicsTuning;
  limiter: DynamicsTuning;
  /**
   * Output level (linear). The compressor and limiter add about 5 dB of make-up gain of their own
   * (see `makeupDb`; measured in Chromium at 5.1 dB on quiet material), so without this Enhanced
   * would be louder than Classic, and the louder one always sounds better in an A/B.
   */
  trim: number;
  reverb: {
    /** Length of the room's impulse response, in seconds. */
    seconds: number;
    /** The length used instead on a coarse pointer (a phone), where the convolver costs battery. */
    coarseSeconds: number;
    /** Silence before the reverb starts, in seconds. */
    predelay: number;
    /** The send is filtered to this band so the room adds air, not mud or hiss. */
    hpf: number;
    lpf: number;
    /** How much of the sound effects and of the music goes to the room (linear). */
    sfxSend: number;
    musicSend: number;
  };
}

/**
 * The starting values, chosen to be gentle: a dry-heavy room, an EQ of a decibel or so and a
 * compressor that only holds down the loudest moments. They are meant to be tuned by ear (see
 * `audio-tune.ts` and the docs), so they are mutable and every use reads them when it is applied.
 */
export const MASTER: MasterTuning = {
  hpf: { freq: 22, q: Math.SQRT1_2 },
  lowShelf: { freq: 150, gain: 1.5, q: Math.SQRT1_2 },
  presence: { freq: 3200, gain: -1, q: 1 },
  highShelf: { freq: 9000, gain: 1, q: Math.SQRT1_2 },
  comp: { threshold: -16, knee: 10, ratio: 2.5, attack: 0.006, release: 0.18 },
  limiter: { threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.08 },
  trim: 0.55,
  reverb: {
    seconds: 0.8,
    coarseSeconds: 0.6,
    predelay: 0.012,
    hpf: 300,
    lpf: 5000,
    sfxSend: 0.1,
    musicSend: 0.06,
  },
};

/** The values `MASTER` started with, for tests and for putting it back by hand. */
export const MASTER_DEFAULTS: MasterTuning = structuredClone(MASTER);

/**
 * A mulberry32 generator: small, fast and deterministic, so the room sounds the same on every
 * device and every run.
 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FADE_IN = 0.003;

/**
 * One channel of a synthetic room: noise that fades in over 3 ms (so the room does not click) and
 * then decays exponentially to -60 dB at the end. The same seed gives the same samples; use a
 * different seed for each channel so the tails differ left to right and the room has width without
 * touching the dry signal.
 */
export function roomImpulse(sampleRate: number, seconds: number, seed: number): Float32Array {
  const length = Math.max(1, Math.round(sampleRate * seconds));
  const out = new Float32Array(length);
  const rand = seeded(seed);
  const fade = Math.max(1, Math.round(sampleRate * FADE_IN));
  for (let i = 0; i < length; i++) {
    const decay = Math.pow(10, (-3 * i) / length);
    out[i] = (rand() * 2 - 1) * decay * Math.min(1, i / fade);
  }
  return out;
}

/** The seeds of the left and right channels. */
export const ROOM_SEEDS = [0x5eed1, 0x5eed2] as const;

const toDb = (x: number): number => 20 * Math.log10(x);
const fromDb = (db: number): number => Math.pow(10, db / 20);

/**
 * The gain, in dB, that a browser `DynamicsCompressorNode` adds on its own after compressing. The
 * Web Audio specification has it apply `(1 / curve(1.0)) ^ 0.6`, where `curve(1.0)` is what a
 * full-scale input comes out as, so a node that squeezes the top end also lifts the whole signal,
 * quiet parts included. This follows Chromium's static curve: linear below the threshold, a soft
 * exponential knee whose steepness is searched for so that it meets the ratio's slope where the
 * knee ends, then a constant ratio.
 */
export function makeupDb(c: DynamicsTuning): number {
  const linearThreshold = fromDb(c.threshold);
  const kneeThresholdDb = c.threshold + c.knee;
  const kneeThreshold = fromDb(kneeThresholdDb);
  const slope = 1 / c.ratio;
  const knee = (x: number, k: number): number =>
    x < linearThreshold ? x : linearThreshold + (1 - Math.exp(-k * (x - linearThreshold))) / k;
  const slopeAt = (x: number, k: number): number => {
    if (x < linearThreshold) return 1;
    const x2 = x * 1.001;
    return (toDb(knee(x2, k)) - toDb(knee(x, k))) / (toDb(x2) - toDb(x));
  };
  let lo = 0.1;
  let hi = 10000;
  let k = 5;
  for (let i = 0; i < 15; i++) {
    if (slopeAt(kneeThreshold, k) < slope) hi = k;
    else lo = k;
    k = Math.sqrt(lo * hi);
  }
  const yKneeDb = toDb(knee(kneeThreshold, k));
  const curve = (x: number): number =>
    x < linearThreshold
      ? x
      : x < kneeThreshold
        ? knee(x, k)
        : fromDb(yKneeDb + slope * (toDb(x) - kneeThresholdDb));
  return -0.6 * toDb(curve(1));
}

/** The estimated automatic make-up of the compressor and the limiter together, in dB. */
export function chainMakeupDb(m: MasterTuning = MASTER): number {
  return makeupDb(m.comp) + makeupDb(m.limiter);
}

/**
 * The output trim (linear) that would cancel the make-up of the compressor and the limiter. It is
 * where `MASTER.trim` starts, not the last word: the EQ adds a fraction of a decibel, the reverb
 * adds a little more, and loud passages are compressed rather than lifted, so they come out a
 * decibel or two quieter than quiet ones. Match by ear, with
 * `__lf.debugAudioTune({ master: { trim } })`.
 */
export function trimToCancelMakeup(m: MasterTuning = MASTER): number {
  return Math.pow(10, -chainMakeupDb(m) / 20);
}

/** How fast a live change glides to its new value, in seconds (the time constant). */
const GLIDE = 0.05;

/** A parameter value set now (the first time) or glided to (once the chain is running). */
function setParam(p: AudioParam, v: number, ctx: BaseAudioContext, live: boolean): void {
  if (live) p.setTargetAtTime(v, ctx.currentTime, GLIDE);
  else p.value = v;
}

/**
 * The Enhanced master chain. Sound effects go into `sfxBus` and music into `musicBus`; both are
 * summed, shaped, compressed, limited, trimmed and sent to `out`. A small part of each also goes to
 * a room reverb whose output rejoins the chain at the compressor. The dry signal is never
 * widened, delayed or decorrelated, so a mono fold-down sounds like the stereo mix.
 *
 * The chain is built when it is first needed and taken apart with `dispose`; Classic never has one.
 */
export class Master {
  readonly sfxBus: GainNode;
  readonly musicBus: GainNode;
  private readonly nodes: AudioNode[] = [];
  private readonly hpf: BiquadFilterNode;
  private readonly lowShelf: BiquadFilterNode;
  private readonly presence: BiquadFilterNode;
  private readonly highShelf: BiquadFilterNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly trim: GainNode;
  private readonly sfxSend: GainNode;
  private readonly musicSend: GainNode;
  private readonly sendHpf: BiquadFilterNode;
  private readonly sendLpf: BiquadFilterNode;
  private readonly predelay: DelayNode;
  private readonly convolver: ConvolverNode;
  private irSeconds = 0;
  private live = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    private readonly coarse = false,
  ) {
    const gain = (): GainNode => this.track(ctx.createGain());
    const biquad = (type: BiquadFilterType): BiquadFilterNode => {
      const f = this.track(ctx.createBiquadFilter());
      f.type = type;
      return f;
    };
    this.sfxBus = gain();
    this.musicBus = gain();
    const sum = gain();
    this.hpf = biquad('highpass');
    this.lowShelf = biquad('lowshelf');
    this.presence = biquad('peaking');
    this.highShelf = biquad('highshelf');
    this.comp = this.track(ctx.createDynamicsCompressor());
    this.limiter = this.track(ctx.createDynamicsCompressor());
    this.trim = gain();
    this.sfxSend = gain();
    this.musicSend = gain();
    this.sendHpf = biquad('highpass');
    this.sendLpf = biquad('lowpass');
    this.predelay = this.track(ctx.createDelay(1));
    this.convolver = this.track(ctx.createConvolver());

    const chain: AudioNode[] = [
      sum,
      this.hpf,
      this.lowShelf,
      this.presence,
      this.highShelf,
      this.comp,
      this.limiter,
      this.trim,
      out,
    ];
    this.sfxBus.connect(sum);
    this.musicBus.connect(sum);
    for (let i = 0; i + 1 < chain.length; i++) chain[i]!.connect(chain[i + 1]!);

    // The room: a filtered, delayed copy of each bus, rejoining the chain at the compressor.
    this.sfxBus.connect(this.sfxSend);
    this.musicBus.connect(this.musicSend);
    this.sfxSend.connect(this.sendHpf);
    this.musicSend.connect(this.sendHpf);
    this.sendHpf.connect(this.sendLpf);
    this.sendLpf.connect(this.predelay);
    this.predelay.connect(this.convolver);
    this.convolver.connect(this.comp);

    this.apply();
    this.live = true;
  }

  private track<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  /**
   * Reads `MASTER` and sets every node to it: directly the first time, and by gliding afterwards so
   * a live change makes no click. Rebuilds the impulse response if the room's length changed.
   */
  apply(m: MasterTuning = MASTER): void {
    const { ctx, live } = this;
    const band = (f: BiquadFilterNode, b: { freq: number; gain?: number; q: number }): void => {
      setParam(f.frequency, b.freq, ctx, live);
      setParam(f.Q, b.q, ctx, live);
      if (b.gain !== undefined) setParam(f.gain, b.gain, ctx, live);
    };
    band(this.hpf, m.hpf);
    band(this.lowShelf, m.lowShelf);
    band(this.presence, m.presence);
    band(this.highShelf, m.highShelf);
    for (const [node, d] of [
      [this.comp, m.comp],
      [this.limiter, m.limiter],
    ] as const) {
      setParam(node.threshold, d.threshold, ctx, live);
      setParam(node.knee, d.knee, ctx, live);
      setParam(node.ratio, d.ratio, ctx, live);
      setParam(node.attack, d.attack, ctx, live);
      setParam(node.release, d.release, ctx, live);
    }
    setParam(this.trim.gain, m.trim, ctx, live);
    const r = m.reverb;
    setParam(this.sfxSend.gain, r.sfxSend, ctx, live);
    setParam(this.musicSend.gain, r.musicSend, ctx, live);
    setParam(this.sendHpf.frequency, r.hpf, ctx, live);
    setParam(this.sendLpf.frequency, r.lpf, ctx, live);
    setParam(this.predelay.delayTime, r.predelay, ctx, live);
    const seconds = this.coarse ? r.coarseSeconds : r.seconds;
    if (seconds !== this.irSeconds) {
      this.irSeconds = seconds;
      const buf = ctx.createBuffer(
        2,
        Math.max(1, Math.round(ctx.sampleRate * seconds)),
        ctx.sampleRate,
      );
      ROOM_SEEDS.forEach((seed, c) => {
        buf.getChannelData(c).set(roomImpulse(ctx.sampleRate, seconds, seed));
      });
      this.convolver.buffer = buf;
    }
  }

  /** Disconnects every node, so the chain no longer reaches the output and can be collected. */
  dispose(): void {
    for (const n of this.nodes) n.disconnect();
  }
}
