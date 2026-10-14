// The scenery behind the menu: scrolling layers of the episode's art with Ben running, and the slide between stops.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { RunnerArt, SceneInfo } from './catalog';
import {
  cuesBetween,
  demoState,
  periodFor,
  type ActorState,
  type Course,
  type DemoCue,
  type DemoItem,
  type DemoState,
} from './demo';

/** How much of the window's height the scene's art may take. */
export const SCENE_SHARE = 0.55;

/** The most the scene is scaled up. */
export const MAX_SCENE_SCALE = 5;

/**
 * How many CSS pixels each pixel of the art covers: a whole number, so the pixel art stays crisp, as large as fits in
 * its share of the window's height and never under 1.
 */
export function sceneScale(viewportHeight: number, artHeight: number): number {
  if (artHeight <= 0) return 1;
  return Math.max(
    1,
    Math.min(MAX_SCENE_SCALE, Math.floor((viewportHeight * SCENE_SHARE) / artHeight)),
  );
}

/** How long the slide from one scene to the next takes, in milliseconds. */
export const SLIDE_MS = 480;

/** How far along the slide is at `progress` (0 to 1): fast at first, then settling. */
export const slideEase = (progress: number): number =>
  1 - (1 - Math.min(1, Math.max(0, progress))) ** 3;

/**
 * How far a layer shifts while a scene slides: a far layer (slow) moves less than a near one, so the scene has depth.
 * A layer that stands still still moves a little, or the sky would be a flat wall.
 */
export const parallax = (speed: number): number => 0.4 + 0.6 * Math.min(1, Math.max(0, speed));

/** Seconds a layer takes to scroll one picture's width: the ground's pace divided by the layer's speed. */
export const GROUND_SECONDS = 26;

/** A layer at this speed scrolls so slowly it is as good as still; it has no animation. */
export const scrollSeconds = (speed: number): number | undefined =>
  speed > 0 ? GROUND_SECONDS / speed : undefined;

/** Where the ground is: Ben stands on it. */
export interface Scene {
  readonly el: HTMLElement;
  /** Sets how far the scene has slid, from -1 (gone to the left) to 1 (waiting on the right); 0 is in place. */
  setSlide(slide: number): void;
  /** Sizes the art for a window of this height and width. */
  resize(viewportHeight: number, viewportWidth: number): void;
  /** Starts or stops what moves of its own accord (Ben and what he meets); a stopped scene keeps its last picture. */
  run(on: boolean): void;
}

/** What a scene needs of the page around it. */
export interface SceneHooks {
  /** Whether motion is reduced: what Ben meets then stands in place and he stands still. */
  reducedMotion(): boolean;
  /** Something happened in the scenery, for a sound and a buzz. */
  cue(cue: DemoCue): void;
}

const NO_HOOKS: SceneHooks = { reducedMotion: () => false, cue: () => {} };

/** Ben's left edge, as a share of the window's width. */
const BEN_LEFT = 0.24;

const div = (className: string): HTMLDivElement => {
  const node = document.createElement('div');
  node.className = className;
  return node;
};

/** One stop's scenery. The pictures are found relative to `base`; Ben runs on it when it says so and there is a runner. */
export function createScene(
  info: SceneInfo,
  base: URL,
  runner?: { art: RunnerArt; base: URL },
  hooks: SceneHooks = NO_HOOKS,
): Scene {
  const el = div('scene');
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--scene-w', String(info.width));
  el.style.setProperty('--scene-h', String(info.height));
  el.style.setProperty('--ground', String(info.ground));
  el.style.setProperty('--sky-top', info.skyTop);
  let ground: HTMLElement | undefined;
  let actors: Actors | undefined;
  for (const layer of info.layers) {
    const node = div(layer.field ? 'layer field' : 'layer');
    node.style.setProperty('--image', `url("${new URL(layer.src, base).href}")`);
    node.style.setProperty('--k', String(parallax(layer.speed)));
    const seconds = scrollSeconds(layer.speed);
    if (seconds !== undefined) node.style.setProperty('--scroll', `${Math.round(seconds)}s`);
    el.append(node);
    ground = node;
  }
  if (info.ben && runner && ground) {
    el.style.setProperty('--ben-w', String(runner.art.width));
    el.style.setProperty('--ben-h', String(runner.art.height));
    el.style.setProperty('--ben-frames', String(runner.art.frames));
    el.style.setProperty('--ben-image', `url("${new URL(runner.art.src, runner.base).href}")`);
    const ben = div('ben');
    ben.dataset['pose'] = 'run';
    ben.append(div('run'), div('air'), div('shoot'));
    ground.append(ben);
    if (info.demo) {
      el.style.setProperty('--actor-w', String(info.demo.sheet.cell));
      el.style.setProperty('--actor-cells', String(info.demo.sheet.cells));
      el.style.setProperty('--actors-image', `url("${new URL(info.demo.sheet.src, base).href}")`);
      actors = createActors(ground, ben, info.width, info.height, info.demo.items, hooks);
    }
  }
  return {
    el,
    setSlide(slide) {
      el.style.setProperty('--slide', String(slide));
    },
    resize(viewportHeight, viewportWidth) {
      el.style.setProperty('--scene-scale', String(sceneScale(viewportHeight, info.height)));
      el.style.setProperty('--sw', String(viewportWidth));
      actors?.resize(viewportHeight, viewportWidth);
    },
    run(on) {
      actors?.run(on);
    },
  };
}

/** The treats and gloops over the ground, and Ben's hops and poses: drawn from `demoState` by transform alone. */
interface Actors {
  resize(viewportHeight: number, viewportWidth: number): void;
  run(on: boolean): void;
}

/** The longest a frame may count for, so a pause or a slow frame does not skip over what Ben was doing. */
const MAX_STEP_S = 0.1;

