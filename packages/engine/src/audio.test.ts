// Tests for the game audio manager, its Undertone playback and built-in synth fallback.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as Undertone from '@liminal-hq/undertone';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, type FakeNode } from './fake-audio-context';
import { GameAudio, buildVoice, type AudioPatterns, type UndertoneModule } from './audio';
import { MASTER, MASTER_DEFAULTS } from './master';
import { PART_PAN } from './sound-field';

const panDefaults = structuredClone(PART_PAN);

const patterns: AudioPatterns = {
  sfx: {
    jump: [{ n: 'c4', w: 'square', g: 0.3, slide: 0.1 }],
    zap: [
      { n: 'white', g: 0.2, hpf: 4000 },
      { n: 'e4', g: 0.2, lpf: 2000, nudge: 0.02 },
    ],
  },
  music: {
    title: {
      bpm: 120,
      parts: [
        { notes: 'c3 [e3 g3]', w: 'sawtooth', g: 0.2, room: 0.4, delay: 0.3 },
        { notes: 'white*4', noise: true, g: 0.1, hpf: 6000 },
      ],
    },
  },
  captionSfx: { '*boing*': 'jump' },
};

/** The same tracks with roles: a panned lead, a centred bass and a noise part with no role. */
const roled: AudioPatterns = {
  ...patterns,
  music: {
    title: {
      bpm: 120,
      parts: [
        { notes: 'c4 e4', w: 'sawtooth', g: 0.2, role: 'lead' },
        { notes: 'c2 g2', g: 0.2, role: 'bass' },
      ],
    },
  },
};

const FakeContext = FakeAudioContext;
type FakeContext = FakeAudioContext;

const listeners = new Map<string, () => void>();

