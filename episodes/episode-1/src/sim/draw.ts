// Draws a sim's frame: asks the sim to fill its instance buffer, reads what it says about the view, and renders it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { InstancedRenderer } from '@lieutenant-fizz/engine/renderer';
import { Out, RenderFlag } from './protocol';
import type { Sim } from './sim';

/** What a frame is rendered with, besides the sim's own state. */
export interface RenderOptions {
  night: boolean;
  culling: boolean;
  stress: boolean;
  /** Whether lighting may be used when the sim asks for it. */
  lighting: boolean;
}

/** What the sim says about the frame it just filled. */
export interface SimFrame {
  count: number;
  camX: number;
  camY: number;
  clear: [number, number, number, number];
  ambient: [number, number, number];
  lighting: boolean;
  lightCount: number;
  sky: boolean;
}

/** How the frame is put on the canvas. */
export interface ViewOptions {
  halfW: number;
  halfH: number;
  normals: boolean;
  poster: boolean;
}

/** Renders the sim at `alpha` between its last two ticks into its instance buffer, and reads the frame's facts. */
export function renderSim(sim: Sim, alpha: number, opts: RenderOptions): SimFrame {
  let flags = 0;
  if (opts.night) flags |= RenderFlag.NIGHT;
  if (opts.culling) flags |= RenderFlag.CULLING;
  if (opts.stress) flags |= RenderFlag.STRESS;
  sim.render(alpha, flags);
  const o = sim.out;
  return {
    count: o[Out.COUNT] ?? 0,
    camX: o[Out.CAM_X] ?? 0,
    camY: o[Out.CAM_Y] ?? 0,
    clear: [o[Out.CLEAR_R] ?? 0, o[Out.CLEAR_G] ?? 0, o[Out.CLEAR_B] ?? 0, o[Out.CLEAR_A] ?? 1],
    ambient: [o[Out.AMB_R] ?? 1, o[Out.AMB_G] ?? 1, o[Out.AMB_B] ?? 1],
    lighting: (o[Out.LIGHTING] ?? 0) > 0.5 && opts.lighting,
    lightCount: o[Out.LIGHTS] ?? 0,
    sky: (o[Out.SKY_GLOW] ?? 0) > 0.5,
  };
}

/** Puts a frame on the renderer's canvas. `buffer` is the instance buffer the frame's `count` instances are in. */
export function drawSimFrame(
  renderer: InstancedRenderer,
  sim: Sim,
  buffer: Float32Array,
  frame: SimFrame,
  view: ViewOptions,
): { instances: number; calls: number } {
  const info = renderer.render({
    instances: buffer,
    count: frame.count,
    camX: frame.camX,
    camY: frame.camY,
    halfW: view.halfW,
    halfH: view.halfH,
    clear: frame.clear,
    ambient: frame.ambient,
    lighting: frame.lighting,
    normals: view.normals,
    poster: view.poster,
    lightCount: frame.lightCount,
    lightPos: sim.lightPos,
    lightCol: sim.lightCol,
  });
  return { instances: info.instances, calls: info.calls };
}
