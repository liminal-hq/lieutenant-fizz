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
   * Output level (linear). The compressor and limiter add about 1.9 dB of make-up gain of their own
   * with the default settings (see `makeupDb`), so without this Enhanced would be louder than
   * Classic, and the louder one always sounds better in an A/B. Rendered in Chromium, 0.8 puts the
   * game's effects and music within 0.1 dB of Classic on average.
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
 * The starting values, chosen to be transparent: the three EQ bands at 0 dB, a compressor that only
 * holds down the loudest moments and a limiter just under full scale, measured within 0.03 dB of a
 * straight pass from 1 to 20 kHz. The first values (shelves of +1.5 and +1 dB, a -1 dB dip at 3.2 kHz,
 * a 2.5:1 compressor at -16 dB) took 1.5 to 5 dB off the 2 to 8 kHz band of the music and of loud
 * effects relative to Classic, and left Enhanced up to 3 dB quieter. They are meant to be tuned by ear (see
 * `audio-tune.ts` and the docs), so they are mutable and every use reads them when it is applied.
 */
export const MASTER: MasterTuning = {
  hpf: { freq: 22, q: Math.SQRT1_2 },
  lowShelf: { freq: 150, gain: 0, q: Math.SQRT1_2 },
  presence: { freq: 3200, gain: 0, q: 1 },
  highShelf: { freq: 9000, gain: 0, q: Math.SQRT1_2 },
  comp: { threshold: -8, knee: 6, ratio: 1.8, attack: 0.006, release: 0.18 },
  limiter: { threshold: -1, knee: 0, ratio: 20, attack: 0.001, release: 0.08 },
  trim: 0.8,
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
 * The character of a room beyond its length: how fast the tail darkens, and an optional resonance.
 * With `damping` 0 and no `ring` the impulse response is the plain one, sample for sample.
 */
export interface RoomShape {
  /**
   * 0 to 1. A one-pole low-pass runs over the tail whose coefficient goes from 1 (open) at the start
   * to `1 - 0.9 * damping` at the end, so the tail loses its highs as it dies, as air and soft
   * surfaces do. 0 leaves the tail as it is.
   */
  damping: number;
  /**
   * A comb resonance, `y[i] += amount * y[i - round(sampleRate / hz)]`: a tube or a metal hall that
   * rings at `hz`. Keep `amount` well under 1.
   */
  ring?: { hz: number; amount: number };
}

/**
 * One channel of a synthetic room: noise that fades in over 3 ms (so the room does not click) and
 * then decays exponentially to -60 dB at the end. The same seed gives the same samples; use a
 * different seed for each channel so the tails differ left to right and the room has width without
 * touching the dry signal. A `shape` darkens the tail or adds a ring; without one (or with damping 0
 * and no ring) the samples are exactly those of the plain room.
 */
export function roomImpulse(
  sampleRate: number,
  seconds: number,
  seed: number,
  shape?: RoomShape,
): Float32Array {
  const length = Math.max(1, Math.round(sampleRate * seconds));
  const out = new Float32Array(length);
  const rand = seeded(seed);
  const fade = Math.max(1, Math.round(sampleRate * FADE_IN));
  for (let i = 0; i < length; i++) {
    const decay = Math.pow(10, (-3 * i) / length);
    out[i] = (rand() * 2 - 1) * decay * Math.min(1, i / fade);
  }
  const damping = shape ? Math.min(1, Math.max(0, shape.damping)) : 0;
  if (damping > 0) {
    let y = 0;
    for (let i = 0; i < length; i++) {
      const a = 1 - (0.9 * damping * i) / length;
      y += a * (out[i]! - y);
      out[i] = y;
    }
  }
  const ring = shape?.ring;
  if (ring && ring.amount !== 0 && ring.hz > 0) {
    const lag = Math.max(1, Math.round(sampleRate / ring.hz));
    for (let i = lag; i < length; i++) out[i] = out[i]! + ring.amount * out[i - lag]!;
  }
  return out;
}

/** The seeds of the left and right channels of the original room (room seed 0). */
export const ROOM_SEEDS = [0x5eed1, 0x5eed2] as const;

/**
 * The seeds of the left and right channels of a room: `[seed * 2 + 1, seed * 2 + 2]`, so every room
 * has its own pair and the two channels never share one. Seed 0 is the original 8b.3 room and keeps
 * `ROOM_SEEDS`, so the neutral room sounds exactly as it did before rooms existed.
 */
export function roomSeeds(seed: number): readonly [number, number] {
  return seed === 0 ? ROOM_SEEDS : [seed * 2 + 1, seed * 2 + 2];
}

/** A room, as the master chain uses it. Lengths in seconds, sends linear, filters in Hz. */
export interface RoomProfile {
  seconds: number;
  /** The length used instead on a coarse pointer (a phone), where the convolver costs battery. */
  coarseSeconds: number;
  /** How much of the sound effects and of the music goes to the room (linear). */
  sfxSend: number;
  musicSend: number;
  /** The send is filtered to this band so the room adds air, not mud or hiss. */
  hpf: number;
  lpf: number;
  /** Silence before the reverb starts, in seconds. */
  predelay: number;
  damping: number;
  ring?: { hz: number; amount: number };
  seed: number;
}

/** The default room: the one `MASTER.reverb` describes. */
function reverbProfile(r: MasterTuning['reverb']): RoomProfile {
  return { ...r, damping: 0, seed: 0 };
}

/**
 * What a send of 1 means. A `ConvolverNode` normalises its impulse response (to a fixed power, divided
 * by its length), which leaves a send of 1 about 13 dB under the dry sound: measured in Chromium, the
 * 1.8 s cave at a send of 0.22 put its reverb 26 dB under the dry energy, and its tail 38 dB under,
 * which cannot be heard. The gain of a send node is therefore the room's `sfxSend` or `musicSend`
 * times this, so the sends in `ROOMS` and the lab read as an amount on a scale where 1 is a very wet
 * room (the reverb about 5 dB over the dry sound), not as a gain 18 dB short of audible.
 */
export const ROOM_SEND_SCALE = 8;

/** The length of a room crossfade, in seconds. */
export const ROOM_FADE = 0.8;

/** The points of an equal-power crossfade: `out` falls as cos and `in` rises as sin, so out² + in² = 1. */
function crossfadeCurves(n: number): { out: Float32Array; in: Float32Array } {
  const out = new Float32Array(n);
  const inn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out[i] = Math.cos((u * Math.PI) / 2);
    inn[i] = Math.sin((u * Math.PI) / 2);
  }
  return { out, in: inn };
}
const CURVES = crossfadeCurves(16);

