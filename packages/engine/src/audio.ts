// Game audio manager and mini-notation evaluator built on Undertone.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ControlPatch, Pattern, SoundType } from '@liminal-hq/undertone';
import { routedContext, createEmitter, createMusicBus, type MusicBus } from './sound-graph';
import {
  isPanned,
  partMakeup,
  partPanAt,
  undertonePan,
  type AudioMode,
  type PartRole,
  type SoundAt,
} from './sound-field';

/** Where an unplaced sound sits in Enhanced: the centre, at full level. */
const CENTRE: SoundAt = { pan: 0, gain: 1 };

/** The runtime surface of `@liminal-hq/undertone` the game uses (the module namespace, or a test double). */
export type UndertoneModule = Pick<
  typeof import('@liminal-hq/undertone'),
  'note' | 'sound' | 'stack'
>;

type Voice = Pattern<ControlPatch>;

/** One-shot SFX voice, as data (Undertone voice controls). */
export interface SfxVoice {
  /** Note name (`e4`) or noise type (`white`, `pink`, `brown`). */
  n: string;
  w?: OscillatorType;
  a?: number;
  d?: number;
  r?: number;
  g: number;
  lpf?: number;
  hpf?: number;
  slide?: number;
  nudge?: number;
}

/** One part of a looping music track (mini-notation pattern plus voice settings). */
export interface MusicPart {
  notes: string;
  w?: OscillatorType;
  noise?: boolean;
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  g: number;
  lpf?: number;
  hpf?: number;
  slide?: number;
  room?: number;
  delay?: number;
  /** What the part does in the mix; Enhanced uses it to place the part in the stereo field. */
  role?: PartRole;
}

export interface MusicTrack {
  bpm: number;
  parts: MusicPart[];
}

export interface AudioPatterns {
  sfx: Record<string, SfxVoice[]>;
  music: Record<string, MusicTrack>;
  /** Caption text to SFX name, so on-screen sound captions and audio always agree. */
  captionSfx: Record<string, string>;
}

// ---------- Mini-notation subset: [ ] seq, < > alternate, , stack, *n repeat, ~ rest ----------

type Node =
  | { t: 'rest'; rep?: number }
  | { t: 'word'; v: string; rep?: number }
  | { t: 'seq'; items: Node[]; rep?: number }
  | { t: 'alt'; items: Node[]; rep?: number }
  | { t: 'stack'; parts: Node[]; rep?: number };

export function parseMini(src: string): Node {
  let i = 0;
  const ws = (): void => {
    while (src[i] === ' ') i++;
  };
  const seq = (close: string | null): Extract<Node, { t: 'seq' }> => {
    const items: Node[] = [];
    for (;;) {
      ws();
      if (i >= src.length || src[i] === close || src[i] === ',') break;
      items.push(item());
    }
    return { t: 'seq', items };
  };
  const group = (close: string, kind: 'seq' | 'alt'): Node => {
    i++;
    const parts = [seq(close)];
    while (src[i] === ',') {
      i++;
      parts.push(seq(close));
    }
    i++;
    if (parts.length > 1) return { t: 'stack', parts };
    const first = parts[0]!;
    return kind === 'alt' ? { t: 'alt', items: first.items } : first;
  };
  const atom = (): Node => {
    if (src[i] === '[') return group(']', 'seq');
    if (src[i] === '<') return group('>', 'alt');
    let w = '';
    while (i < src.length && !' []<>,*'.includes(src[i]!)) w += src[i++];
    return w === '~' ? { t: 'rest' } : { t: 'word', v: w };
  };
  const item = (): Node => {
    const a = atom();
    if (src[i] === '*') {
      i++;
      let n = '';
      while (/[0-9]/.test(src[i] ?? '')) n += src[i++];
      a.rep = +n;
    }
    return a;
  };
  return seq(null);
}

export interface MiniEvent {
  /** Start and end as a fraction of one cycle. */
  t0: number;
  t1: number;
  v: string;
}