beforeEach(() => {
  FakeContext.instances = [];
  listeners.clear();
  vi.stubGlobal('window', {
    AudioContext: FakeContext,
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Unlocks the context the way a first click does, and waits for the context to report running. */
async function unlockAudio(): Promise<FakeContext> {
  listeners.get('pointerdown')!();
  await flush();
  return FakeContext.instances[0]!;
}

describe('GameAudio with Undertone', () => {
  it('also unlocks on a touch release, since Chrome ignores a touch pointerdown', async () => {
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    listeners.get('pointerup')!();
    await flush();
    expect(FakeContext.instances[0]!.resume).toHaveBeenCalledTimes(1);
    audio.dispose();
    expect(listeners.has('pointerup')).toBe(false);
  });

  it('creates no AudioContext until the first input, then resumes it', async () => {
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    expect(FakeContext.instances).toHaveLength(0);
    expect(audio.backend).toBe('Undertone 0.2');
    const ctx = await unlockAudio();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(listeners.has('keydown')).toBe(true);
    audio.dispose();
    expect(listeners.size).toBe(0);
  });

  it('plays effects (including high-pass ones) through Undertone once unlocked', async () => {
    const play = vi.spyOn(Undertone.Pattern.prototype, 'play').mockImplementation(() => {});
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    audio.play('jump');
    expect(play).not.toHaveBeenCalled();
    const ctx = await unlockAudio();
    audio.play('jump');
    audio.play('zap');
    audio.caption('*boing*');
    audio.caption('no such caption');
    expect(play).toHaveBeenCalledTimes(3);
    expect(play.mock.calls[0]![0]).toEqual({ ctx });
    audio.sfx = false;
    audio.play('jump');
    expect(play).toHaveBeenCalledTimes(3);
  });

  it('starts music requested before unlock as a loop at the track bpm', async () => {
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    audio.playMusic('title');
    expect(loop).not.toHaveBeenCalled();
    const ctx = await unlockAudio();
    expect(loop).toHaveBeenCalledTimes(1);
    expect(loop.mock.calls[0]![0]).toEqual({ ctx, bpm: 120 });
  });

  it('stops the loop when music changes or is switched off', async () => {
    const stop = vi.fn();
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop });
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    await unlockAudio();
    audio.playMusic('title');
    audio.playMusic('title');
    expect(loop).toHaveBeenCalledTimes(1);
    audio.setMusic(false);
    expect(stop).toHaveBeenCalledTimes(1);
    audio.setMusic(true);
    expect(loop).toHaveBeenCalledTimes(2);
    audio.playMusic(null);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});

describe('GameAudio volume', () => {
  it('restarts the music loop when the music volume changes, and clamps it', async () => {
    const stop = vi.fn();
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop });
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    await unlockAudio();
    audio.playMusic('title');
    expect(loop).toHaveBeenCalledTimes(1);
    audio.setMusicVolume(0.5);
    expect(audio.musicVol).toBe(0.5);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(loop).toHaveBeenCalledTimes(2);
    audio.setMusicVolume(0.5);
    expect(loop).toHaveBeenCalledTimes(2);
    audio.setMusicVolume(7);
    expect(audio.musicVol).toBe(1);
    audio.setMusicVolume(-1);
    expect(audio.musicVol).toBe(0);
  });

  it('does not restart the loop when music is set to the state it is already in', async () => {
    const stop = vi.fn();
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop });
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    await unlockAudio();
    audio.playMusic('title');
    audio.setMusic(true);
    audio.setMusic(true);
    expect(loop).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    // A volume change restarts it once, and setting the state again afterwards does not add a second.
    audio.setMusicVolume(0.5);
    audio.setMusic(true);
    expect(loop).toHaveBeenCalledTimes(2);
  });

  it('does not start music for a volume change while music is off', async () => {
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    await unlockAudio();
    audio.playMusic('title');
    audio.setMusic(false);
    audio.setMusicVolume(0.25);
    expect(loop).toHaveBeenCalledTimes(1);
  });

  it('builds effects again at a new sound volume and clamps it', async () => {
    const play = vi.spyOn(Undertone.Pattern.prototype, 'play').mockImplementation(() => {});
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    await unlockAudio();
    audio.play('jump');
    audio.setSfxVolume(0.25);
    expect(audio.sfxVol).toBe(0.25);
    audio.play('jump');
    expect(play).toHaveBeenCalledTimes(2);
    audio.setSfxVolume(3);
    expect(audio.sfxVol).toBe(1);
  });
});

describe('GameAudio fallback', () => {
  it('uses the built-in synth when Undertone fails to load', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const play = vi.spyOn(Undertone.Pattern.prototype, 'play').mockImplementation(() => {});
    const audio = new GameAudio(patterns, async () => {
      throw new Error('offline');
    });
    await flush();
    expect(audio.backend).toBe('Built-in synth');
    const ctx = await unlockAudio();
    const osc = vi.fn();
    const createOscillator = vi.fn(() => {
      osc();
      return {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    });
    Object.assign(ctx, {
      createOscillator,
      createGain: () => ({
        gain: {
          value: 0,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }),
    });
    audio.play('jump');
    expect(play).not.toHaveBeenCalled();
    expect(osc).toHaveBeenCalledTimes(1);
  });

  it('falls back per sound when Undertone throws while playing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: UndertoneModule = {
      ...Undertone,
      stack: () => {
        throw new Error('boom');
      },
    };
    const audio = new GameAudio(patterns, async () => broken);
    await flush();
    const ctx = await unlockAudio();
    const createOscillator = vi.fn();
    Object.assign(ctx, { createOscillator });
    expect(() => audio.play('jump')).not.toThrow();
    expect(createOscillator).toHaveBeenCalled();
  });
});

/** Every node type Classic must never create for a sound effect. */
const ENHANCEMENT_KINDS = ['panner', 'compressor', 'convolver', 'merger'];

