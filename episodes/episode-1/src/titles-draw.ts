// Paints the opening titles on a canvas, from the timeline in `titles.ts`.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  ACCENT,
  BEN_FROM,
  BEN_H,
  BEN_PX,
  BEN_W,
  CUES,
  GROUND,
  GROUND_COLOURS,
  MUTED,
  ROSE,
  TITLES_H,
  TITLES_W,
  benPose,
  enemies,
  fade,
  fizz,
  flash,
  groundLift,
  groundSpecks,
  presents,
  speedLineAlpha,
  speedLines,
  stars,
  type View,
  wordRows,
  wordmark,
} from './titles';
import type { TitleSprite } from './titles-sprites';

/** What the titles need besides the clock: the sprites, and the Liminal HQ mark once it has loaded. */
export interface TitlesAssets {
  sprites: ReadonlyMap<string, TitleSprite>;
  mark: CanvasImageSource | null;
}

/** The pixel font the game's own text uses. */
const PIXEL = 'Fizz';
/** The name on the "presents" card is set in Space Grotesk where it is installed, and in the pixel font where it is not. */
const NAME = `'Space Grotesk', ${PIXEL}, sans-serif`;

type Ctx = CanvasRenderingContext2D;

/** Gives the canvas the plain, hard-edged type the pixel font needs. */
function plainText(g: Ctx): void {
  g.textBaseline = 'top';
  g.textAlign = 'left';
  if ('fontKerning' in g) g.fontKerning = 'none';
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

/** Draws `text` with its top-left at (x, y), after the stack of offset copies behind it that a CSS `text-shadow` makes. */
function shadowed(
  g: Ctx,
  text: string,
  x: number,
  y: number,
  colour: string,
  shadows: readonly (readonly [number, string])[],
): void {
  for (const [dy, c] of shadows) {
    g.fillStyle = c;
    g.fillText(text, x, y + dy);
  }
  g.fillStyle = colour;
  g.fillText(text, x, y);
}

function backdrop(g: Ctx, view: View): void {
  // An ellipse centred 40% down, from #12101c to #050507 by 70% of the way to the far corner.
  g.save();
  g.translate(view.w / 2, view.h * 0.4);
  g.scale((view.w / 2) * Math.SQRT2, view.h * 0.6 * Math.SQRT2);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, '#12101c');
  grad.addColorStop(0.7, '#050507');
  g.fillStyle = grad;
  g.fillRect(-2, -2, 4, 4);
  g.restore();
}

function drawStars(g: Ctx, T: number, view: View): void {
  for (const s of stars(T, view)) {
    g.globalAlpha = s.alpha;
    g.fillStyle = s.colour;
    g.fillRect(s.x, s.y, s.size, s.size);
  }
  g.globalAlpha = 1;
}

function drawRows(g: Ctx, T: number): void {
  g.font = `700 264px ${PIXEL}`;
  for (const r of wordRows(T)) {
    if (r.alpha <= 0) continue;
    g.globalAlpha = r.alpha;
    g.fillStyle = r.colour;
    g.fillText(r.text, r.x, r.y);
  }
  g.globalAlpha = 1;
}

/** Drawn in the view's own space, so the lines run the whole width of the screen; `down` is where the picture's top is. */
function drawSpeedLines(g: Ctx, T: number, view: View, down: number): void {
  const alpha = speedLineAlpha(T);
  if (alpha <= 0) return;
  g.globalAlpha = alpha;
  g.fillStyle = '#55ffff';
  for (const l of speedLines(T, view)) g.fillRect(l.x, l.y + down, l.length, 6);
  g.globalAlpha = 1;
}

/** The ground, from the left edge of the view (`left`, at or below 0) to its right edge and on down past the bottom. */
function drawGround(g: Ctx, T: number, left: number, right: number): void {
  const top = GROUND + groundLift(T);
  const c = GROUND_COLOURS;
  g.fillStyle = c.field;
  g.fillRect(left, top, right - left, 2000);
  for (const sp of groundSpecks(T, right - left)) {
    g.fillStyle = c.speck[sp.shade];
    g.fillRect(left + sp.x, top + sp.y, 11, 5);
  }
  g.fillStyle = c.edge;
  g.fillRect(left, top, right - left, 11);
  g.fillStyle = c.shade;
  g.fillRect(left, top + 11, right - left, 5);
}