/** One of the two convolver paths a room crossfade moves between. */
interface Slot {
  predelay: DelayNode;
  convolver: ConvolverNode;
  fade: GainNode;
  /** The key of the impulse response loaded, or null when empty. */
  key: string | null;
  release?: ReturnType<typeof setTimeout>;
}

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
  private readonly slots: [Slot, Slot];
  private active = 0;
  private profile: RoomProfile | null;
  /** A room asked for during a crossfade, applied when it ends. */
  private pending: RoomProfile | null = null;
  private fading: ReturnType<typeof setTimeout> | undefined;
  /** The context time the running crossfade ends, so the next never overlaps it. */
  private fadeEnd = 0;
  private readonly irs = new Map<string, AudioBuffer>();
  private live = false;

  /**
   * `room` is the room to start in; without one the chain starts in the room `MASTER.reverb`
   * describes, which is where it followed `MASTER` before rooms existed.
   */
  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    private readonly coarse = false,
    room: RoomProfile | null = null,
  ) {
    this.profile = room;
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
    const slot = (): Slot => ({
      predelay: this.track(ctx.createDelay(1)),
      convolver: this.track(ctx.createConvolver()),
      fade: gain(),
      key: null,
    });
    this.slots = [slot(), slot()];

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
    for (const sl of this.slots) {
      this.sendLpf.connect(sl.predelay);
      sl.predelay.connect(sl.convolver);
      sl.convolver.connect(sl.fade);
      sl.fade.connect(this.comp);
    }
    this.slots[0].fade.gain.value = 1;
    this.slots[1].fade.gain.value = 0;

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
    this.moveTo(this.profile ?? reverbProfile(m.reverb), live ? ROOM_FADE : 0);
  }

  private irKey(p: RoomProfile): string {
    const secs = this.coarse ? p.coarseSeconds : p.seconds;
    const ring = p.ring ? `${p.ring.hz}x${p.ring.amount}` : '-';
    return `${this.ctx.sampleRate}|${secs}|${p.seed}|${p.damping}|${ring}`;
  }

  /** The impulse response of a room, built once and kept. */
  private irFor(p: RoomProfile, key: string): AudioBuffer {
    const hit = this.irs.get(key);
    if (hit) return hit;
    const { ctx } = this;
    const seconds = this.coarse ? p.coarseSeconds : p.seconds;
    const buf = ctx.createBuffer(
      2,
      Math.max(1, Math.round(ctx.sampleRate * seconds)),
      ctx.sampleRate,
    );
    const shape: RoomShape = { damping: p.damping, ring: p.ring };
    roomSeeds(p.seed).forEach((seed, c) => {
      buf.getChannelData(c).set(roomImpulse(ctx.sampleRate, seconds, seed, shape));
    });
    this.irs.set(key, buf);
    return buf;
  }

  /** The room the chain is in, or heading for. */
  get room(): RoomProfile {
    return this.profile ?? reverbProfile(MASTER.reverb);
  }

  /**
   * Moves the chain to a room. The sends, their filters and the predelay glide to the room's values
   * and the impulse response changes by an equal-power crossfade of `fade` seconds between two
   * convolvers, because swapping one convolver's buffer clicks. The new response is built (or taken
   * from the cache) into the idle convolver, and the old one is emptied once its tail has died. A
   * room asked for in the middle of a crossfade waits for the end of it, and a later request
   * replaces an earlier one. With `fade` 0 the change is immediate (used when building).
   */
  setRoom(p: RoomProfile, fade = ROOM_FADE): void {
    this.profile = p;
    this.moveTo(p, fade);
  }

  private moveTo(p: RoomProfile, fade: number): void {
    this.pending = null;
    const { ctx } = this;
    const live = this.live && fade > 0;
    const now = ctx.currentTime;
    const tau = fade / 3;
    const to = (param: AudioParam, v: number): void => {
      if (live) param.setTargetAtTime(v, now, tau);
      else param.value = v;
    };
    to(this.sfxSend.gain, p.sfxSend * ROOM_SEND_SCALE);
    to(this.musicSend.gain, p.musicSend * ROOM_SEND_SCALE);
    to(this.sendHpf.frequency, p.hpf);
    to(this.sendLpf.frequency, p.lpf);

    const key = this.irKey(p);
    const into = this.slots[this.active]!;
    if (key === into.key) {
      to(into.predelay.delayTime, p.predelay);
      return;
    }
    if (this.fading !== undefined) {
      this.pending = p;
      return;
    }
    if (!live) {
      // Building, or an immediate change: load the response into the slot that is playing.
      clearTimeout(into.release);
      into.convolver.buffer = this.irFor(p, key);
      into.key = key;
      into.predelay.delayTime.value = p.predelay;
      return;
    }

    const from = into;
    const idle = this.slots[1 - this.active]!;
    clearTimeout(idle.release);
    idle.convolver.buffer = this.irFor(p, key);
    idle.key = key;
    idle.predelay.delayTime.value = p.predelay;
    this.active = 1 - this.active;
    const start = Math.max(now, this.fadeEnd);
    this.fadeEnd = start + fade;
    for (const [slot, curve] of [
      [from, CURVES.out],
      [idle, CURVES.in],
    ] as const) {
      slot.fade.gain.cancelScheduledValues(start);
      slot.fade.gain.setValueCurveAtTime(curve, start, fade);
    }
    this.fading = setTimeout(() => {
      this.fading = undefined;
      const next = this.pending;
      this.pending = null;
      if (next) this.moveTo(next, fade);
    }, fade * 1000);
    const seconds = this.coarse ? p.coarseSeconds : p.seconds;
    const oldKey = from.key;
    from.release = setTimeout(
      () => {
        // Still the idle slot and still holding the old response: empty it.
        if (this.slots[this.active] !== from && from.key === oldKey) {
          from.convolver.buffer = null;
          from.key = null;
        }
      },
      (fade + seconds) * 1000,
    );
  }

  /** Disconnects every node, so the chain no longer reaches the output and can be collected. */
  dispose(): void {
    clearTimeout(this.fading);
    this.fading = undefined;
    for (const sl of this.slots) clearTimeout(sl.release);
    for (const n of this.nodes) n.disconnect();
  }
}