describe('GameAudio Classic path', () => {
  it('plays an effect with exactly { ctx } and sends each voice straight to the destination', async () => {
    const play = vi.spyOn(Undertone.Pattern.prototype, 'play');
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.play('jump');
    audio.play('zap');
    expect(play).toHaveBeenCalledTimes(2);
    for (const call of play.mock.calls) {
      expect(Object.keys(call[0]!)).toEqual(['ctx']);
      expect(call[0]!.ctx).toBe(ctx);
    }
    // One voice in jump and two in zap, each ending on the real destination.
    const direct = ctx.all('gain').filter((g) => g.out.includes(ctx.destination));
    expect(direct).toHaveLength(3);
    for (const kind of ENHANCEMENT_KINDS) expect(ctx.all(kind), kind).toHaveLength(0);
  });

  it('loops music with exactly { ctx, bpm } and creates no panner or compressor', async () => {
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop');
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.playMusic('title');
    expect(loop).toHaveBeenCalledTimes(1);
    expect(Object.keys(loop.mock.calls[0]![0]!)).toEqual(['ctx', 'bpm']);
    expect(loop.mock.calls[0]![0]!.ctx).toBe(ctx);
    expect(loop.mock.calls[0]![0]!.bpm).toBe(120);
    expect(ctx.all('panner')).toHaveLength(0);
    expect(ctx.all('compressor')).toHaveLength(0);
    // The only extra nodes are the room send's convolver, which feeds the real destination.
    for (const c of ctx.all('convolver')) expect(c.out).toContain(ctx.destination);
    audio.dispose();
  });

  it('gives the built-in synth the real destination and builds nothing else on unlock', async () => {
    const audio = new GameAudio(patterns, async () => {
      throw new Error('offline');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await flush();
    const ctx = await unlockAudio();
    // The synth's echo line and its feedback gain, and nothing for any enhancement.
    expect(ctx.nodes.map((n) => n.kind)).toEqual(['delay', 'gain']);
    expect(ctx.all('delay')[0]!.out).toContain(ctx.destination);
    audio.play('zap');
    const direct = ctx.all('gain').filter((g) => g.out.includes(ctx.destination));
    expect(direct).toHaveLength(2);
    for (const kind of ENHANCEMENT_KINDS) expect(ctx.all(kind), kind).toHaveLength(0);
    audio.dispose();
  });
});

describe('GameAudio Enhanced path', () => {
  /**
   * The master's gains, found by following the chain: the buses are the gains that feed the sum
   * (the node before the first filter), in the order the master made them, and the trim is what
   * the limiter feeds.
   */
  const buses = (ctx: FakeContext) => {
    const sum = ctx.nodes.find((n) => n.out.includes(ctx.all('biquad')[0]!))!;
    const [sfx, music] = ctx.all('gain').filter((g) => g.out.includes(sum));
    return { sfx: sfx!, music: music!, trim: ctx.all('compressor')[1]!.out[0]! };
  };

  /** The mix stage after a music bus: `bus -> level -> lpf -> mix -> master music bus`. */
  const mixChain = (bus: FakeNode) => {
    const level = bus.out[0]!;
    const lpf = level.out[0]!;
    const mix = lpf.out[0]!;
    return { level, lpf, mix };
  };

  /** The voice gains an effect left on `to`: every gain that connects straight to that node. */
  const voicesInto = (ctx: FakeContext, to: unknown) =>
    ctx.all('gain').filter((g) => g.out.includes(to as never));

  it('is Classic until it is told otherwise, and plays unplaced Enhanced sounds at the centre', async () => {
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    expect(audio.mode).toBe('classic');
    const ctx = await unlockAudio();
    audio.setMode('enhanced');
    audio.play('jump');
    const [panner] = ctx.all('panner');
    expect(panner!.pan.value).toBe(0);
    const [emitter] = voicesInto(ctx, panner);
    expect(emitter!.gain.value).toBeCloseTo(Math.SQRT2, 12);
  });

  it('routes a placed effect through its own emitter: voices, then gain, panner and destination', async () => {
    const play = vi.spyOn(Undertone.Pattern.prototype, 'play');
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.setMode('enhanced');
    audio.play('zap', { pan: 0.42, gain: 0.5 });
    const [panner] = ctx.all('panner');
    const [emitter] = voicesInto(ctx, panner);
    expect(panner!.pan.value).toBe(0.42);
    expect(emitter!.gain.value).toBeCloseTo(0.5 * Math.SQRT2, 12);
    expect(panner!.out).toEqual([buses(ctx).sfx]);
    // zap has two voices and both end on the emitter. Only the master's trim reaches the destination.
    const voices = voicesInto(ctx, emitter);
    expect(voices).toHaveLength(2);
    for (const v of voices) expect(v.out).toEqual([emitter]);
    expect(voicesInto(ctx, ctx.destination)).toEqual([buses(ctx).trim]);
    // Undertone was handed a routed context whose destination is the emitter, not the real context.
    const arg = play.mock.calls[0]![0]!;
    expect(arg.ctx).not.toBe(ctx);
    expect(arg.ctx!.destination).toBe(emitter);
    expect(audio.emitters).toBe(1);
  });

  it('connects each call’s voices to that call’s emitter, not to an earlier one', async () => {
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.setMode('enhanced');
    audio.play('zap', { pan: -0.6, gain: 0.4 });
    audio.play('jump', { pan: 0.6, gain: 1 });
    const [p1, p2] = ctx.all('panner');
    const [e1] = voicesInto(ctx, p1);
    const [e2] = voicesInto(ctx, p2);
    expect(e1).not.toBe(e2);
    expect(p1!.pan.value).toBe(-0.6);
    expect(p2!.pan.value).toBe(0.6);
    expect(voicesInto(ctx, e1)).toHaveLength(2);
    expect(voicesInto(ctx, e2)).toHaveLength(1);
  });

  it('places a caption’s effect, and ignores the place in Classic', async () => {
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.caption('*boing*', { pan: 0.5, gain: 1 });
    expect(ctx.all('panner')).toHaveLength(0);
    audio.setMode('enhanced');
    audio.caption('*boing*', { pan: 0.5, gain: 1 });
    expect(ctx.all('panner')).toHaveLength(1);
    expect(ctx.all('panner')[0]!.pan.value).toBe(0.5);
  });

  it('restores the exact Classic path when switched back', async () => {
    const play = vi.spyOn(Undertone.Pattern.prototype, 'play');
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.play('jump');
    audio.setMode('enhanced');
    audio.play('jump', { pan: 0.3, gain: 1 });
    audio.setMode('classic');
    audio.play('jump', { pan: 0.3, gain: 1 });
    expect(play).toHaveBeenCalledTimes(3);
    expect(Object.keys(play.mock.calls[2]![0]!)).toEqual(['ctx']);
    expect(play.mock.calls[2]![0]!.ctx).toBe(ctx);
    expect(play.mock.calls[2]![0]).toEqual(play.mock.calls[0]![0]);
    // Only the one panner from the Enhanced call exists; both Classic voices end on the destination,
    // beside the master's trim, which stays for a moment after the switch.
    expect(ctx.all('panner')).toHaveLength(1);
    const direct = voicesInto(ctx, ctx.destination).filter((g) => g !== buses(ctx).trim);
    expect(direct).toHaveLength(2);
    expect(audio.emitters).toBe(1);
  });

  it('loops Enhanced music through a routed context into a music bus on the destination', async () => {
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(roled, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.setMode('enhanced');
    audio.playMusic('title');
    const arg = loop.mock.calls[0]![0]!;
    expect(Object.keys(arg)).toEqual(['ctx', 'bpm']);
    expect(arg.bpm).toBe(120);
    expect(arg.ctx).not.toBe(ctx);
    const bus = arg.ctx!.destination as unknown as FakeNode;
    const chain = mixChain(bus);
    expect(chain.lpf.kind).toBe('biquad');
    expect(chain.mix.out).toEqual([buses(ctx).music]);
    // The music bus is built once, and the next loop reuses it.
    audio.playMusic('title', true);
    expect(loop.mock.calls[1]![0]!.ctx).toBe(arg.ctx);
    expect(voicesInto(ctx, ctx.destination)).toEqual([buses(ctx).trim]);
  });

  it('pans only the panned parts, with the make-up gain on those and not on the centred ones', async () => {
    const play = vi.spyOn(Undertone.Pattern.prototype, 'play').mockImplementation(() => {});
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop');
    const audio = new GameAudio(roled, async () => Undertone);
    await flush();
    await unlockAudio();
    audio.setMode('enhanced');
    audio.playMusic('title');
    expect(loop).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
    // Build the same stack by hand and inspect its events: bass (centred) has no pan, lead has one.
    const bass = buildVoice(Undertone, roled.music['title']!.parts[1]!, 1, true, true);
    const lead = buildVoice(Undertone, roled.music['title']!.parts[0]!, 1, true, true);
    const first = (p: typeof bass) =>
      p.query({ begin: new Undertone.Fraction(0), end: new Undertone.Fraction(1) })[0]!.value;
    expect(first(bass)).not.toHaveProperty('pan');
    expect(first(bass).gainLevel).toBeCloseTo(0.2, 12);
    expect(first(lead).pan).toBe(PART_PAN.lead);
    expect(first(lead).gainLevel).toBeCloseTo(0.2 * Math.SQRT2, 12);
    audio.dispose();
  });

  it('restarts the music loop on the new route when the mode changes mid-track', async () => {
    const stop = vi.fn();
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop });
    const audio = new GameAudio(roled, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.playMusic('title');
    expect(loop.mock.calls[0]![0]).toEqual({ ctx, bpm: 120 });
    audio.setMode('enhanced');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(loop).toHaveBeenCalledTimes(2);
    expect(loop.mock.calls[1]![0]!.ctx).not.toBe(ctx);
    audio.setMode('enhanced');
    expect(loop).toHaveBeenCalledTimes(2);
    audio.setMode('classic');
    expect(stop).toHaveBeenCalledTimes(2);
    expect(loop.mock.calls[2]![0]).toEqual({ ctx, bpm: 120 });
    // Without music playing, switching starts nothing.
    audio.playMusic(null);
    audio.setMode('enhanced');
    expect(loop).toHaveBeenCalledTimes(3);
  });

  it('plays the built-in synth’s music through the bus, panned like Undertone', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const audio = new GameAudio(roled, async () => {
        throw new Error('offline');
      });
      await vi.advanceTimersByTimeAsync(0);
      listeners.get('pointerdown')!();
      await vi.advanceTimersByTimeAsync(0);
      const ctx = FakeContext.instances[0]!;
      audio.setMode('enhanced');
      audio.playMusic('title');
      const panners = ctx.all('panner');
      expect(panners.length).toBeGreaterThan(0);
      // Only the lead is panned, at its role's pan, and it ends on the music bus.
      for (const p of panners) {
        expect(p.pan.value).toBe(PART_PAN.lead);
        expect(p.out).toHaveLength(1);
        expect(mixChain(p.out[0]!).mix.out).toEqual([buses(ctx).music]);
      }
      // The centred bass goes straight to the bus, and nothing but the bus reaches the destination.
      expect(voicesInto(ctx, ctx.destination)).toEqual([buses(ctx).trim]);
      audio.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays the music as Classic if the context cannot build the bus', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(roled, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    ctx.createGain = () => {
      throw new Error('unsupported');
    };
    audio.setMode('enhanced');
    audio.playMusic('title');
    expect(loop.mock.calls[0]![0]).toEqual({ ctx, bpm: 120 });
  });

  it('sends the built-in synth’s voices through the emitter too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audio = new GameAudio(patterns, async () => {
      throw new Error('offline');
    });
    await flush();
    const ctx = await unlockAudio();
    audio.setMode('enhanced');
    audio.play('zap', { pan: -0.2, gain: 1 });
    const [panner] = ctx.all('panner');
    const [emitter] = voicesInto(ctx, panner);
    expect(voicesInto(ctx, emitter)).toHaveLength(2);
    expect(voicesInto(ctx, ctx.destination)).toEqual([buses(ctx).trim]);
    audio.dispose();
  });

  it('plays as Classic if the context cannot build a panner', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const play = vi.spyOn(Undertone.Pattern.prototype, 'play');
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    ctx.createStereoPanner = () => {
      throw new Error('unsupported');
    };
    audio.setMode('enhanced');
    audio.play('jump', { pan: 0.3, gain: 1 });
    expect(warn).toHaveBeenCalled();
    expect(play.mock.calls[0]![0]).toEqual({ ctx });
    // The one voice, and the trim of the master that was built before the panner failed.
    expect(voicesInto(ctx, ctx.destination)).toHaveLength(2);
  });
});

