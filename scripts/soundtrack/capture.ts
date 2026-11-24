// The page the soundtrack render drives: plays one Enhanced song through the game's own audio chain and taps the result.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { GameAudio } from '../../packages/engine/src/audio';
import { PATTERNS } from '../../episodes/episode-1/src/audio/patterns';
import { MIX } from '../../episodes/episode-1/src/audio/mix';
import { roomProfile, type RoomName } from '../../episodes/episode-1/src/audio/rooms';

/** The CD's sample rate, so the capture needs no resampling. */
const SAMPLE_RATE = 44100;

declare global {
  interface Window {
    /** Sends one block of captured samples (left, then right, as base64 float32) to the driver. */
    sink: (left: string, right: string, frame: number) => void;
    captureSong: (
      track: string,
      room: RoomName,
      seconds: number,
      stopAfter?: number,
    ) => Promise<{ startFrame: number }>;
  }
}

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.l = []; this.r = []; this.n = 0; this.at = -1; }
  process(inputs) {
    const ch = inputs[0];
    const l = ch[0] ?? new Float32Array(128);
    const r = ch[1] ?? l;
    if (this.at < 0) this.at = currentFrame;
    this.l.push(l.slice()); this.r.push(r.slice()); this.n += l.length;
    if (this.n >= 44100) {
      this.port.postMessage({ l: this.l, r: this.r, at: this.at });
      this.l = []; this.r = []; this.n = 0; this.at = -1;
    }
    return true;
  }
}
registerProcessor('tap', Tap);
`;

const b64 = (blocks: Float32Array[]): string => {
  const all = new Float32Array(blocks.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of blocks) {
    all.set(b, at);
    at += b.length;
  }
  const bytes = new Uint8Array(all.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

// The game builds its own context; give it one at the CD's rate whose destination is the tap, and silent to the speakers.
let tapReady: Promise<void> | null = null;
let startFrame = 0;
const RealAudioContext = window.AudioContext;
class CapturingContext extends RealAudioContext {
  constructor() {
    super({ sampleRate: SAMPLE_RATE });
    const into = this.createGain();
    Object.defineProperty(this, 'destination', { value: into });
    const mute = this.createGain();
    mute.gain.value = 0;
    mute.connect(super.destination);
    tapReady = this.audioWorklet
      .addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
      .then(() => {
        const node = new AudioWorkletNode(this, 'tap', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.port.onmessage = (
          e: MessageEvent<{ l: Float32Array[]; r: Float32Array[]; at: number }>,
        ) => window.sink(b64(e.data.l), b64(e.data.r), e.data.at);
        into.connect(node).connect(mute);
      });
  }
}
window.AudioContext = CapturingContext as unknown as typeof AudioContext;

window.captureSong = async (track, room, seconds, stopAfter) => {
  const audio = new GameAudio({ ...PATTERNS, mix: MIX }, undefined, { unlockAtBoot: true });
  audio.setMode('enhanced');
  audio.setMusicStyle('enhanced');
  audio.setRoom(roomProfile(room, false));
  while (audio.backend === 'Loading Undertone') await new Promise((r) => setTimeout(r, 50));
  if (audio.backend !== 'Undertone 0.2')
    throw new Error(`Undertone did not load: ${audio.backend}`);
  await tapReady;
  const ctx = (audio as unknown as { ctx: AudioContext }).ctx;
  if (ctx.state !== 'running') await ctx.resume();
  await new Promise((r) => setTimeout(r, 1500));
  // The loop's first beat falls 0.1 s after the call, on the audio clock.
  startFrame = Math.round((ctx.currentTime + 0.1) * SAMPLE_RATE);
  audio.playMusic(track, true);
  // The scheduler looks 0.3 s ahead, so a song stopped 0.3 s before a boundary has every note up to it and none after.
  const stopAt = startFrame / SAMPLE_RATE + (stopAfter ?? Infinity);
  const stopper = setInterval(() => {
    if (ctx.currentTime < stopAt) return;
    clearInterval(stopper);
    audio.setMusic(false);
  }, 4);
  await new Promise((r) => setTimeout(r, (seconds + 2) * 1000));
  clearInterval(stopper);
  audio.setMusic(false);
  await new Promise((r) => setTimeout(r, 1500));
  return { startFrame };
};
