// Tests for the game audio manager, its Undertone playback and built-in synth fallback.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as Undertone from '@liminal-hq/undertone';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

class FakeContext {
  static instances: FakeContext[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  close = vi.fn(async () => {});
  constructor() {
    FakeContext.instances.push(this);
  }
  private node(): Record<string, unknown> {
    const param = { value: 0 };
    return { connect: vi.fn(), gain: param, delayTime: param };
  }
  createDelay = () => this.node();
  createGain = () => this.node();
}

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
