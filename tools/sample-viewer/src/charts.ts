// Draws the paths of many attempts through one level, with where they died and where they stayed.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { dwells, type Attempt, type Outcome } from './attempts';

const COLOURS: Record<Outcome, string> = {
  clear: '74, 222, 128',
  died: '244, 63, 94',
  left: '154, 150, 176',
  open: '154, 150, 176',
};

/** The tiles the paths and deaths cover, with a little room round them. */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function boundsOf(attempts: readonly Attempt[]): Bounds | null {
  let b: Bounds | null = null;
  const add = (x: number, y: number): void => {
    b = b
      ? {
          minX: Math.min(b.minX, x),
          maxX: Math.max(b.maxX, x),
          minY: Math.min(b.minY, y),
          maxY: Math.max(b.maxY, y),
        }
      : { minX: x, maxX: x, minY: y, maxY: y };
  };
  for (const a of attempts) {
    for (const p of a.path) add(p.x, p.y);
    if (a.death) add(a.death.x, a.death.y);
  }
  const found = b as Bounds | null;
  if (!found) return null;
  return { minX: found.minX - 2, maxX: found.maxX + 2, minY: found.minY - 2, maxY: found.maxY + 3 };
}

/**
 * Draws the paths of the attempts, green for a clear, red for a death and grey for the rest; a red cross where
 * a life was lost; and a blue ring, bigger the longer, where Ben stayed. Tiles run left to right and up, as in
 * the level. Returns what was drawn, for the legend.
 */
export function drawPaths(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  attempts: readonly Attempt[],
): { paths: number; deaths: number; dwells: number } {
  ctx.clearRect(0, 0, width, height);
  const bounds = boundsOf(attempts);
  if (!bounds) return { paths: 0, deaths: 0, dwells: 0 };

  const scale = Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY));
  const px = (x: number): number => (x - bounds.minX) * scale;
  const py = (y: number): number => height - (y - bounds.minY) * scale;

  // A tile grid, with a label every ten tiles.
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(154, 150, 176, 0.7)';
  for (let x = Math.ceil(bounds.minX / 10) * 10; x <= bounds.maxX; x += 10) {
    ctx.strokeStyle = 'rgba(154, 150, 176, 0.18)';
    ctx.beginPath();
    ctx.moveTo(px(x), 0);
    ctx.lineTo(px(x), height);
    ctx.stroke();
    ctx.fillText(String(x), px(x) + 3, height - 4);
  }
  for (let y = Math.ceil(bounds.minY / 10) * 10; y <= bounds.maxY; y += 10) {
    ctx.strokeStyle = 'rgba(154, 150, 176, 0.18)';
    ctx.beginPath();
    ctx.moveTo(0, py(y));
    ctx.lineTo(width, py(y));
    ctx.stroke();
    ctx.fillText(String(y), 4, py(y) - 3);
  }

  let deaths = 0;
  let rings = 0;
  for (const a of attempts) {
    ctx.strokeStyle = `rgba(${COLOURS[a.outcome]}, 0.4)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    a.path.forEach((p, i) => (i ? ctx.lineTo(px(p.x), py(p.y)) : ctx.moveTo(px(p.x), py(p.y))));
    ctx.stroke();
  }
  for (const a of attempts) {
    for (const d of dwells(a)) {
      rings += 1;
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px(d.x), py(d.y), Math.min(30, 4 + d.ticks / 30), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgb(244, 63, 94)';
  ctx.lineWidth = 2.5;
  for (const a of attempts) {
    if (!a.death) continue;
    deaths += 1;
    const x = px(a.death.x);
    const y = py(a.death.y);
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 5);
    ctx.lineTo(x + 5, y + 5);
    ctx.moveTo(x + 5, y - 5);
    ctx.lineTo(x - 5, y + 5);
    ctx.stroke();
  }
  return { paths: attempts.filter((a) => a.path.length > 0).length, deaths, dwells: rings };
}
