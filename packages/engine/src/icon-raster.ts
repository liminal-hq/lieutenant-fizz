// Draws the app icon SVG to RGBA pixels, for the subset of SVG the icon uses and nothing more.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// The icon is pixel art: rectangles (one with rounded corners), a circle and paths made of squares.
// Parsing only that subset means a redesigned SVG that uses anything else (an ellipse, a curve, a
// transform) fails loudly here instead of being drawn wrongly. Shapes are drawn in order with
// 4×4 supersampling, and colours are blended in straight alpha so partial edges come out right.

const SAMPLES = 4;

/** An axis-aligned rectangle in SVG units, with a corner radius (0 for square corners). */
interface RectShape {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
  fill: readonly [number, number, number];
  opacity: number;
}

interface CircleShape {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
  fill: readonly [number, number, number];
  opacity: number;
}

/** A path made of closed rectangles (`M x y h w v h h -w Z`), filled as one shape. */
interface PathShape {
  kind: 'path';
  rects: { x: number; y: number; w: number; h: number }[];
  fill: readonly [number, number, number];
  opacity: number;
}

export type IconShape = RectShape | CircleShape | PathShape;

export interface IconDoc {
  /** The side of the square viewBox, in SVG units. */
  size: number;
  shapes: IconShape[];
}

export interface Raster {
  width: number;
  height: number;
  /** Straight (not premultiplied) RGBA, row by row from the top left. */
  data: Uint8Array;
}

export interface RasterOptions {
  /** Scales the art about the centre of the picture (0.8 for a maskable icon's safe zone). */
  scale?: number;
  /** A solid `#rrggbb` fill drawn first across the whole picture; without it the picture starts transparent. */
  background?: string;
}

const ALLOWED_ATTRS: Record<string, readonly string[]> = {
  svg: ['xmlns', 'viewBox', 'width', 'height', 'shape-rendering'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'fill', 'opacity', 'shape-rendering'],
  circle: ['cx', 'cy', 'r', 'fill', 'opacity', 'shape-rendering'],
  path: ['d', 'fill', 'opacity', 'shape-rendering'],
};

const NUM = /^-?(?:\d+\.?\d*|\.\d+)$/;

function num(el: string, name: string, v: string | undefined, fallback?: number): number {
  if (v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`<${el}> needs ${name}`);
  }
  if (!NUM.test(v)) throw new Error(`<${el}> ${name}="${v}" is not a plain number`);
  return Number(v);
}

/** Parses `#rrggbb` into 0–255 channels. */
export function parseHex(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`unsupported colour "${hex}" (use #rrggbb)`);
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function paint(
  el: string,
  a: Record<string, string>,
): { fill: [number, number, number]; opacity: number } {
  if (a['fill'] === undefined) throw new Error(`<${el}> needs a fill`);
  const opacity = num(el, 'opacity', a['opacity'], 1);
  if (opacity < 0 || opacity > 1) throw new Error(`<${el}> opacity ${opacity} is outside 0 to 1`);
  return { fill: parseHex(a['fill']), opacity };
}

/** Reads `M x y h w v h h -w Z` (one or more) into rectangles, and throws on any other path data. */
function parsePath(d: string): { x: number; y: number; w: number; h: number }[] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  if (d.replace(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)|[\s,]/g, '') !== '') {
    throw new Error(`unsupported characters in path data "${d.slice(0, 40)}"`);
  }
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  let i = 0;
  const cmd = (letter: string): void => {
    const t = tokens[i++];
    if (t !== letter)
      throw new Error(`unsupported path command "${t ?? 'end of data'}" (expected ${letter})`);
  };
  const arg = (): number => {
    const t = tokens[i++];
    if (t === undefined || !NUM.test(t))
      throw new Error(`path expected a number, found "${t ?? 'end of data'}"`);
    return Number(t);
  };
  while (i < tokens.length) {
    cmd('M');
    const x = arg();
    const y = arg();
    cmd('h');
    const w = arg();
    cmd('v');
    const h = arg();
    cmd('h');
    if (arg() !== -w)
      throw new Error('path is not a closed rectangle (the second h must undo the first)');
    cmd('Z');
    if (w <= 0 || h <= 0) throw new Error('path rectangles must have positive sides');
    rects.push({ x, y, w, h });
  }
  if (rects.length === 0) throw new Error('empty path');
  return rects;
}