describe('GameAudio master chain', () => {
  const compressors = (ctx: FakeContext) => ctx.all('compressor');

  afterEach(() => {
    vi.useRealTimers();
    Object.assign(MASTER, structuredClone(MASTER_DEFAULTS));
    Object.assign(PART_PAN, structuredClone(panDefaults));
  });

  it('is not built by unlocking, by Classic sound or by Classic music', async () => {
    vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(roled, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.play('jump');
    audio.playMusic('title');
    expect(compressors(ctx)).toHaveLength(0);
    expect(audio.masterBuilt).toBe(false);
  });

  it('is built on the first Enhanced sound or music, once, and shared by both', async () => {
    vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(roled, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.setMode('enhanced');
    expect(compressors(ctx)).toHaveLength(0);
    audio.play('jump');
    expect(compressors(ctx)).toHaveLength(2);
    audio.play('zap');
    audio.playMusic('title');
    expect(compressors(ctx)).toHaveLength(2);
    expect(ctx.all('convolver').filter((c) => c.out.includes(compressors(ctx)[0]!))).toHaveLength(
      1,
    );
    expect(audio.masterBuilt).toBe(true);
  });

  it('is detached two seconds after switching to Classic, and kept if Enhanced returns first', async () => {
    vi.useFakeTimers();
    const audio = new GameAudio(roled, async () => Undertone);
    await vi.advanceTimersByTimeAsync(0);
    listeners.get('pointerdown')!();
    await vi.advanceTimersByTimeAsync(0);
    const ctx = FakeContext.instances[0]!;
    audio.setMode('enhanced');
    audio.play('jump');
    const trim = compressors(ctx)[1]!.out[0]!;
    expect(trim.out).toEqual([ctx.destination]);

    audio.setMode('classic');
    await vi.advanceTimersByTimeAsync(1999);
    expect(audio.masterBuilt).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(audio.masterBuilt).toBe(false);
    for (const n of ctx.nodes.filter((n) => n.out.includes(ctx.destination as never))) {
      expect(n.kind).not.toBe('gain');
    }
    expect(trim.out).toEqual([]);

    // Coming back builds a fresh chain; leaving and returning inside two seconds keeps it.
    audio.setMode('enhanced');
    audio.play('jump');
    expect(compressors(ctx)).toHaveLength(4);
    audio.setMode('classic');
    await vi.advanceTimersByTimeAsync(1500);
    audio.setMode('enhanced');
    await vi.advanceTimersByTimeAsync(5000);
    expect(audio.masterBuilt).toBe(true);
    audio.play('jump');
    expect(compressors(ctx)).toHaveLength(4);
    audio.dispose();
    expect(audio.masterBuilt).toBe(false);
  });

  it('plays Enhanced sound unmastered if the context cannot build the chain', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    ctx.createDynamicsCompressor = () => {
      throw new Error('unsupported');
    };
    audio.setMode('enhanced');
    audio.play('jump', { pan: 0.3, gain: 1 });
    expect(ctx.all('panner')[0]!.out).toEqual([ctx.destination]);
    expect(audio.masterBuilt).toBe(false);
  });

  it('applies a live tune to the running chain and restarts the music for a new pan', async () => {
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(roled, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.setMode('enhanced');
    audio.playMusic('title');
    expect(loop).toHaveBeenCalledTimes(1);
    const trim = compressors(ctx)[1]!.out[0]!;
    const report = audio.tune({ master: { trim: 0.65 }, partPan: { lead: -0.25 } });
    expect(report.applied).toEqual(['master.trim', 'partPan.lead']);
    expect(trim.gain.calls.at(-1)).toEqual({ method: 'setTargetAtTime', args: [0.65, 0, 0.05] });
    expect(loop).toHaveBeenCalledTimes(2);
    // A change that does not touch the pans leaves the music alone.
    audio.tune({ master: { trim: 0.6 } });
    expect(loop).toHaveBeenCalledTimes(2);
  });
});

describe('GameAudio mix stage', () => {
  const PAUSE = { lpf: 900, gain: 0.7 };
  const OPEN = { lpf: 20000, gain: 1 };

  /** Starts Enhanced music and returns the context and the mix nodes of its bus. */
  async function enhancedMusic(p: AudioPatterns = roled) {
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(p, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.setMode('enhanced');
    audio.playMusic('title');
    const bus = loop.mock.calls[0]![0]!.ctx!.destination as unknown as FakeNode;
    const level = bus.out[0]!;
    const lpf = level.out[0]!;
    const mix = lpf.out[0]!;
    // Building the bus set its starting values; the tests look at what happens after.
    for (const p of [level.gain, lpf.frequency, mix.gain]) p.calls.length = 0;
    return { audio, ctx, loop, bus, level, lpf, mix };
  }

  const calls = (p: { calls: { method: string; args: number[] }[] }) =>
    p.calls.map((c) => [c.method, ...c.args]);

  it('builds the bus as bus, level, a flat low-pass, mix gain, with the mix open', async () => {
    const { lpf, level, mix } = await enhancedMusic();
    expect(lpf.kind).toBe('biquad');
    expect(lpf.type).toBe('lowpass');
    expect(lpf.Q.value).toBe(0);
    expect(lpf.frequency.value).toBe(20000);
    expect(level.gain.value).toBe(1);
    expect(mix.gain.value).toBe(1);
  });

  it('glides into the pause muffle from the current time and back out slowly', async () => {
    const { audio, ctx, lpf, mix } = await enhancedMusic();
    ctx.state = 'running';
    ctx.currentTime = 10;
    audio.setMix(PAUSE);
    expect(calls(lpf.frequency)).toEqual([
      ['cancelScheduledValues', 10],
      ['setValueAtTime', 20000, 10],
      ['exponentialRampToValueAtTime', 900, 10.18],
    ]);
    expect(calls(mix.gain)).toEqual([
      ['cancelScheduledValues', 10],
      ['setValueAtTime', 1, 10],
      ['linearRampToValueAtTime', 0.7, 10.18],
    ]);
    // Resume halfway through the close: the open starts from where the close had got to.
    ctx.currentTime = 10.06;
    lpf.frequency.calls.length = 0;
    audio.setMix(OPEN);
    const [cancel, set, ramp] = calls(lpf.frequency);
    expect(cancel).toEqual(['cancelScheduledValues', 10.06]);
    expect(set![0]).toBe('setValueAtTime');
    expect(set![1]).toBeCloseTo(7114, -1);
    expect(ramp![1]).toBe(20000);
    expect(ramp![2]).toBeCloseTo(10.41, 10);
  });

  it('ignores a mix it already has, and reports it', async () => {
    const { audio, ctx, lpf } = await enhancedMusic();
    ctx.state = 'running';
    audio.setMix(OPEN);
    expect(lpf.frequency.calls).toEqual([]);
    audio.setMix(PAUSE);
    expect(audio.mixState).toEqual({ ...PAUSE, applied: true });
  });

  it('applies a mix asked for before the bus exists without a ramp when it is built', async () => {
    vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(roled, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.setMode('enhanced');
    audio.setMix(PAUSE);
    expect(audio.mixState.applied).toBe(false);
    audio.playMusic('title');
    const lpf = ctx.all('biquad')[ctx.all('biquad').length - 1]!;
    expect(lpf.frequency.value).toBe(900);
    expect(calls(lpf.frequency).some((c) => String(c[0]).endsWith('RampToValueAtTime'))).toBe(
      false,
    );
    expect(ctx.all('gain').some((g) => g.gain.value === 0.7)).toBe(true);
    expect(audio.mixState).toEqual({ ...PAUSE, applied: true });
  });

  it('keeps a mix asked for in Classic and applies it at once when Enhanced returns', async () => {
    const { audio, ctx, lpf, mix } = await enhancedMusic();
    ctx.state = 'running';
    audio.setMode('classic');
    audio.setMix(PAUSE);
    expect(audio.mixState.applied).toBe(false);
    expect(lpf.frequency.value).toBe(20000);
    audio.setMode('enhanced');
    expect(lpf.frequency.value).toBe(900);
    expect(mix.gain.value).toBe(0.7);
    expect(calls(lpf.frequency).some((c) => String(c[0]).endsWith('RampToValueAtTime'))).toBe(
      false,
    );
  });

  it('changes the mix at once while the page is hidden, so it is in place on return', async () => {
    const { audio, ctx, lpf, mix } = await enhancedMusic();
    ctx.state = 'running';
    ctx.currentTime = 4;
    audio.setActive(false);
    audio.setMix(PAUSE);
    expect(calls(lpf.frequency)).toEqual([
      ['cancelScheduledValues', 4],
      ['setValueAtTime', 900, 4],
    ]);
    expect(mix.gain.value).toBe(0.7);
    audio.setActive(true);
    ctx.currentTime = 4.5;
    audio.setMix(OPEN);
    expect(calls(lpf.frequency).pop()).toEqual(['exponentialRampToValueAtTime', 20000, 4.85]);
  });

  it('puts the music volume on the bus in Enhanced, with no restart', async () => {
    const { audio, ctx, loop, level } = await enhancedMusic();
    ctx.currentTime = 2;
    audio.setMusicVolume(0.5);
    expect(loop).toHaveBeenCalledTimes(1);
    expect(calls(level.gain).slice(-2)).toEqual([
      ['cancelScheduledValues', 2],
      ['setTargetAtTime', 0.5, 2, 0.02],
    ]);
    expect(audio.musicVol).toBe(0.5);
  });

  it('builds the music at the stored volume on the level gain, and restarts in Classic as before', async () => {
    vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(roled, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.setMusicVolume(0.4);
    audio.setMode('enhanced');
    audio.playMusic('title');
    const lpf = ctx.all('biquad').at(-1)!;
    const level = ctx.nodes.find((n) => n.out.includes(lpf))!;
    expect(level.gain.value).toBe(0.4);
  });

  it('builds the Classic path with no extra nodes after setMix, and the mix stays stored', async () => {
    vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(roled, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.setMix(PAUSE);
    audio.playMusic('title');
    audio.play('jump');
    audio.setMix(OPEN);
    expect(ctx.extras()).toEqual([]);
    expect(ctx.all('biquad')).toEqual([]);
    expect(audio.masterBuilt).toBe(false);
  });
});
