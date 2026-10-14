// The viewer's replay: the game's own replay screen on a canvas in the page, with a layer for the loaded samples' hot spots.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { buildAtlas } from '@lieutenant-fizz/engine/atlas';
import { InstancedRenderer } from '@lieutenant-fizz/engine/renderer';
import { COLOURS, toScreen } from '@lieutenant-fizz/engine/replay/overlay';
import type { Session } from '@lieutenant-fizz/engine/session/log';
import { frameView, type FrameView } from '@lieutenant-fizz/engine/view-scale';
import {
  canReplay,
  ReplayHost,
  type ExtraLayer,
} from '../../../episodes/episode-1/src/replay/game-host';
import '../../../episodes/episode-1/src/ui/replay.css';
import { Sim } from '../../../episodes/episode-1/src/sim/sim';
import { defineSprites } from '../../../episodes/episode-1/src/sprites/catalog';
import simUrl from '../../../episodes/episode-1/src/wasm/sim.wasm?url';
import type { Spot } from './aggregate';

/** How many tiles tall the view of a level is, as in the game. */
const TALL = 13;

/** Where to start: an attempt by its place in the session and, optionally, a recorded tick to go to a moment before. */
export interface WatchAt {
  order?: number;
  tick?: number;
}

/** The loaded samples' deaths, as rings that grow with how many were lost at a tile of the level showing. */
function hotSpots(spots: () => readonly Spot[]): ExtraLayer {
  return {
    id: 'hot',
    label: 'Hot spots',
    on: false,
    draw(ctx, view, { attempt }) {
      const list = spots().filter((s) => s.levelId === attempt.id);
      const most = Math.max(1, ...list.map((s) => s.count));
      ctx.save();
      ctx.font = '12px sans-serif';
      for (const s of list) {
        const p = toScreen(view, s.x + 0.5, s.y + 0.5);
        const r = view.ppu * (0.5 + (0.9 * s.count) / most);
        ctx.globalAlpha = 0.18 + (0.4 * s.count) / most;
        ctx.fillStyle = COLOURS.death;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(s.count), p.x - 3, p.y + 4);
      }
      ctx.restore();
    },
  };
}

/**
 * The replay in the page. It loads the sim, the sprites and the renderer the first time something is watched and
 * keeps them, and gives each sample its own replay host. Nothing leaves the page.
 */
export class ReplayPanel {
  private ready: Promise<{ sim: Sim; renderer: InstancedRenderer }> | null = null;
  private host: ReplayHost | null = null;
  private frameId = 0;
  private last = 0;
  private readonly view: FrameView = { halfW: 1, halfH: 1, scale: 0 };

  constructor(
    private readonly section: HTMLElement,
    private readonly stage: HTMLElement,
    private readonly gl: HTMLElement,
    private readonly spots: () => readonly Spot[],
  ) {}

  /** Whether the replay is up now. */
  get open(): boolean {
    return this.host !== null;
  }

  private load(): Promise<{ sim: Sim; renderer: InstancedRenderer }> {
    this.ready ??= (async () => {
      const sim = await Sim.load(simUrl);
      const atlas = buildAtlas(defineSprites());
      sim.setSprites(atlas.rects);
      this.section.hidden = false;
      return { sim, renderer: new InstancedRenderer(this.gl, atlas, 'soft') };
    })();
    return this.ready;
  }

  /** Shows a sample's replay, optionally at an attempt and a tick. False when nothing in it can be replayed. */
  async watch(session: Session, at: WatchAt = {}): Promise<boolean> {
    if (!canReplay(session)) return false;
    const { sim, renderer } = await this.load();
    this.close();
    this.section.hidden = false;
    this.host = new ReplayHost({
      sim,
      session,
      renderer,
      gl: this.gl,
      mount: (node) => this.stage.append(node),
      drawOptions: () => ({
        night: false,
        culling: true,
        stress: false,
        lighting: true,
        normals: false,
        poster: false,
      }),
      // The viewer is quiet: it has no sound of its own.
      playCaption: () => {},
      captionText: () => '',
      onClose: () => this.close(),
      extraLayers: [hotSpots(this.spots)],
    });
    if (at.order !== undefined) this.host.watch(at.order, at.tick);
    this.last = performance.now();
    this.frameId = requestAnimationFrame((t) => this.frame(t, renderer));
    this.section.scrollIntoView?.({ block: 'nearest' });
    return true;
  }

  private frame(t: number, renderer: InstancedRenderer): void {
    const host = this.host;
    if (!host) return;
    const dt = Math.max(0, (t - this.last) / 1000);
    this.last = t;
    renderer.setTarget(TALL);
    frameView(this.view, {
      cssW: renderer.canvasCssW,
      cssH: renderer.canvasCssH,
      devW: renderer.canvasWidth,
      devH: renderer.canvasHeight,
      target: TALL,
      zoom: 1,
      sharp: false,
    });
    host.frame(dt, 0, this.view);
    this.frameId = requestAnimationFrame((next) => this.frame(next, renderer));
  }

  /** Takes the replay down. */
  close(): void {
    cancelAnimationFrame(this.frameId);
    const host = this.host;
    this.host = null;
    this.section.hidden = true;
    host?.close();
  }

  /** The replay's own state, for a test: where it is, whether it plays, which layers are on. */
  state(): { tick: number; playing: boolean; layers: string[]; drift: string | null } | null {
    const h = this.host;
    if (!h) return null;
    return {
      tick: h.tick,
      playing: h.playing,
      layers: h.layersOn(),
      drift: h.drift ? `${h.drift.kind}@${h.drift.tick}` : null,
    };
  }
}
