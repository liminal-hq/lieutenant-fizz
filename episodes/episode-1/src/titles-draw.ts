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
  MUTED,
  ROSE,
  TITLES_H,
  TITLES_W,
  benPose,
  bubbles,
  enemies,
  fade,
  flash,
  groundLift,
  groundScroll,
  presents,
  speedLineAlpha,
  speedLines,
  stars,
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

function backdrop(g: Ctx): void {
  // An ellipse centred 40% down, from #12101c to #050507 by 70% of the way to the far corner.
  g.save();
  g.translate(TITLES_W / 2, TITLES_H * 0.4);
  g.scale((TITLES_W / 2) * Math.SQRT2, TITLES_H * 0.6 * Math.SQRT2);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, '#12101c');
  grad.addColorStop(0.7, '#050507');
  g.fillStyle = grad;
  g.fillRect(-2, -2, 4, 4);
  g.restore();
}

function drawStars(g: Ctx, T: number): void {
  for (const s of stars(T)) {
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

function drawSpeedLines(g: Ctx, T: number): void {
  const alpha = speedLineAlpha(T);
  if (alpha <= 0) return;
  g.globalAlpha = alpha;
  g.fillStyle = '#55ffff';
  for (const l of speedLines(T)) g.fillRect(l.x, l.y, l.length, 6);
  g.globalAlpha = 1;
}

function drawGround(g: Ctx, T: number): void {
  const top = GROUND + groundLift(T);
  g.fillStyle = ACCENT;
  g.fillRect(0, top, TITLES_W, 12);
  g.fillStyle = '#aa5500';
  g.fillRect(0, top + 12, TITLES_W, TITLES_H - top);
  g.fillStyle = '#552a00';
  const scroll = groundScroll(T);
  for (let i = 0; i < 22; i++) g.fillRect(scroll + i * 96, top + 36 + (i % 2) * 36, 48, 12);
}

/** Draws a sprite with its bottom-left at (x, bottom), `px` screen pixels to a sprite pixel. */
function drawSprite(
  g: Ctx,
  s: TitleSprite,
  x: number,
  bottom: number,
  px: number,
  lit: boolean,
): void {
  const w = s.w * px;
  const h = s.h * px;
  g.drawImage(s.image, x, bottom - h, w, h);
  if (lit) {
    // A stunned Zarg flashes: the same picture drawn again on top, adding its light.
    g.globalCompositeOperation = 'lighter';
    g.drawImage(s.image, x, bottom - h, w, h);
    g.globalCompositeOperation = 'source-over';
  }
}

function drawChase(g: Ctx, T: number, assets: TitlesAssets): void {
  const shots = bubbles(T);
  for (const e of enemies(T, shots.length > 0)) {
    const s = assets.sprites.get(e.sprite);
    // Before the chase they wait off the left edge.
    if (s && e.x + s.w * e.px > 0) drawSprite(g, s, e.x, e.bottom, e.px, e.zap);
  }
  for (const b of shots) {
    g.globalAlpha = b.alpha;
    g.beginPath();
    g.arc(b.x, b.y, Math.max(0, b.radius - 3), 0, Math.PI * 2);
    g.fillStyle = 'rgba(85, 255, 255, 0.35)';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#ffffff';
    g.stroke();
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
 * Paints the titles as they are at `T` seconds, in a 1920 by 1080 space. The caller sizes the canvas and sets the
 * transform that fits that space to it, and waits for the pixel font to load first.
 */
export function drawTitles(g: Ctx, T: number, assets: TitlesAssets): void {
  g.save();
  g.imageSmoothingEnabled = false;
  plainText(g);
  g.globalAlpha = 1;
  backdrop(g);
  drawStars(g, T);
  drawRows(g, T);
  drawSpeedLines(g, T);
  drawGround(g, T);
  drawChase(g, T, assets);
  drawPresents(g, T, assets);
  drawWordmark(g, T);
  const f = flash(T);
  if (f > 0) {
    g.globalAlpha = f;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, TITLES_W, TITLES_H);
  }
  const black = fade(T);
  if (black > 0) {
    g.globalAlpha = black;
    g.fillStyle = '#000000';
    g.fillRect(0, 0, TITLES_W, TITLES_H);
  }
  g.restore();
}