/** Parses the icon SVG. Throws on any element, attribute or path command outside the supported subset. */
export function parseIconSvg(svg: string): IconDoc {
  const tag = /<([^>]*)>|([^<]+)/g;
  let size = 0;
  let sawRoot = false;
  const shapes: IconShape[] = [];
  for (const m of svg.matchAll(tag)) {
    if (m[2] !== undefined) {
      if (m[2].trim() !== '') throw new Error(`unexpected text "${m[2].trim().slice(0, 30)}"`);
      continue;
    }
    const body = (m[1] ?? '').trim();
    if (body.startsWith('/')) continue; // a closing tag; its opening tag was already checked
    const name = /^[A-Za-z][\w:-]*/.exec(body)?.[0] ?? '';
    const allowed = ALLOWED_ATTRS[name];
    if (!allowed) throw new Error(`unsupported SVG element <${name || body.slice(0, 20)}>`);
    const attrs: Record<string, string> = {};
    const rest = body.slice(name.length).replace(/\/$/, '');
    let seen = 0;
    for (const a of rest.matchAll(/\s+([\w:-]+)="([^"]*)"/g)) {
      const key = a[1] as string;
      if (!allowed.includes(key)) throw new Error(`unsupported attribute ${key} on <${name}>`);
      attrs[key] = a[2] as string;
      seen += (a[0] ?? '').length;
    }
    if (seen !== rest.replace(/\s+$/, '').length)
      throw new Error(`could not read the attributes of <${name}>`);
    if (name === 'svg') {
      if (sawRoot) throw new Error('nested <svg> is not supported');
      sawRoot = true;
      const vb = (attrs['viewBox'] ?? '').split(/\s+/);
      if (
        vb.length !== 4 ||
        vb[0] !== '0' ||
        vb[1] !== '0' ||
        vb[2] !== vb[3] ||
        !NUM.test(vb[2] ?? '')
      ) {
        throw new Error('viewBox must be "0 0 N N"');
      }
      size = Number(vb[2]);
      continue;
    }
    if (!sawRoot) throw new Error(`<${name}> before <svg>`);
    const { fill, opacity } = paint(name, attrs);
    if (name === 'rect') {
      const w = num(name, 'width', attrs['width']);
      const h = num(name, 'height', attrs['height']);
      shapes.push({
        kind: 'rect',
        x: num(name, 'x', attrs['x'], 0),
        y: num(name, 'y', attrs['y'], 0),
        w,
        h,
        rx: Math.min(num(name, 'rx', attrs['rx'], 0), w / 2, h / 2),
        fill,
        opacity,
      });
    } else if (name === 'circle') {
      shapes.push({
        kind: 'circle',
        cx: num(name, 'cx', attrs['cx'], 0),
        cy: num(name, 'cy', attrs['cy'], 0),
        r: num(name, 'r', attrs['r']),
        fill,
        opacity,
      });
    } else {
      shapes.push({ kind: 'path', rects: parsePath(attrs['d'] ?? ''), fill, opacity });
    }
  }
  if (!sawRoot) throw new Error('no <svg> element');
  return { size, shapes };
}