/** Evaluates cycle `cyc` of a parsed pattern into timed events (appended to `out`). */
export function evalMini(node: Node, t0: number, t1: number, cyc: number, out: MiniEvent[]): void {
  const rep = node.rep ?? 1;
  const d = (t1 - t0) / rep;
  for (let k = 0; k < rep; k++) {
    const a = t0 + k * d;
    const b = a + d;
    const c = cyc * rep + k;
    if (node.t === 'word') out.push({ t0: a, t1: b, v: node.v });
    else if (node.t === 'seq') {
      const n = node.items.length;
      node.items.forEach((it, j) =>
        evalMini(it, a + ((b - a) * j) / n, a + ((b - a) * (j + 1)) / n, c, out),
      );
    } else if (node.t === 'alt') {
      const n = node.items.length;
      const pick = node.items[((c % n) + n) % n];
      if (pick) evalMini(pick, a, b, Math.floor(c / n), out);
    } else if (node.t === 'stack') node.parts.forEach((p) => evalMini(p, a, b, c, out));
  }
}

const NOTE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** Frequency in Hz of a note name like `c#4` (A4 = 440). */
export function noteHz(name: string): number {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(name);
  if (!m) return 440;
  const n = (NOTE[m[1]!] ?? 0) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3]! + 1) * 12;
  return 440 * Math.pow(2, (n - 69) / 12);
}

const isNoise = (n: string): boolean => n === 'white' || n === 'pink' || n === 'brown';

interface VoiceSpec {
  n: string;
  w?: OscillatorType;
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  g: number;
  lpf?: number;
  hpf?: number;
  slide?: number;
  nudge?: number;
  delay?: number;
  /** The part's role, set only when it is placed in the stereo field. */
  role?: PartRole;
  /** Where the voice sits in its cycle, 0 up to 1, for roles that alternate their pan. */
  cyclePos?: number;
}

/**
 * One Undertone voice. Music parts hold their envelope for the note length; effects are percussive.
 * With `placed` (Enhanced music) a part's role gives it a pan and, if panned, the make-up gain.
 */
export function buildVoice(
  U: UndertoneModule,
  v: SfxVoice | MusicPart,
  vol: number,
  gated: boolean,
  placed = false,
): Voice {
  const text = 'notes' in v ? v.notes : v.n;
  const role = placed && 'notes' in v ? v.role : undefined;
  const noisy = 'noise' in v ? !!v.noise : isNoise(text);
  let p: Voice = noisy
    ? U.sound(text as SoundType)
    : U.note(text).sound((v.w ?? 'triangle') as SoundType);
  p = p
    .attack(v.a ?? 0.001)
    .decay(v.d ?? 0.1)
    .sustain(gated ? ('s' in v ? (v.s ?? 0.3) : 0.3) : 0)
    .release(v.r ?? 0.05)
    .gain(v.g * vol * partMakeup(role));
  if (role) {
    const pan = undertonePan(role);
    if (pan !== undefined) p = p.pan(pan);
  }
  if (v.lpf) p = p.lpf(v.lpf);
  if (v.hpf) p = p.hpf(v.hpf);
  if (v.slide) p = p.slide(v.slide);
  if ('nudge' in v && v.nudge) p = p.nudge(v.nudge);
  if ('room' in v && v.room) p = p.room(v.room).roomsize(6).orbit(1);
  if ('delay' in v && v.delay) p = p.delay(v.delay).delaytime(0.33).delayfeedback(0.35).orbit(2);
  return p;
}

