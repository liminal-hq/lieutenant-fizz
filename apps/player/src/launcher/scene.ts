// The scenery behind the menu: scrolling layers of the episode's art with Ben running, and the slide between stops.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { RunnerArt, SceneInfo } from './catalog';

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
}

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
): Scene {
  const el = div('scene');
  el.setAttribute('aria-hidden', 'true');
  el.style.setProperty('--scene-w', String(info.width));
  el.style.setProperty('--scene-h', String(info.height));
  el.style.setProperty('--ground', String(info.ground));
  el.style.setProperty('--sky-top', info.skyTop);
  let ground: HTMLElement | undefined;
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
    ben.append(div('run'), div('air'));
    ground.append(ben);
  }
  return {
    el,
    setSlide(slide) {
      el.style.setProperty('--slide', String(slide));
    },
    resize(viewportHeight, viewportWidth) {
      el.style.setProperty('--scene-scale', String(sceneScale(viewportHeight, info.height)));
      el.style.setProperty('--sw', String(viewportWidth));
    },
  };
}

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
      if (!old || dir === 0 || reducedMotion()) {
        scene.setSlide(0);
        old?.scene.el.remove();
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
