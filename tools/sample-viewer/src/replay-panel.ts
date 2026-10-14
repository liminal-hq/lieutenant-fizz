// The viewer's replay: the game's own replay screen on a canvas in the page, with layers for hot spots and comments.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { buildAtlas } from '@lieutenant-fizz/engine/atlas';
import { InstancedRenderer } from '@lieutenant-fizz/engine/renderer';
import { COLOURS, toScreen, toWorld, type WorldView } from '@lieutenant-fizz/engine/replay/overlay';
import type { Session } from '@lieutenant-fizz/engine/session/log';
import { frameView, type FrameView } from '@lieutenant-fizz/engine/view-scale';
import {
  canReplay,
  ReplayHost,
  type ExtraLayer,
} from '../../../episodes/episode-1/src/replay/game-host';
import { verdictsFor } from '../../../episodes/episode-1/src/replay/verdicts';
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

/** A comment's place on the level, drawn as a numbered pin while its attempt is showing. */
export interface Pin {
  x: number;
  y: number;
  label: string;
  /** The attempt it is on, by its place in the session. */
  attempt: number;
}

/** What the page wants to hear about the replay. */
export interface PanelHooks {
  opened(session: Session): void;
  closed(): void;
  /** A place was chosen by clicking the picture while pinning. */
  pinned(at: { x: number; y: number }): void;
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
  private watching: Session | null = null;
  private frameId = 0;
  /** Counts the requests to watch; one made before a later request or a cancel is dropped when it has loaded. */
  private requests = 0;
  private last = 0;
  private readonly view: FrameView = { halfW: 1, halfH: 1, scale: 0 };
  private worldView: WorldView | null = null;
  private pins: Pin[] = [];
  private pending: { x: number; y: number } | null = null;
  private pinning = false;

  constructor(
    private readonly section: HTMLElement,
    private readonly stage: HTMLElement,
    private readonly gl: HTMLElement,
    private readonly spots: () => readonly Spot[],
    private readonly hooks: PanelHooks,
  ) {
    // While pinning, a click on the picture (not on the bar) chooses a place.
    stage.addEventListener('click', (e) => {
      if (!this.pinning || !this.worldView) return;
      if ((e.target as HTMLElement).closest('button, input, select, textarea')) return;
      const box = this.gl.getBoundingClientRect();
      const at = toWorld(this.worldView, e.clientX - box.left, e.clientY - box.top);
      this.pending = at;
      this.pinning = false;
      this.stage.dataset.pinning = 'false';
      this.hooks.pinned(at);
    });
  }

  /** Whether the replay is up now. */
  get open(): boolean {
    return this.host !== null;
  }

  /** The sample being watched. */
  get session(): Session | null {
    return this.watching;
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

  /** The comments' pins, for the attempt each is on. */
  setPins(pins: Pin[]): void {
    this.pins = pins;
  }

  /** The place chosen for the next comment, or none. */
  setPending(at: { x: number; y: number } | null): void {
    this.pending = at;
  }

  /** Waits for a click on the picture to choose a place. */
  startPinning(): void {
    this.pinning = true;
    this.stage.dataset.pinning = 'true';
  }

  /** The comments layer: a numbered pin for each comment on the attempt showing, and the place being chosen. */
  private commentsLayer(): ExtraLayer {
    return {
      id: 'notes',
      label: 'Comments',
      on: true,
      draw: (ctx, view) => {
        this.worldView = view;
        const order = this.host?.attemptOrder;
        ctx.save();
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        for (const pin of this.pins) {
          if (pin.attempt !== order) continue;
          const p = toScreen(view, pin.x, pin.y);
          ctx.fillStyle = COLOURS.hit;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#000000';
          ctx.fillText(pin.label, p.x, p.y + 4);
        }
        if (this.pending) {
          const p = toScreen(view, this.pending.x, this.pending.y);
          ctx.strokeStyle = COLOURS.miss;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  }

  /** Shows a sample's replay, optionally at an attempt and a tick. False when nothing in it can be replayed. */
  async watch(session: Session, at: WatchAt = {}): Promise<boolean> {
    if (!canReplay(session)) return false;
    const mine = (this.requests += 1);
    const { sim, renderer } = await this.load();
    // Cleared or replaced while the sim loaded: nothing is shown, and there is nothing to report either.
    if (mine !== this.requests) {
      // The load shows the section so the renderer can measure it, and nothing is going to fill it.
      if (!this.host) this.section.hidden = true;
      return true;
    }
    this.close();
    this.section.hidden = false;
    this.watching = session;
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
      extraLayers: [hotSpots(this.spots), this.commentsLayer()],
    });
    if (at.order !== undefined) this.host.watch(at.order, at.tick);
    this.last = performance.now();
    this.frameId = requestAnimationFrame((t) => this.frame(t, renderer));
    this.section.scrollIntoView?.({ block: 'nearest' });
    this.hooks.opened(session);
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

  /** Where the replay is: the attempt (by its place in the session), the recorded tick and the level. */
  position(): { order: number; tick: number; level: number } | null {
    const h = this.host;
    return h ? { order: h.attemptOrder, tick: h.tick, level: h.levelId } : null;
  }

  /** Goes to an exact tick of an attempt and holds there. */
  goto(order: number, tick: number): void {
    this.host?.goto(order, tick);
  }

  /** Holds the replay where it is. */
  pause(): void {
    this.host?.pause();
  }

  /** Runs every attempt of a sample on a sim of its own and says whether each matches the recording. */
  async verdicts(session: Session): Promise<Map<number, string>> {
    // Not the one on show: running attempts resets the world they run in.
    return verdictsFor(await Sim.load(simUrl), session);
  }

  /** Takes the replay down. */
  /** Closes the replay and drops any request still loading, for when the samples it was asked about are gone. */
  cancel(): void {
    this.requests += 1;
    this.close();
  }

  close(): void {
    cancelAnimationFrame(this.frameId);
    const host = this.host;
    this.host = null;
    this.watching = null;
    this.pending = null;
    this.pinning = false;
    this.stage.dataset.pinning = 'false';
    this.section.hidden = true;
    if (host) {
      host.close();
      this.hooks.closed();
    }
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