/** Built-in Web Audio synth: plays the same patterns as Undertone, plus music loops. */
export class MiniSynth {
  private readonly noise: Partial<Record<string, AudioBuffer>> = {};
  private readonly delay: DelayNode;
  /** Echo lines for outputs other than the synth's own, made when a part asks for one. */
  private readonly echoes = new Map<AudioNode, DelayNode>();

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.33;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(out);
  }

  /** The echo line that feeds `out`: the synth's own, or one made for that output. */
  private echoInto(out: AudioNode): DelayNode {
    if (out === this.out) return this.delay;
    let line = this.echoes.get(out);
    if (!line) {
      line = this.ctx.createDelay(1);
      line.delayTime.value = 0.33;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.35;
      line.connect(fb);
      fb.connect(line);
      line.connect(out);
      this.echoes.set(out, line);
    }
    return line;
  }

  private noiseBuf(kind: string): AudioBuffer {
    const hit = this.noise[kind];
    if (hit) return hit;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let l = 0;
    let p0 = 0;
    let p1 = 0;
    let p2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        l = (l + 0.02 * w) / 1.02;
        d[i] = l * 3.5;
      } else if (kind === 'pink') {
        p0 = 0.997 * p0 + w * 0.029591;
        p1 = 0.985 * p1 + w * 0.032534;
        p2 = 0.95 * p2 + w * 0.048056;
        d[i] = (p0 + p1 + p2 + w * 0.05) * 1.5;
      } else d[i] = w;
    }
    this.noise[kind] = buf;
    return buf;
  }

  voice(v: VoiceSpec, when: number, dur: number, gated: boolean, out: AudioNode = this.out): void {
    const ctx = this.ctx;
    const t = when + (v.nudge ?? 0);
    let src: AudioBufferSourceNode | OscillatorNode;
    if (isNoise(v.n)) {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf(v.n);
      src = s;
    } else {
      const o = ctx.createOscillator();
      o.type = v.w ?? 'triangle';
      const f = noteHz(v.n);
      if (v.slide) {
        o.frequency.setValueAtTime(f * 2, t);
        o.frequency.exponentialRampToValueAtTime(f, t + v.slide);
      } else o.frequency.setValueAtTime(f, t);
      src = o;
    }
    let node: AudioNode = src;
    if (v.lpf) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = v.lpf;
      node.connect(f);
      node = f;
    }
    if (v.hpf) {
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = v.hpf;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    const a = v.a || 0.001;
    const d = v.d || 0.1;
    const s = gated ? (v.s ?? 0) : 0;
    const r = v.r || 0.05;
    const peak = v.g * partMakeup(v.role);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(peak * s, t + a + d);
    const end = gated ? Math.max(t + a + d, t + dur) : t + a + d;
    g.gain.setValueAtTime(peak * s, end);
    g.gain.linearRampToValueAtTime(0, end + r);
    node.connect(g);
    // A panned part goes through a stereo panner, as Undertone's `.pan()` does; its echo follows it.
    let tail: AudioNode = g;
    if (v.role && isPanned(v.role)) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = partPanAt(v.role, v.cyclePos ?? 0);
      g.connect(panner);
      tail = panner;
    }
    tail.connect(out);
    if (v.delay) {
      const sg = ctx.createGain();
      sg.gain.value = v.delay;
      tail.connect(sg);
      sg.connect(this.echoInto(out));
    }
    src.start(t);
    src.stop(end + r + 0.05);
  }

  /** Plays an effect's voices into `out` (the synth's own output when left out). */
  playSfx(list: readonly SfxVoice[], vol: number, out?: AudioNode): void {
    const t = this.ctx.currentTime + 0.01;
    for (const v of list) this.voice({ ...v, g: v.g * vol }, t, 0, false, out);
  }

  /**
   * Loops a track, scheduling voices ~300 ms ahead. Returns a stopper. With `out` the track plays
   * into that node instead of the synth's own output, and each part is placed by its role.
   */
  loop(track: MusicTrack, vol: number, out?: AudioNode): { stop(): void } {
    const ctx = this.ctx;
    const cyc = 240 / track.bpm;
    const parsed = track.parts.map((p) => ({ p, tree: parseMini(p.notes) }));
    let c = 0;
    let next = ctx.currentTime + 0.1;
    let stopped = false;
    const tick = (): void => {
      if (stopped) return;
      while (next < ctx.currentTime + 0.3) {
        for (const { p, tree } of parsed) {
          const ev: MiniEvent[] = [];
          evalMini(tree, 0, 1, c, ev);
          for (const e of ev) {
            this.voice(
              { ...p, n: e.v, g: p.g * vol, role: out ? p.role : undefined, cyclePos: e.t0 },
              next + e.t0 * cyc,
              (e.t1 - e.t0) * cyc,
              true,
              out,
            );
          }
        }
        c++;
        next += cyc;
      }
    };
    tick();
    const id = setInterval(tick, 50);
    return {
      stop: () => {
        stopped = true;
        clearInterval(id);
      },
    };
  }
}