/** Draws the SVG at `px` × `px` pixels. */
export function rasteriseIcon(svg: string, px: number, opts: RasterOptions = {}): Raster {
  const doc = parseIconSvg(svg);
  const scale = opts.scale ?? 1;
  const n = px * SAMPLES; // samples per side
  // Premultiplied colour (0–255 times alpha) and alpha (0–1) per sample.
  const buf = new Float32Array(n * n * 4);
  if (opts.background !== undefined) {
    const [r, g, b] = parseHex(opts.background);
    for (let i = 0; i < n * n; i++) buf.set([r, g, b, 1], i * 4);
  }
  // SVG units to sample units: scale about the centre, then stretch to the sample grid.
  const k = (scale * n) / doc.size;
  const c = doc.size / 2;
  const to = (v: number): number => ((v - c) * scale + c) * (n / doc.size);
  // A sample (i, j) has its centre at (i + 0.5, j + 0.5); the first index whose centre is at or past `edge`.
  const first = (edge: number): number => Math.ceil(edge - 0.5);
  const clamp = (v: number): number => Math.max(0, Math.min(n, v));

  const put = (shape: IconShape, x: number, y: number): void => {
    const i = (y * n + x) * 4;
    const a = shape.opacity;
    const keep = 1 - a;
    buf[i] = (buf[i] as number) * keep + shape.fill[0] * a;
    buf[i + 1] = (buf[i + 1] as number) * keep + shape.fill[1] * a;
    buf[i + 2] = (buf[i + 2] as number) * keep + shape.fill[2] * a;
    buf[i + 3] = (buf[i + 3] as number) * keep + a;
  };

  for (const shape of doc.shapes) {
    // Each shape is turned into a mask first, so a path that overlaps itself is blended once.
    const spans: [number, number, number][] = []; // [row, from, to) in sample units
    const addRow = (row: number, from: number, upto: number): void => {
      const a = clamp(from);
      const b = clamp(upto);
      if (row < 0 || row >= n || b <= a) return;
      spans.push([row, a, b]);
    };
    if (shape.kind === 'rect') {
      const left = to(shape.x);
      const top = to(shape.y);
      const right = to(shape.x + shape.w);
      const bottom = to(shape.y + shape.h);
      const r = shape.rx * k;
      for (let row = first(top); row < first(bottom); row++) {
        const cy = row + 0.5;
        let inset = 0;
        if (r > 0 && cy < top + r) inset = r - Math.sqrt(Math.max(0, r * r - (top + r - cy) ** 2));
        else if (r > 0 && cy > bottom - r)
          inset = r - Math.sqrt(Math.max(0, r * r - (cy - (bottom - r)) ** 2));
        addRow(row, first(left + inset), first(right - inset));
      }
    } else if (shape.kind === 'circle') {
      const cx = to(shape.cx);
      const cy = to(shape.cy);
      const r = shape.r * k;
      for (let row = first(cy - r); row <= Math.floor(cy + r - 0.5); row++) {
        const dy = row + 0.5 - cy;
        const half = Math.sqrt(Math.max(0, r * r - dy * dy));
        addRow(row, first(cx - half), Math.floor(cx + half - 0.5) + 1);
      }
    } else {
      const mask = new Map<number, Set<number>>();
      for (const q of shape.rects) {
        for (let row = first(to(q.y)); row < first(to(q.y + q.h)); row++) {
          let set = mask.get(row);
          if (!set) mask.set(row, (set = new Set()));
          for (let col = first(to(q.x)); col < first(to(q.x + q.w)); col++) set.add(col);
        }
      }
      for (const [row, cols] of mask) for (const col of cols) addRow(row, col, col + 1);
    }
    for (const [row, from, upto] of spans)
      for (let col = from; col < upto; col++) put(shape, col, row);
  }

  const data = new Uint8Array(px * px * 4);
  const cell = SAMPLES * SAMPLES;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const i = ((y * SAMPLES + sy) * n + x * SAMPLES + sx) * 4;
          r += buf[i] as number;
          g += buf[i + 1] as number;
          b += buf[i + 2] as number;
          a += buf[i + 3] as number;
        }
      }
      const o = (y * px + x) * 4;
      if (a > 0) {
        data[o] = Math.round(r / a);
        data[o + 1] = Math.round(g / a);
        data[o + 2] = Math.round(b / a);
        data[o + 3] = Math.round((a / cell) * 255);
      }
    }
  }
  return { width: px, height: px, data };
}
