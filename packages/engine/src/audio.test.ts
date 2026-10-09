// Tests for the game audio manager, its Undertone playback and built-in synth fallback.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as Undertone from '@liminal-hq/undertone';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from './fake-audio-context';
import { GameAudio, type AudioPatterns, type UndertoneModule } from './audio';

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
    expect(panner!.out).toEqual([ctx.destination]);
    // zap has two voices and both end on the emitter. Nothing reaches the destination but the panner.
    const voices = voicesInto(ctx, emitter);
    expect(voices).toHaveLength(2);
    for (const v of voices) expect(v.out).toEqual([emitter]);
    expect(voicesInto(ctx, ctx.destination)).toHaveLength(0);
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
    // Only the one panner from the Enhanced call exists; both Classic voices end on the destination.
    expect(ctx.all('panner')).toHaveLength(1);
    const direct = voicesInto(ctx, ctx.destination);
    expect(direct).toHaveLength(2);
    expect(audio.emitters).toBe(1);
  });

  it('keeps music on the Classic path in Enhanced', async () => {
    const loop = vi.spyOn(Undertone.Pattern.prototype, 'loop').mockReturnValue({ stop: vi.fn() });
    const audio = new GameAudio(patterns, async () => Undertone);
    await flush();
    const ctx = await unlockAudio();
    audio.setMode('enhanced');
    audio.playMusic('title');
    expect(loop.mock.calls[0]![0]).toEqual({ ctx, bpm: 120 });
    expect(ctx.all('panner')).toHaveLength(0);
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
    expect(voicesInto(ctx, ctx.destination)).toHaveLength(0);
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
    expect(voicesInto(ctx, ctx.destination)).toHaveLength(1);
  });
});