/**
 * Game audio manager. Sound effects and music are built as `@liminal-hq/undertone` 0.2 stacks
 * (effects play once, music loops at the track's BPM). If Undertone fails to load, or throws while
 * building or starting a sound, that sound falls back to the built-in synth, which implements the
 * same patterns. The context unlocks on the first click or key press.
 */
export class GameAudio {
  music = true;
  sfx = true;
  musicVol = 1;
  sfxVol = 1;
  backend = 'Loading Undertone';
  /** Classic is today's sound, untouched. Enhanced places sound effects in the stereo field. */
  mode: AudioMode = 'classic';
  /** How many sound effects have been placed through an emitter (always 0 in Classic). */
  emitters = 0;
  private ctx: AudioContext | null = null;
  private mini: MiniSynth | null = null;
  private ut: UndertoneModule | null = null;
  private handle: { stop(): void } | null = null;
  private track: string | null = null;
  private pending: string | null = null;
  private disposed = false;
  /** The Enhanced music route, built the first time Enhanced music plays. */
  private musicBus: MusicBus | null = null;
  private readonly cache = new Map<string, Voice>();
  private readonly unlock = (): void => {
    if (this.disposed) return;
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  };

  constructor(
    private readonly patterns: AudioPatterns,
    load: () => Promise<UndertoneModule> = () => import('@liminal-hq/undertone'),
  ) {
    window.addEventListener('pointerdown', this.unlock);
    // Chrome does not count a touch's pointerdown as a user gesture, but its pointerup is one.
    window.addEventListener('pointerup', this.unlock);
    window.addEventListener('keydown', this.unlock);
    load().then(
      (m) => {
        if (this.disposed) return;
        if (
          typeof m?.note === 'function' &&
          typeof m.sound === 'function' &&
          typeof m.stack === 'function'
        ) {
          this.ut = m;
          this.backend = 'Undertone 0.2';
          // Music requested before the library arrived was started on the built-in synth.
          if (this.handle && this.music && this.track) this.playMusic(this.track, true);
        } else this.backend = 'Built-in synth';
      },
      (e: unknown) => {
        console.warn('Undertone unavailable, using the built-in synth', e);
        this.backend = 'Built-in synth';
      },
    );
  }

  private ensure(): AudioContext | null {
    if (this.disposed) return null;
    if (this.ctx) return this.ctx;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.mini = new MiniSynth(this.ctx, this.ctx.destination);
    if (this.pending) {
      const t = this.pending;
      this.pending = null;
      this.playMusic(t, true);
    }
    return this.ctx;
  }