function drawChase(g: Ctx, T: number, assets: TitlesAssets, left: number): void {
  // The hopper is knocked back along the ground, behind the gloop that rears up to take the next bubble, so it is drawn first.
  const zargs = enemies(T).sort(
    (a, b) => Number(b.sprite.startsWith('hopper')) - Number(a.sprite.startsWith('hopper')),
  );
  for (const e of zargs) {
    const s = assets.sprites.get(e.sprite);
    const w = e.w * e.px;
    const h = e.h * e.px;
    // Before the chase they wait off the left edge.
    if (!s || e.x + w <= left) continue;
    const top = e.bottom - h;
    g.drawImage(e.flash ? s.white : s.image, e.x, top, w, h);
    if (e.stunned) {
      // The stars turn over a stunned Zarg, as they do in the game.
      const stars = assets.sprites.get(`stars${e.stars}`);
      if (stars) {
        const sw = stars.w * e.px;
        g.drawImage(
          stars.image,
          e.x + w / 2 - sw / 2,
          top - stars.h * e.px * 0.9,
          sw,
          stars.h * e.px,
        );
      }
    }
  }
  // The game's own fizz bubble, flying at the Zargs, and the puff where it hits.
  for (const f of fizz(T)) {
    const s = assets.sprites.get(f.kind === 'bubble' ? 'bubble' : 'puff');
    if (!s) continue;
    const w = s.w * f.scale;
    const h = s.h * f.scale;
    g.globalAlpha = f.alpha;
    g.drawImage(s.image, f.x - w / 2, f.y - h / 2, w, h);
  }
  g.globalAlpha = 1;
  if (T <= BEN_FROM) return;
  const ben = assets.sprites.get('ben_shoot');
  const p = benPose(T);
  const bw = BEN_W * BEN_PX;
  const bh = BEN_H * BEN_PX;
  if (ben) {
    // Ben is turned about his feet, squashed with each stride, and faces left to fire behind him.
    g.save();
    g.translate(p.x + bw / 2, p.y + bh);
    g.rotate((p.tilt * Math.PI) / 180);
    g.scale(1 / p.squash, p.squash);
    g.scale(-1, 1);
    g.imageSmoothingEnabled = false;
    g.drawImage(ben.silhouette, -bw / 2 + 8, -bh + 8, bw, bh);
    g.drawImage(ben.image, -bw / 2, -bh, bw, bh);
    g.restore();
  }
  const width = bw * 0.8 * (1 - p.run * 0.3);
  g.fillStyle = 'rgba(0, 0, 0, 0.5)';
  g.beginPath();
  g.ellipse(p.x + bw * 0.1 + width / 2, GROUND - 6 + 7, width / 2, 7, 0, 0, Math.PI * 2);
  g.fill();
}

function drawPresents(g: Ctx, T: number, assets: TitlesAssets): void {
  const p = presents(T);
  const rowTop = (TITLES_H - (280 + 48 + 66)) / 2;
  g.font = `600 168px ${NAME}`;
  const nameW = g.measureText('Liminal HQ').width;
  const left = (TITLES_W - (280 + 56 + nameW)) / 2;

  if (assets.mark) {
    g.save();
    g.translate(left + 140 + p.markX, rowTop + 140);
    g.rotate((p.markTilt * Math.PI) / 180);
    g.shadowColor = 'rgba(241, 155, 24, 0.45)';
    g.shadowBlur = 30 + p.glow * 30;
    g.drawImage(assets.mark, -140, -140, 280, 280);
    g.restore();
  }
  if (p.nameAlpha > 0) {
    g.globalAlpha = p.nameAlpha;
    g.fillStyle = '#F7E2BA';
    g.textBaseline = 'middle';
    g.fillText('Liminal HQ', left + 336 + p.nameX, rowTop + 140);
    g.textBaseline = 'top';
    g.globalAlpha = 1;
  }
  if (p.presentsAlpha > 0) {
    g.globalAlpha = p.presentsAlpha;
    g.font = `66px ${PIXEL}`;
    g.textAlign = 'center';
    shadowed(g, 'presents', TITLES_W / 2, rowTop + 280 + 48 + p.presentsY, ACCENT, [
      [6, '#000000'],
    ]);
    g.textAlign = 'left';
    g.globalAlpha = 1;
  }
}