function createActors(
  ground: HTMLElement,
  ben: HTMLElement,
  artWidth: number,
  artHeight: number,
  items: readonly DemoItem[],
  hooks: SceneHooks,
): Actors {
  const layer = div('actors');
  ground.insertBefore(layer, ben);
  const nodes = new Map<string, { el: HTMLElement; shown: string }>();
  let scale = 1;
  let course: Course = { items, speed: artWidth / GROUND_SECONDS, period: artWidth, benX: 0 };
  let clock = 0;
  let last: number | undefined;
  let frame = 0;
  let wanted = false;
  let benShown = '';

  const draw = (state: DemoState): void => {
    const seen = new Set<string>();
    for (const a of state.actors) {
      seen.add(a.id);
      let node = nodes.get(a.id);
      if (!node) {
        const el = div('actor');
        layer.append(el);
        node = { el, shown: '' };
        nodes.set(a.id, node);
      }
      const key = actorKey(a, scale);
      if (key !== node.shown) {
        node.shown = key;
        node.el.hidden = false;
        node.el.style.backgroundPositionX = `calc(var(--actor-w) * ${-a.cell} * var(--scene-scale) * 1px)`;
        node.el.style.transform = `translate(${a.x * scale}px, ${-a.y * scale}px) scale(${a.scale})`;
        node.el.style.opacity = String(a.opacity);
      }
    }
    for (const [id, node] of nodes) {
      if (!seen.has(id) && node.shown !== '') {
        node.shown = '';
        node.el.hidden = true;
      }
    }
    const lift = Math.round(state.ben.lift * scale);
    const benKey = `${state.ben.pose}@${lift}`;
    if (benKey !== benShown) {
      benShown = benKey;
      ben.dataset['pose'] = state.ben.pose;
      ben.style.transform = lift ? `translateY(${-lift}px)` : '';
    }
  };

  const tick = (now: number): void => {
    frame = 0;
    if (!wanted) return;
    const step = last === undefined ? 0 : Math.min(MAX_STEP_S, (now - last) / 1000);
    last = now;
    const before = clock;
    clock += step;
    for (const cue of cuesBetween(before, clock, course)) hooks.cue(cue);
    draw(demoState(clock, course));
    frame = requestAnimationFrame(tick);
  };

  const refresh = (): void => {
    if (hooks.reducedMotion()) draw(demoState(0, course, true));
    else if (!frame) draw(demoState(clock, course));
  };

  const start = (): void => {
    cancelAnimationFrame(frame);
    frame = 0;
    last = undefined;
    if (!wanted) return;
    if (hooks.reducedMotion() || document.hidden) {
      refresh();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange', start);

  return {
    resize(viewportHeight, viewportWidth) {
      scale = sceneScale(viewportHeight, artHeight);
      const wide = viewportWidth / scale;
      course = {
        items,
        speed: artWidth / GROUND_SECONDS,
        period: periodFor(wide, artWidth),
        benX: BEN_LEFT * wide,
      };
      refresh();
    },
    run(on) {
      wanted = on;
      start();
    },
  };
}

/** What changes how an actor looks, so a frame that left it as it was writes nothing. */
const actorKey = (a: ActorState, scale: number): string =>
  `${a.cell}|${Math.round(a.x * scale)}|${Math.round(a.y * scale)}|${a.scale.toFixed(2)}|${a.opacity.toFixed(2)}|${scale}`;

export interface Stage {
  /**
   * Shows the scene of a stop. `dir` is which way the carousel stepped (1 for the next stop, -1 for the previous) and
   * slides the old scene out and the new one in; 0 puts it in place at once. `make` is only called the first time.
   */
  show(key: string, make: () => Scene, dir: -1 | 0 | 1): void;
  resize(viewportHeight: number, viewportWidth: number): void;
}

/** Holds the scenes behind the page and slides between them. */
export function createStage(
  parent: HTMLElement,
  reducedMotion: () => boolean = () => false,
): Stage {
  const stage = div('scenes');
  stage.setAttribute('aria-hidden', 'true');
  parent.prepend(stage);
  const made = new Map<string, Scene>();
  let current: { key: string; scene: Scene } | undefined;
  let size: [number, number] = [innerHeight, innerWidth];
  let finish: (() => void) | undefined;

  return {
    show(key, make, dir) {
      if (current?.key === key) return;
      // A slide still going is finished first, so two never overlap.
      finish?.();
      let scene = made.get(key);
      if (!scene) {
        scene = make();
        scene.resize(...size);
        made.set(key, scene);
      }
      const old = current;
      current = { key, scene };
      stage.append(scene.el);
      scene.run(true);
      if (!old || dir === 0 || reducedMotion()) {
        scene.setSlide(0);
        old?.scene.el.remove();
        old?.scene.run(false);
        return;
      }
      const incoming = scene;
      const outgoing = old.scene;
      const start = performance.now();
      let frame = 0;
      const done = (): void => {
        cancelAnimationFrame(frame);
        incoming.setSlide(0);
        outgoing.el.remove();
        outgoing.run(false);
        finish = undefined;
      };
      finish = done;
      const tick = (now: number): void => {
        const e = slideEase((now - start) / SLIDE_MS);
        incoming.setSlide(dir * (1 - e));
        outgoing.setSlide(-dir * e);
        if (now - start >= SLIDE_MS) done();
        else frame = requestAnimationFrame(tick);
      };
      incoming.setSlide(dir);
      frame = requestAnimationFrame(tick);
    },
    resize(viewportHeight, viewportWidth) {
      size = [viewportHeight, viewportWidth];
      for (const scene of made.values()) scene.resize(viewportHeight, viewportWidth);
    },
  };
}