  private undertoneEffect(U: UndertoneModule, name: string, voices: readonly SfxVoice[]): Voice {
    const key = `${name}@${this.sfxVol}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const fx = U.stack(...voices.map((v) => buildVoice(U, v, this.sfxVol, false)));
    this.cache.set(key, fx);
    return fx;
  }

  /** The state of the audio context, or `none` before the first input creates it. */
  get ctxState(): string {
    return this.ctx?.state ?? 'none';
  }

  /**
   * Switches between Classic and Enhanced for the sounds that start from now on. Nothing is built
   * here, and Classic never touches the Enhanced path, so switching back restores it exactly.
   */
  setMode(mode: AudioMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // The running loop is on the old route, so start it again on the new one.
    if (this.handle && this.music && this.track) this.playMusic(this.track, true);
  }

  /** The music bus for Enhanced, or null (play the music as Classic) if the context cannot build one. */
  private enhancedMusic(ctx: AudioContext): MusicBus | null {
    if (this.musicBus) return this.musicBus;
    try {
      this.musicBus = createMusicBus(ctx, ctx.destination);
      return this.musicBus;
    } catch (err) {
      console.warn('Music field unavailable, playing the music as Classic', err);
      return null;
    }
  }

  /** An emitter for one Enhanced sound, or null (play it as Classic) if the context cannot build one. */
  private emitter(ctx: AudioContext, at: SoundAt): GainNode | null {
    try {
      const e = createEmitter(ctx, at, ctx.destination);
      this.emitters++;
      return e;
    } catch (err) {
      console.warn('Sound field unavailable, playing this sound as Classic', err);
      return null;
    }
  }

  /**
   * Plays a sound effect. Classic ignores `at` and plays the effect on the real context, centred.
   * Enhanced routes the effect's voices into an emitter for this one call (a gain into a stereo
   * panner into the destination), which places it at `at` (the centre if omitted).
   */
  play(name: string, at?: SoundAt): void {
    const voices = this.patterns.sfx[name];
    if (!this.sfx || !voices) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    try {
      // Undertone schedules a play() synchronously, so the voices of this call all connect to
      // this call's emitter before the next call can build its own.
      const emitter = this.mode === 'enhanced' ? this.emitter(ctx, at ?? CENTRE) : null;
      if (this.ut) {
        try {
          const fx = this.undertoneEffect(this.ut, name, voices);
          if (emitter) fx.play({ ctx: routedContext(ctx, emitter) });
          else fx.play({ ctx });
          return;
        } catch (e) {
          console.warn('Undertone sfx failed, using the built-in synth', name, e);
        }
      }
      this.mini?.playSfx(voices, this.sfxVol, emitter ?? undefined);
    } catch (e) {
      console.warn('sfx failed', name, e);
    }
  }

  /** Plays the sound effect tied to an on-screen caption, if it has one, placed at `at`. */
  caption(text: string, at?: SoundAt): void {
    const k = this.patterns.captionSfx[text];
    if (k) this.play(k, at);
  }

  playMusic(track: string | null, force = false): void {
    if (this.disposed) return;
    if (track === this.track && !force) return;
    this.track = track;
    this.handle?.stop();
    this.handle = null;
    const t = track ? this.patterns.music[track] : undefined;
    if (!this.music || !t) return;
    if (!this.ctx || !this.mini) {
      this.pending = track;
      return;
    }
    const field = this.mode === 'enhanced' ? this.enhancedMusic(this.ctx) : null;
    if (this.ut) {
      try {
        const U = this.ut;
        const voices = t.parts.map((p) => buildVoice(U, p, this.musicVol, true, !!field));
        this.handle = U.stack(...voices).loop(
          field ? { ctx: field.routed, bpm: t.bpm } : { ctx: this.ctx, bpm: t.bpm },
        );
        return;
      } catch (e) {
        console.warn('Undertone music failed, using the built-in synth', track, e);
      }
    }
    this.handle = this.mini.loop(t, this.musicVol, field?.bus);
  }

  setMusic(on: boolean): void {
    // Setting the state it is already in must not restart the running loop.
    if (on === this.music) return;
    this.music = on;
    this.handle?.stop();
    this.handle = null;
    if (on && this.track) this.playMusic(this.track, true);
  }

  setSfx(on: boolean): void {
    this.sfx = on;
  }

  /** Sets music loudness from 0 to 1. The running loop restarts so the new level takes effect. */
  setMusicVolume(v: number): void {
    const vol = Math.min(1, Math.max(0, v));
    if (vol === this.musicVol) return;
    this.musicVol = vol;
    if (this.music && this.track) this.playMusic(this.track, true);
  }

  /** Sets sound effect loudness from 0 to 1. Effects built at the old level are dropped. */
  setSfxVolume(v: number): void {
    const vol = Math.min(1, Math.max(0, v));
    if (vol === this.sfxVol) return;
    this.sfxVol = vol;
    this.cache.clear();
  }

  /** Suspends or resumes the whole context (tab hidden, pause menu). */
  setActive(on: boolean): void {
    if (!this.ctx || this.disposed) return;
    void (on ? this.ctx.resume() : this.ctx.suspend());
  }

  dispose(): void {
    this.disposed = true;
    this.handle?.stop();
    this.handle = null;
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('pointerup', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    void this.ctx?.close();
  }
}