function drawWordmark(g: Ctx, T: number): void {
  if (T <= CUES.words) return;
  const w = wordmark(T);
  g.save();
  // The card is 340 tall, from 360 down; it scales and lifts about its middle.
  g.translate(TITLES_W / 2, 360 + 170 + w.lift);
  g.scale(w.scale, w.scale);
  g.translate(-TITLES_W / 2, -170);

  if (w.kickerAlpha > 0) {
    g.globalAlpha = w.kickerAlpha;
    g.font = `44px ${PIXEL}`;
    g.textAlign = 'center';
    shadowed(g, 'Ben Blaze in', TITLES_W / 2 + w.kickerX, 0, ACCENT, [[4, '#000000']]);
    g.textAlign = 'left';
    g.globalAlpha = 1;
  }

  g.font = `700 176px ${PIXEL}`;
  const lieutenantW = g.measureText('Lieutenant').width;
  const fizzW = g.measureText('Fizz').width;
  const startX = (TITLES_W - (lieutenantW + 64 + fizzW)) / 2;
  const shadows = [
    [32, '#000000'],
    [16, ROSE],
  ] as const;
  const word = (text: string, x: number, width: number, shift: number, skew: number): void => {
    g.save();
    g.translate(x + width / 2 + shift, 66 + 88);
    g.transform(1, 0, Math.tan((skew * Math.PI) / 180), 1, 0, 0);
    shadowed(g, text, -width / 2, -88, '#ffffff', shadows);
    g.restore();
  };
  word('Lieutenant', startX, lieutenantW, w.lieutenantX, w.lieutenantSkew);
  word('Fizz', startX + lieutenantW + 64, fizzW, w.fizzX, w.fizzSkew);

  if (w.lineAlpha > 0) {
    g.globalAlpha = w.lineAlpha;
    g.font = `44px ${PIXEL}`;
    g.textAlign = 'center';
    shadowed(g, 'Episode 1 · The Cocoa Caper', TITLES_W / 2, 296 + w.lineY, MUTED, [
      [4, '#000000'],
    ]);
    g.textAlign = 'left';
    g.globalAlpha = 1;
  }
  g.restore();
}

/**
 * Paints the titles as they are at `T` seconds on a canvas of `width` by `height` pixels. The picture is laid out in
 * 1920 by 1080 and scaled to fit; a screen of another shape gets more of the backdrop (stars, word rows, ground,
 * speed lines) rather than bars, so the titles fill it as the title menu does. The caller waits for the pixel font to
 * load first. `calm` leaves out the white flash and the speed lines, for a player who has asked for less motion.
 */
export function drawTitles(
  g: Ctx,
  T: number,
  assets: TitlesAssets,
  options: { calm?: boolean; width?: number; height?: number } = {},
): void {
  const width = options.width ?? TITLES_W;
  const height = options.height ?? TITLES_H;
  const k = Math.min(width / TITLES_W, height / TITLES_H);
  const view: View = { w: width / k, h: height / k };
  const ox = (view.w - TITLES_W) / 2;
  const oy = (view.h - TITLES_H) / 2;
  g.save();
  g.setTransform(k, 0, 0, k, 0, 0);
  g.imageSmoothingEnabled = false;
  plainText(g);
  g.globalAlpha = 1;
  backdrop(g, view);
  drawStars(g, T, view);
  if (!options.calm) drawSpeedLines(g, T, view, oy);
  g.save();
  g.translate(ox, oy);
  drawRows(g, T);
  drawGround(g, T, -ox, view.w - ox);
  drawChase(g, T, assets, -ox);
  drawPresents(g, T, assets);
  drawWordmark(g, T);
  g.restore();
  const f = options.calm ? 0 : flash(T);
  if (f > 0) {
    g.globalAlpha = f;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, view.w, view.h);
  }
  const black = fade(T);
  if (black > 0) {
    g.globalAlpha = black;
    g.fillStyle = '#000000';
    g.fillRect(0, 0, view.w, view.h);
  }
  g.restore();
}
