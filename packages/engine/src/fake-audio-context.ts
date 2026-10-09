// Test-only recording AudioContext: remembers every node it creates and every connect() edge.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { vi } from 'vitest';

/** A recorded AudioParam: remembers the value and every scheduled change. */
export class FakeParam {
  readonly calls: { method: string; args: number[] }[] = [];
  constructor(public value = 0) {}
  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.calls.push({ method: 'setValueAtTime', args: [value, time] });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.calls.push({ method: 'linearRampToValueAtTime', args: [value, time] });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.calls.push({ method: 'exponentialRampToValueAtTime', args: [value, time] });
    return this;
  }
  setTargetAtTime(value: number, time: number, timeConstant: number): this {
    this.calls.push({ method: 'setTargetAtTime', args: [value, time, timeConstant] });
    return this;
  }
}

/** A recorded node: `kind` is the factory that made it, and `out` lists what it connects to. */
export class FakeNode {
  readonly out: FakeNode[] = [];
  readonly gain = new FakeParam(1);
  readonly pan = new FakeParam(0);
  readonly frequency = new FakeParam(0);
  readonly delayTime = new FakeParam(0);
  readonly Q = new FakeParam(1);
  readonly playbackRate = new FakeParam(1);
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
  type = '';
  loop = false;
  buffer: unknown = null;
  channelCount = 2;
  started: number[] = [];
  stopped: number[] = [];
  constructor(readonly kind: string) {}
  connect(to: FakeNode): FakeNode {
    this.out.push(to);
    return to;
  }
  /** Disconnects every output of this node, as `disconnect()` with no argument does. */
  disconnect(): void {
    this.out.length = 0;
  }
  start(when = 0): void {
    this.started.push(when);
  }
  stop(when = 0): void {
    this.stopped.push(when);
  }
}

/** A recording stand-in for `AudioContext` that never makes a sound. */
export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 44100;
  readonly destination = new FakeNode('destination');
  /** Every node created, in order. */
  readonly nodes: FakeNode[] = [];
  resume = vi.fn(async (): Promise<void> => {
    this.state = 'running';
  });
  suspend = vi.fn(async (): Promise<void> => {
    this.state = 'suspended';
  });
  close = vi.fn(async (): Promise<void> => {});

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  private make(kind: string): FakeNode {
    const n = new FakeNode(kind);
    this.nodes.push(n);
    return n;
  }

  createOscillator = (): FakeNode => this.make('oscillator');
  createGain = (): FakeNode => this.make('gain');
  createBiquadFilter = (): FakeNode => this.make('biquad');
  createStereoPanner = (): FakeNode => this.make('panner');
  createChannelMerger = (): FakeNode => this.make('merger');
  createBufferSource = (): FakeNode => this.make('bufferSource');
  createConvolver = (): FakeNode => this.make('convolver');
  createDynamicsCompressor = (): FakeNode => this.make('compressor');
  createDelay = (): FakeNode => this.make('delay');
  createBuffer = (
    channels: number,
    length: number,
  ): { getChannelData(c: number): Float32Array } => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (c) => data[c]! };
  };
  decodeAudioData = async (): Promise<never> => {
    throw new Error('not used');
  };

  /** Nodes of one kind. */
  all(kind: string): FakeNode[] {
    return this.nodes.filter((n) => n.kind === kind);
  }

  /** The number of nodes made by any factory other than the voice building blocks Classic uses. */
  extras(): FakeNode[] {
    const classic = new Set(['oscillator', 'gain', 'biquad', 'bufferSource', 'delay']);
    return this.nodes.filter((n) => !classic.has(n.kind));
  }
}
