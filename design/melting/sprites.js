// EGA 16-colour palette, a tiny pixel DSL, and the atlas builder (albedo + generated normal map).
export const EGA = { k: '#000000', B: '#0000aa', G: '#00aa00', C: '#00aaaa', R: '#aa0000', M: '#aa00aa', N: '#aa5500', L: '#aaaaaa', D: '#555555', b: '#5555ff', g: '#55ff55', c: '#55ffff', r: '#ff5555', m: '#ff55ff', y: '#ffff55', W: '#ffffff' };

class Pen {
  constructor(w, h) { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => Array(w).fill(null)); }
  px(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = c; return this; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c); return this; }
  ell(cx, cy, rx, ry, c, cond) {
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const dx = (i + 0.5 - cx) / rx, dy = (j + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && (!cond || cond(i, j))) this.px(i, j, c);
    }
    return this;
  }
  line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let k = 0; k <= n; k++) this.px(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), c); return this; }
  fn(f) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = f(x, y, this.g[y][x]); if (c !== undefined) this.g[y][x] = c; } return this; }
  outline(c = 'k') {
    const g = this.g, add = [];
    const n = (i, j) => j >= 0 && i >= 0 && j < this.h && i < this.w && g[j][i] && g[j][i] !== c;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (!g[y][x] && (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1))) add.push([x, y]);
    add.forEach(([x, y]) => { g[y][x] = c; });
    return this;
  }
}

const rng = seed => { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; }; };

// ---------- Characters ----------
function ben(pose) {
  const pogo = pose.startsWith('pogo'), H = pogo ? 32 : 24, p = new Pen(16, H), o = pose === 'pogo2' ? 2 : 0;
  const R = (x, y, w, h, c) => p.rect(x, y + o, w, h, c), P = (x, y, c) => p.px(x, y + o, c);
  if (pogo) {
    p.rect(7, 12 + o, 2, H - 13 - o, 'L');
    for (let y = 24; y < 29; y += 2) p.rect(6, y, 4, 1, 'D');
    p.rect(4, 21 + o, 8, 1, 'D'); p.rect(5, 12 + o, 6, 1, 'D'); p.rect(7, H - 1, 2, 1, 'D');
  }
  p.ell(8, 5 + o, 5.5, 4.6, 'g', (i, j) => j <= 5 + o);
  R(3, 5, 12, 1, 'G'); R(6, 2, 4, 1, 'W'); P(5, 3, 'G'); P(8, 3, 'G'); P(11, 3, 'G');
  R(5, 6, 7, 4, 'W'); P(4, 7, 'W'); P(9, 7, 'k'); P(11, 7, 'k'); P(12, 8, 'W'); P(10, 9, 'r'); P(5, 8, 'D'); P(5, 9, 'D');
  R(4, 10, 8, 6, 'r'); R(4, 15, 8, 1, 'R'); R(6, 10, 4, 1, 'W'); R(7, 12, 2, 2, 'y');
  if (pose === 'shoot') { R(10, 11, 4, 2, 'r'); R(12, 10, 4, 3, 'c'); P(15, 10, 'W'); R(3, 11, 2, 4, 'R'); }
  else if (pogo) { R(9, 11, 2, 2, 'r'); P(10, 12, 'W'); R(3, 11, 2, 4, 'R'); }
  else { R(3, 11, 2, 4, 'R'); R(11, 11, 2, 4, 'r'); P(11, 15, 'W'); P(12, 15, 'W'); }
  if (pose === 'run1') { R(5, 16, 6, 2, 'B'); R(4, 18, 2, 3, 'B'); R(2, 21, 4, 2, 'R'); R(10, 18, 2, 3, 'B'); R(11, 20, 4, 2, 'R'); P(10, 18, 'b'); }
  else if (pose === 'run2') { R(5, 16, 6, 2, 'B'); R(6, 18, 4, 4, 'B'); R(6, 22, 5, 2, 'R'); P(7, 18, 'b'); }
  else if (pose === 'jump') { R(5, 16, 6, 3, 'B'); R(4, 19, 3, 2, 'R'); R(10, 17, 3, 2, 'B'); R(12, 16, 3, 2, 'R'); }
  else if (pogo) { R(5, 16, 6, 2, 'B'); R(5, 18, 2, 3, 'B'); R(9, 18, 2, 3, 'B'); R(4, 20, 3, 1, 'R'); R(9, 20, 3, 1, 'R'); }
  else { R(5, 16, 6, 2, 'B'); R(5, 18, 2, 4, 'B'); R(9, 18, 2, 4, 'B'); R(4, 22, 4, 2, 'R'); R(9, 22, 4, 2, 'R'); P(5, 18, 'b'); }
  return p.outline().g;
}
function benMap(f) {
  const p = new Pen(16, 16);
  p.ell(8, 5, 5, 4.2, 'g', (i, j) => j <= 5); p.rect(3, 5, 10, 1, 'G'); p.rect(6, 2, 4, 1, 'W');
  p.rect(4, 6, 8, 3, 'W'); p.px(6, 7, 'k'); p.px(9, 7, 'k');
  p.rect(4, 9, 8, 3, 'r'); p.rect(6, 9, 4, 1, 'W');
  if (f) { p.rect(5, 12, 2, 2, 'B'); p.rect(9, 12, 2, 1, 'B'); p.rect(4, 14, 3, 1, 'R'); p.rect(9, 13, 3, 1, 'R'); }
  else { p.rect(5, 12, 2, 1, 'B'); p.rect(9, 12, 2, 2, 'B'); p.rect(4, 13, 3, 1, 'R'); p.rect(9, 14, 3, 1, 'R'); }
  return p.outline().g;
}
function billy(caged, alt) {
  const p = new Pen(16, 24);
  if (alt) {
    p.ell(8, 7, 4.5, 4, 'D', (i, j) => j <= 8); p.rect(7, 3, 2, 6, 'r'); p.rect(4, 8, 9, 1, 'k');
    p.rect(5, 9, 6, 4, 'W'); p.rect(4, 10, 1, 2, 'L'); p.rect(11, 10, 1, 2, 'L');
    p.rect(4, 10, 8, 1, 'k'); p.rect(5, 11, 2, 1, 'k'); p.rect(9, 11, 2, 1, 'k'); p.px(5, 10, 'D'); p.px(9, 10, 'D'); p.px(8, 12, 'r');
    p.rect(4, 13, 8, 5, 'k'); p.rect(7, 13, 2, 5, 'r'); p.rect(4, 17, 8, 1, 'R'); p.rect(3, 14, 1, 3, 'k'); p.rect(12, 14, 1, 3, 'k'); p.px(3, 16, 'r'); p.px(12, 16, 'r');
    p.rect(5, 18, 2, 4, 'k'); p.rect(9, 18, 2, 4, 'k'); p.px(5, 19, 'r'); p.px(10, 19, 'r'); p.rect(4, 22, 3, 2, 'r'); p.rect(9, 22, 3, 2, 'r');
  } else {
  p.ell(8, 7, 4.5, 4, 'y', (i, j) => j <= 8); p.rect(7, 3, 2, 6, 'R'); p.rect(4, 8, 9, 1, 'N');
  p.rect(5, 9, 6, 4, 'W'); p.px(7, 10, 'k'); p.px(9, 10, 'k'); p.px(8, 12, 'r'); p.rect(4, 10, 1, 2, 'L'); p.rect(11, 10, 1, 2, 'L');
  p.rect(4, 13, 8, 5, 'g'); p.rect(4, 17, 8, 1, 'G'); p.rect(3, 14, 1, 3, 'g'); p.rect(12, 14, 1, 3, 'g');
  p.rect(5, 18, 2, 4, 'B'); p.rect(9, 18, 2, 4, 'B'); p.rect(4, 22, 3, 2, 'W'); p.rect(9, 22, 3, 2, 'W');
  }
  p.outline();
  if (caged) { p.rect(0, 0, 16, 2, 'D'); p.rect(0, 22, 16, 2, 'D'); for (let x = 0; x < 16; x += 3) p.rect(x, 2, 1, 20, 'L'); p.rect(0, 1, 16, 1, 'L'); }
  return p.g;
}

// ---------- Enemies ----------
function gloop(f) {
  const p = new Pen(16, 16), rx = f ? 7 : 6, ry = f ? 3.2 : 4, top = 15 - 2 * ry;
  p.ell(8, 15 - ry, rx, ry, 'g'); p.fn((x, y, c) => c === 'g' && y >= 14 ? 'G' : undefined);
  p.px(5, 13, 'y'); p.px(9, 14, 'y'); p.px(7, 12, 'W');
  p.rect(11, top - 2, 1, 3, 'g'); p.ell(11.5, top - 3, 1.9, 1.9, 'W'); p.px(12, top - 3, 'k');
  return p.outline().g;
}
function hopper(f) {
  const p = new Pen(16, 16), cy = f ? 6 : 9;
  if (f) { p.rect(4, 10, 1, 4, 'N'); p.rect(11, 10, 1, 4, 'N'); p.rect(3, 14, 3, 1, 'N'); p.rect(10, 14, 3, 1, 'N'); }
  else { p.rect(3, 13, 4, 2, 'N'); p.rect(9, 13, 4, 2, 'N'); }
  p.ell(8, cy, 5.5, 4.8, 'y'); p.px(5, cy, 'N'); p.px(6, cy + 2, 'N'); p.px(9, cy + 2, 'N'); p.px(4, cy - 2, 'N');
  p.ell(10, cy - 1, 1.8, 1.8, 'W'); p.px(10, cy - 1, 'k'); p.px(12, cy + 1, 'R');
  return p.outline().g;
}
function marsh(f) {
  const p = new Pen(16, 16);
  if (f) p.ell(8, 11.5, 7, 3.6, 'W'); else p.ell(8, 9.5, 5.5, 5.6, 'W');
  p.fn((x, y, c) => c === 'W' && y >= (f ? 13 : 13) ? 'm' : undefined);
  const ey = f ? 10 : 8; p.px(6, ey, 'k'); p.px(10, ey, 'k'); p.px(8, ey + 2, 'M'); p.px(5, ey - 2, 'L');
  return p.outline().g;
}
function beetle(f) {
  const p = new Pen(16, 16);
  for (let i = 0; i < 3; i++) p.rect(4 + i * 3 + (f ? 1 : 0), 13, 1, 2, 'D');
  p.ell(7, 11, 6, 4.5, 'N', (i, j) => j <= 12); p.line(7, 7, 7, 12, 'R'); p.px(4, 9, 'y'); p.px(9, 9, 'y');
  p.ell(12.5, 11, 2.6, 2.2, 'D'); p.px(13, 10, 'r'); p.px(15, 9, 'y'); p.px(14, 10, 'L');
  return p.outline().g;
}
function bat(f) {
  const p = new Pen(16, 16);
  if (!f) { p.ell(8, 6, 3, 4.5, 'M'); p.rect(4, 2, 2, 7, 'C'); p.rect(10, 2, 2, 7, 'C'); p.px(5, 1, 'c'); p.px(10, 1, 'c'); p.px(7, 0, 'D'); p.px(9, 0, 'D'); p.px(7, 8, 'r'); p.px(9, 8, 'r'); }
  else {
    p.fn((x, y) => { if (y < 4 || y > 10) return undefined; const d = Math.abs(x + 0.5 - 8); if (d >= 2.5 && d <= 2.5 + (10 - y) * 0.75) return (x + y) % 3 ? 'c' : 'C'; return undefined; });
    p.ell(8, 8, 2.6, 3.2, 'M'); p.px(7, 7, 'r'); p.px(9, 7, 'r'); p.px(7, 10, 'W'); p.px(9, 10, 'W');
  }
  return p.outline().g;
}
function pod(f) {
  const p = new Pen(16, 16);
  p.rect(7, 11, 2, 5, 'G'); p.px(5, 14, 'g'); p.px(6, 13, 'g'); p.px(10, 13, 'g'); p.px(11, 14, 'g');
  p.ell(8, 8, 4.8, f ? 3.8 : 4.6, 'M'); p.px(6, 7, 'm'); p.px(9, 6, 'm'); p.px(10, 9, 'm'); p.px(5, 9, 'm');
  if (f) { p.ell(8, 5, 2.2, 1.2, 'k'); p.px(7, 2, 'm'); p.px(9, 1, 'm'); p.px(8, 3, 'W'); }
  return p.outline().g;
}
function spore(f) {
  const p = new Pen(16, 16), r = rng(77 + f);
  for (let i = 0; i < 18; i++) { const x = r() * 14 + 1, y = r() * 14 + 1; p.px(x, y, i % 3 === 0 ? 'W' : i % 2 ? 'm' : 'M'); if (i % 4 === 0) p.px(x + 1, y, 'm'); }
  return p.g;
}
function phantom(f) {
  const p = new Pen(16, 24);
  p.ell(8, 16, 4.6, 6, 'L'); p.rect(6, 11, 1, 10, 'W'); p.rect(4, 21, 3, 2, 'D'); p.rect(9, 21, 3, 2, 'D');
  p.ell(8, 7, 4.2, 3.6, 'g'); p.ell(8, 4.5, 4.4, 2.6, 'W', (i, j) => j <= 4); p.ell(6.5, 7.5, 1, 1.5, 'k'); p.ell(9.5, 7.5, 1, 1.5, 'k');
  p.line(8, 0, 8, 2, 'L'); p.px(8, 0, 'y'); p.rect(2, 13, 2, 4, 'L'); p.rect(12, 13, 2, 4, 'L');
  p.outline();
  if (f) p.fn((x, y, c) => c && (x + y) % 2 ? null : undefined);
  return p.g;
}
function roller() {
  const p = new Pen(32, 32), r = rng(5);
  p.ell(16, 16, 14.5, 14.5, 'D'); p.ell(12.5, 12, 8.5, 7.5, 'L', (i, j) => (i - 16) ** 2 + (j - 16) ** 2 < 180);
  for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = r() * 9; const x = 16 + Math.cos(a) * d, y = 16 + Math.sin(a) * d; p.line(x, y, x + 2, y + 1, 'k'); }
  [[9, 20], [20, 8], [22, 21], [13, 11]].forEach(([x, y]) => { p.px(x, y, 'c'); p.px(x + 1, y, 'C'); p.px(x, y - 1, 'W'); p.px(x + 1, y + 1, 'c'); });
  return p.outline().g;
}
function sentry(f) {
  const p = new Pen(24, 16);
  p.rect(7, 11, 3, 2, 'D'); p.rect(14, 11, 3, 2, 'D');
  p.rect(7, 13, 3, 2, f ? 'y' : 'r'); p.rect(14, 13, 3, 2, f ? 'r' : 'y'); p.px(8, 15, 'y'); p.px(15, 15, 'y');
  p.ell(12, 7.5, 9.5, 4.5, 'L'); p.ell(12, 4.5, 4, 3, 'c', (i, j) => j <= 4); p.px(11, 2, 'W');
  p.rect(4, 7, 16, 2, 'D'); p.rect(f ? 13 : 9, 7, 2, 2, 'r'); p.px(3, 9, 'W'); p.px(20, 9, 'W');
  return p.outline().g;
}
function drone(f) {
  const p = new Pen(16, 16);
  p.ell(8, 8, 6.5, 3.2, 'm'); p.fn((x, y, c) => c === 'm' && ((x + f * 2) % 4 < 2) ? 'M' : undefined);
  p.rect(2, 8, 12, 1, 'y'); p.rect(7, 2, 2, 4, 'L'); p.px(7, 1, 'y'); p.px(8, 1, 'y');
  p.px(7, 11, 'M'); p.px(8, 11, 'M'); p.px(8, 12, 'M');
  return p.outline().g;
}
function boss(f) {
  const p = new Pen(48, 48);
  p.rect(11, 37, 8, 7, 'D'); p.rect(29, 37, 8, 7, 'D'); p.rect(8, 44, 13, 3, 'L'); p.rect(27, 44, 13, 3, 'L');
  p.rect(2, 22, 7, 13, 'D'); p.rect(39, 22, 7, 13, 'D'); p.rect(1, 34, 3, 4, 'L'); p.rect(6, 34, 3, 4, 'L'); p.rect(39, 34, 3, 4, 'L'); p.rect(44, 34, 3, 4, 'L');
  p.ell(24, 28, 17, 11.5, 'N'); p.fn((x, y, c) => c === 'N' && y > 34 ? 'R' : undefined);
  for (let x = 12; x <= 36; x += 6) p.rect(x, 22, 1, 12, 'R');
  for (let x = 14; x <= 34; x += 5) p.rect(x, 30, 2, 2, f ? 'r' : 'y');
  p.ell(24, 15, 10, 9.5, 'c', (i, j) => j <= 18); p.rect(14, 18, 21, 2, 'L');
  p.ell(24, 13, 3.6, 3.6, 'W'); p.rect(18, 10, 2, 4, 'y'); p.rect(29, 10, 2, 4, 'y'); p.rect(20, 9, 9, 2, 'y');
  p.px(23, 13, 'k'); p.px(25, 13, 'k'); p.px(24, 15, f ? 'R' : 'r'); p.px(18, 8, 'W'); p.px(17, 9, 'W');
  return p.outline().g;
}

// ---------- Projectiles, fx ----------
const bubble = () => { const p = new Pen(8, 8); p.ell(4, 4, 3.2, 3.2, 'c'); p.ell(4, 4, 2, 2, 'b'); p.px(3, 2, 'W'); p.px(2, 3, 'W'); return p.g; };
const zshot = () => { const p = new Pen(8, 8); p.ell(4, 4, 3, 3, 'r'); p.ell(4, 4, 1.6, 1.6, 'y'); return p.g; };
const glob = () => { const p = new Pen(8, 8); p.ell(4, 4.5, 3, 3, 'N'); p.px(4, 0, 'N'); p.px(4, 1, 'N'); p.px(3, 3, 'y'); return p.outline().g; };
const stars = f => { const p = new Pen(16, 8); [[2, 3], [8, 1], [13, 4]].forEach(([x, y], i) => { const xx = (x + f * 3 + i) % 15; p.px(xx, y, 'y'); p.px(xx - 1, y, 'y'); p.px(xx + 1, y, 'y'); p.px(xx, y - 1, 'y'); p.px(xx, y + 1, 'y'); p.px(xx, y, 'W'); }); return p.g; };
const puff = () => { const p = new Pen(16, 16); p.ell(8, 8, 7, 7, 'W', (i, j) => (i + j) % 2 === 0 && (i - 7.5) ** 2 + (j - 7.5) ** 2 > 12); p.ell(8, 8, 4, 4, 'L', (i, j) => (i + j) % 3 === 0); return p.g; };

// ---------- Items ----------
function cheezie() { const p = new Pen(16, 16); p.rect(4, 3, 8, 11, 'y'); p.rect(4, 2, 8, 1, 'r'); p.rect(4, 14, 8, 1, 'r'); p.rect(4, 5, 8, 2, 'r'); [[6, 9], [7, 10], [9, 8], [10, 11], [6, 12]].forEach(([x, y]) => { p.px(x, y, 'N'); p.px(x + 1, y, 'N'); }); p.px(5, 4, 'W'); return p.outline().g; }
function choc() { const p = new Pen(16, 16); p.rect(1, 5, 14, 6, 'N'); p.rect(1, 5, 2, 6, 'r'); p.rect(13, 5, 2, 6, 'r'); p.rect(3, 7, 10, 1, 'y'); p.rect(4, 9, 8, 1, 'R'); p.px(0, 6, 'r'); p.px(0, 9, 'r'); p.px(15, 6, 'r'); p.px(15, 9, 'r'); return p.outline().g; }
function cookie() { const p = new Pen(16, 16); p.ell(8, 8, 6.5, 6.5, 'N'); p.ell(8, 8, 4.2, 4.2, 'R'); p.ell(8, 8, 2, 2, 'N'); [[3, 8], [8, 3], [13, 8], [8, 13], [5, 5], [11, 5], [5, 11], [11, 11]].forEach(([x, y]) => p.px(x, y, 'y')); return p.outline().g; }
function soda() { const p = new Pen(16, 16); p.rect(5, 3, 6, 11, 'r'); p.rect(5, 2, 6, 1, 'L'); p.rect(5, 14, 6, 1, 'L'); p.rect(5, 7, 6, 2, 'W'); p.px(6, 4, 'W'); p.px(9, 11, 'c'); p.px(8, 12, 'c'); return p.outline().g; }
function gumdrop(c, s) { const p = new Pen(16, 16); p.ell(8, 11, 5, 6, c, (i, j) => j <= 13); p.px(6, 8, 'W'); p.px(9, 7, 'W'); p.px(10, 11, 'W'); p.px(5, 11, s); return p.outline().g; }
function usb() { const p = new Pen(16, 16); p.rect(2, 6, 9, 5, 'y'); p.rect(11, 7, 4, 3, 'L'); p.px(12, 8, 'D'); p.px(14, 8, 'D'); p.rect(3, 6, 7, 1, 'W'); p.px(4, 8, 'N'); p.px(6, 8, 'N'); return p.outline().g; }

// ---------- Tiles ----------
const BIOMES = {
  crater: { top: 'g', top2: 'G', fill: 'M', fill2: 'B', fleck: 'm', plat: ['c', 'C', 'b'], block: ['m', 'M', 'W'] },
  caves: { top: 'c', top2: 'C', fill: 'D', fill2: 'k', fleck: 'L', plat: ['L', 'D', 'k'], block: ['L', 'D', 'W'] },
  citadel: { top: 'W', top2: 'm', fill: 'N', fill2: 'R', fleck: 'y', plat: ['y', 'N', 'R'], block: ['N', 'R', 'y'] }
};
function ground(bio, surf, seed) {
  const B = BIOMES[bio], r = rng(seed), p = new Pen(16, 16);
  return p.fn((x, y) => {
    const hb = 16 - y - 0.5, s = surf(x + 0.5);
    if (hb > s) return null;
    const d = s - hb, q = r();
    if (d < 1.2) return B.top;
    if (d < 2.5) return q < 0.3 ? B.top : B.top2;
    if (d < 3.6) return q < 0.5 ? B.top2 : B.fill;
    if (bio === 'citadel') { const l = y % 8; return l === 5 ? 'm' : l === 6 && q < 0.5 ? 'W' : q < 0.06 ? 'y' : 'N'; }
    return q < 0.07 ? B.fleck : q < 0.2 ? B.fill2 : B.fill;
  }).g;
}
function fillTile(bio, seed) { return ground(bio, () => Infinity, seed); }
function platTile(bio) { const [a, b, c] = BIOMES[bio].plat; const p = new Pen(16, 16); return p.fn((x, y) => y === 0 ? a : y < 4 ? ((x + y) % 5 === 0 ? c : b) : y === 4 ? c : y === 5 && x % 5 === 2 ? b : null).g; }
function blockTile(bio) {
  const [a, b, c] = BIOMES[bio].block, p = new Pen(16, 16);
  if (bio === 'citadel') { p.ell(8, 8, 8, 8, a); [[4, 5], [10, 4], [7, 9], [11, 11], [4, 11]].forEach(([x, y]) => p.rect(x, y, 2, 2, 'k')); p.fn((x, y, cc) => cc ? undefined : 'R'); return p.g; }
  return p.fn((x, y) => (x === 0 || y === 0) ? c : (x === 15 || y === 15) ? b : (x + y < 10 ? a : (x > y ? b : a))).g;
}
function backTile(bio, seed) {
  const r = rng(seed), p = new Pen(16, 16);
  if (bio === 'citadel') return p.fn((x, y) => { const l = y % 8; return l < 4 ? 'M' : l === 4 ? 'm' : l === 7 && x % 4 === 0 ? 'm' : 'M'; }).fn((x, y, c) => (x % 16 >= 5 && x % 16 <= 10 && y >= 2 && y <= 6) ? (y === 2 ? 'W' : 'k') : undefined).g;
  return p.fn((x, y) => { const q = r(); return (x % 8 === 0 && q < 0.5) ? 'k' : q < 0.15 ? 'k' : q < 0.25 ? 'B' : 'D'; }).g;
}
function crystal(c1, c2) {
  const p = new Pen(16, 16);
  [[3, 9, 3], [7, 4, 4], [11, 8, 3]].forEach(([x, top, w]) => {
    for (let y = top; y < 16; y++) for (let i = 0; i < w; i++) p.px(x + i - 1, y, i === 0 ? 'W' : i === w - 1 ? c2 : c1);
    p.px(x, top - 1, 'W'); if (w > 3) p.px(x + 1, top - 1, c1);
  });
  return p.outline().g;
}
function spikeTile() { const p = new Pen(16, 16); return p.fn((x, y) => { if (y < 6) return null; const lx = (x % 4) - 1.5, w = (y - 5) / 10 * 2; if (Math.abs(lx) > w) return null; return y < 8 ? 'W' : lx < 0 ? 'N' : 'R'; }).g; }
function chocTop(f) { const p = new Pen(16, 16); return p.fn((x, y) => { const s = 3 + Math.round(Math.sin((x + f * 4) / 16 * Math.PI * 2) * 1.4); if (y < s) return null; if (y === s) return (x + f * 3) % 7 === 0 ? 'W' : 'y'; return y < s + 3 ? 'N' : (x + y + f) % 9 === 0 ? 'R' : 'N'; }).g; }
function chocDeep(f) { const p = new Pen(16, 16); return p.fn((x, y) => (Math.sin((x + y * 0.6 + f * 3) * 0.7) > 0.75 ? 'R' : 'N')).g; }
function doorTile(c) { const p = new Pen(16, 16); return p.fn((x, y) => { if (x < 2 || x > 13) return c; if ((x - 8) ** 2 + (y - 8) ** 2 < 6) return (x + y) % 2 ? 'W' : c; return (x * 3 + y * 5) % 11 === 0 ? 'k' : 'N'; }).g; }
function exitTile(top) {
  const p = new Pen(16, 16);
  if (!top) return p.fn((x, y) => x < 2 || x > 13 ? 'G' : (x === 11 && y === 6) ? 'y' : x === 8 ? 'R' : 'N').g;
  p.fn((x, y) => x < 2 || x > 13 ? 'G' : y < 9 ? 'k' : y === 9 ? 'G' : x === 8 ? 'R' : 'N');
  const glyph = { E: ['111', '100', '110', '100', '111'], X: ['101', '101', '010', '101', '101'], I: ['1', '1', '1', '1', '1'], T: ['111', '010', '010', '010', '010'] };
  let cx = 2; ['E', 'X', 'I', 'T'].forEach(ch => { const g = glyph[ch]; g.forEach((row, j) => [...row].forEach((v, i) => { if (v === '1') p.px(cx + i, 2 + j, 'y'); })); cx += g[0].length + 1; });
  return p.g;
}
function bridgeTile() { const p = new Pen(16, 16); return p.fn((x, y) => y === 0 ? 'W' : y === 1 || y === 6 ? 'L' : (y > 1 && y < 6 && (x + y) % 6 === 0) ? 'D' : (y > 1 && y < 6 && (x - y + 16) % 6 === 0) ? 'D' : null).g; }
function hoverPlat(f) { const p = new Pen(32, 8); p.rect(0, 1, 32, 4, 'L'); p.rect(0, 0, 32, 1, 'W'); p.rect(0, 5, 32, 1, 'D'); for (let x = 3; x < 32; x += 6) p.px(x, 3, f ? 'y' : 'r'); for (let x = 5; x < 32; x += 10) { p.px(x, 6, 'c'); p.px(x + 1, 6, 'c'); p.px(x, 7, f ? 'W' : 'c'); } return p.g; }
function switchTile(on) { const p = new Pen(16, 16); p.rect(4, 12, 8, 4, 'D'); p.rect(4, 12, 8, 1, 'L'); p.line(8, 12, on ? 12 : 4, 5, 'L'); p.ell(on ? 12.5 : 4.5, 4.5, 2, 2, on ? 'g' : 'r'); return p.outline().g; }
function terminal(f) { const p = new Pen(16, 24); p.rect(2, 3, 12, 21, 'D'); p.rect(2, 3, 12, 1, 'L'); p.rect(4, 5, 8, 7, f ? 'g' : 'G'); for (let y = 6; y < 11; y += 2) p.rect(5, y, (y * 3) % 6 + 2, 1, f ? 'k' : 'g'); p.rect(6, 14, 4, 1, 'y'); for (let y = 17; y < 22; y += 2) for (let x = 4; x < 12; x += 2) p.px(x, y, 'L'); return p.outline().g; }

// ---------- Overworld & cinematic ----------
function owGrass(seed) { const r = rng(seed); return new Pen(16, 16).fn(() => { const q = r(); return q < 0.08 ? 'g' : q < 0.1 ? 'c' : 'G'; }).g; }
function owPath(seed) { const r = rng(seed); return new Pen(16, 16).fn(() => { const q = r(); return q < 0.1 ? 'N' : q < 0.13 ? 'W' : 'y'; }).g; }
function owRiver(f) { return new Pen(16, 16).fn((x, y) => Math.sin((x * 0.6 + y * 0.9 + f * 2.5)) > 0.85 ? 'y' : (x + y * 2 + f) % 7 === 0 ? 'R' : 'N').g; }
function owTree(v) { const p = new Pen(16, 16); p.rect(7, 11, 2, 4, 'N'); const c1 = v ? 'm' : 'c', c2 = v ? 'M' : 'C'; p.fn((x, y) => { if (y > 11 || y < 1) return undefined; const w = Math.min(y - 0.5, 12 - y) * 0.75; const d = x + 0.5 - 8; if (Math.abs(d) <= w) return d < -w / 3 ? 'W' : d < w / 3 ? c1 : c2; return undefined; }); return p.outline().g; }
function owRock() { const p = new Pen(16, 16); p.ell(8, 10, 6, 4.5, 'D'); p.ell(7, 9, 4, 3, 'L'); p.px(5, 8, 'W'); return p.outline().g; }
function owCrater() { const p = new Pen(16, 16); p.ell(8, 9, 7, 5, 'M'); p.ell(8, 9, 5, 3.4, 'k'); p.ell(8, 10, 3.5, 2, 'B'); p.px(4, 6, 'm'); p.px(11, 6, 'm'); return p.outline().g; }
function owCave() { const p = new Pen(16, 16); p.ell(8, 11, 7.5, 8, 'D', (i, j) => j < 16); p.ell(8, 12, 4.5, 6, 'k', (i, j) => j < 16); p.px(3, 8, 'c'); p.px(12, 7, 'c'); p.px(4, 7, 'W'); p.px(2, 10, 'L'); return p.outline().g; }
function owCastle() {
  const p = new Pen(32, 32);
  p.rect(4, 12, 24, 19, 'N'); p.rect(2, 6, 7, 25, 'N'); p.rect(23, 6, 7, 25, 'N'); p.rect(12, 2, 8, 12, 'N');
  [[2, 6, 7], [23, 6, 7], [12, 2, 8], [4, 12, 24]].forEach(([x, y, w]) => { p.rect(x, y, w, 2, 'W'); for (let i = x; i < x + w; i += 3) p.px(i, y + 2, 'W'); });
  p.rect(13, 22, 6, 9, 'k'); p.ell(16, 22, 3, 3, 'k'); p.rect(5, 1, 1, 5, 'L'); p.rect(6, 1, 3, 2, 'm'); p.rect(26, 1, 1, 5, 'L'); p.rect(27, 1, 3, 2, 'm');
  for (let y = 16; y < 30; y += 4) { p.rect(4, y, 24, 1, 'm'); }
  p.rect(5, 10, 2, 3, 'y'); p.rect(25, 10, 2, 3, 'y'); p.rect(15, 6, 2, 3, 'y');
  return p.outline().g;
}
function owTele(f) { const p = new Pen(16, 16); p.ell(8, 10, 7, 4, 'D'); p.ell(8, 10, 5.5, 3, f ? 'c' : 'b'); p.ell(8, 10, 3.5, 1.8, f ? 'W' : 'c'); if (f) { p.px(5, 4, 'c'); p.px(10, 2, 'W'); p.px(8, 6, 'c'); } return p.outline().g; }
function owFlag() { const p = new Pen(16, 16); p.rect(5, 2, 1, 13, 'L'); p.rect(6, 2, 7, 5, 'g'); p.rect(6, 6, 7, 1, 'G'); p.px(8, 4, 'W'); return p.outline().g; }
function saucer() {
  const p = new Pen(32, 16);
  p.ell(16, 5, 6.5, 4.5, 'c', (i, j) => j <= 6); p.px(13, 2, 'W'); p.px(14, 1, 'W');
  p.ell(16, 11, 15.5, 4, 'W'); p.rect(2, 13, 28, 1, 'L');
  p.fn((x, y, c) => (c === 'W' && y >= 8 && y <= 11 && Math.sin(x * 1.3 + y * 2) > 0.2) ? 'y' : undefined);
  p.ell(16, 8.5, 9, 2.4, 'r');
  [[10, 8], [16, 7], [22, 8]].forEach(([x, y]) => { p.ell(x, y, 2.4, 2.2, 'N'); p.px(x - 1, y - 1, 'y'); });
  for (let x = 5; x < 28; x += 4) p.px(x, 12, 'y');
  return p.outline().g;
}
function planet() { const p = new Pen(32, 32); p.ell(16, 16, 15.5, 15.5, 'G'); p.fn((x, y, c) => { if (!c) return undefined; const v = Math.sin(y * 0.55 + Math.sin(x * 0.3) * 1.6); return v > 0.6 ? 'M' : v > 0.2 ? 'g' : v < -0.75 ? 'm' : undefined; }); p.ell(11, 10, 3, 2, 'W', (i, j) => (i + j) % 2 === 0); return p.g; }
function hillTop() { return new Pen(16, 16).fn((x, y) => y >= 7 + Math.round(2 * Math.sin(x / 16 * Math.PI * 2)) ? 'W' : null).g; }
function mtnTop() { return new Pen(16, 16).fn((x, y) => y >= Math.abs(x - 7.5) * 1.8 + 2 ? 'W' : null).g; }
function star() { return new Pen(4, 4).fn((x, y) => (x === 1 || x === 2) && (y === 1 || y === 2) ? 'W' : null).g; }

// ---------- Opening: backyard + secret lab ----------
function bigTree() {
  const p = new Pen(64, 80), r = rng(31);
  [[32, 22, 30, 18], [12, 32, 12, 9], [52, 32, 12, 9], [32, 9, 20, 9]].forEach(([x, y, rx, ry]) => p.ell(x, y, rx, ry, 'G'));
  p.fn((x, y, c) => c === 'G' ? (r() < 0.16 ? 'g' : r() < 0.05 ? 'k' : undefined) : undefined);
  p.fn((x, y, c) => c === 'G' && y < 16 && x < 36 && (x + y) % 3 === 0 ? 'g' : undefined);
  p.rect(27, 40, 10, 36, 'N'); p.rect(22, 72, 20, 6, 'N'); p.rect(17, 76, 30, 4, 'N');
  for (let y = 44; y < 72; y += 5) { p.px(29 + (y % 3), y, 'k'); p.px(34, y + 2, 'k'); p.px(34, y + 3, 'k'); }
  p.rect(6, 40, 52, 3, 'N'); p.rect(6, 40, 52, 1, 'y'); p.line(11, 49, 19, 43, 'N'); p.line(53, 49, 45, 43, 'N');
  p.rect(12, 24, 40, 16, 'N'); for (let x = 14; x < 52; x += 4) p.rect(x, 24, 1, 16, 'R');
  for (let j = 0; j < 12; j++) { const hw = Math.round(3 + j * 2.1); p.rect(32 - hw, 12 + j, hw * 2, 1, j % 3 === 2 ? 'R' : 'r'); }
  p.rect(18, 28, 10, 8, 'y'); p.rect(22, 28, 1, 8, 'N'); p.rect(18, 31, 10, 1, 'N'); p.rect(19, 29, 2, 1, 'W');
  p.rect(36, 28, 8, 12, 'k'); p.px(42, 34, 'y');
  for (let y = 43; y < 76; y++) { p.px(47, y, 'L'); p.px(51, y, 'L'); } for (let y = 46; y < 76; y += 4) p.rect(47, y, 5, 1, 'y');
  p.rect(27, 72, 10, 1, 'L'); p.rect(28, 73, 8, 4, 'k'); p.rect(29, 74, 6, 3, 'y'); p.rect(30, 74, 4, 1, 'W');
  return p.outline().g;
}
function house() {
  const p = new Pen(48, 40);
  p.rect(34, 1, 4, 9, 'D');
  for (let j = 0; j < 14; j++) { const hw = Math.round(4 + j * 1.55); p.rect(24 - hw, 2 + j, hw * 2, 1, 'D'); }
  p.rect(4, 16, 40, 24, 'L'); for (let y = 19; y < 40; y += 4) p.rect(4, y, 40, 1, 'W');
  p.rect(9, 21, 9, 8, 'y'); p.rect(13, 21, 1, 8, 'N'); p.rect(9, 24, 9, 1, 'N');
  p.rect(30, 21, 9, 8, 'B'); p.rect(34, 21, 1, 8, 'k'); p.rect(30, 24, 9, 1, 'k');
  p.rect(21, 27, 7, 13, 'N'); p.px(26, 33, 'y');
  return p.outline().g;
}
function fence() { const p = new Pen(16, 16); p.rect(0, 8, 16, 1, 'D'); p.rect(0, 12, 16, 1, 'D'); [2, 10].forEach(x => { p.rect(x, 5, 3, 11, 'L'); p.px(x + 1, 4, 'L'); p.px(x, 5, 'W'); }); return p.g; }
function moon() { const p = new Pen(16, 16); p.ell(8, 8, 6.5, 6.5, 'W'); p.ell(6, 6, 1.6, 1.4, 'L'); p.ell(10, 10, 2, 1.6, 'L'); p.px(10, 5, 'L'); return p.g; }
function labPanel() { return new Pen(16, 16).fn((x, y) => x === 0 || y === 0 ? 'k' : (x === 2 || x === 13) && (y === 2 || y === 13) ? 'L' : y === 1 ? 'L' : 'D').g; }
function labConsole(f) {
  const p = new Pen(32, 32);
  p.rect(1, 4, 30, 28, 'D'); p.rect(1, 4, 30, 1, 'L'); p.rect(4, 7, 14, 10, 'k');
  for (let x = 5; x < 17; x++) p.px(x, 12 + Math.round(2 * Math.sin((x + f * 3) * 0.8)), 'g');
  p.ell(24, 11, 3.5, 3.5, 'L'); p.ell(24, 11, 1.5, 1.5, 'k'); p.px(24, 9, f ? 'r' : 'y');
  for (let i = 0; i < 6; i++) p.rect(5 + i * 4, 20, 2, 2, ['r', 'y', 'g'][(i + f) % 3]);
  for (let y = 25; y < 30; y += 2) for (let x = 5; x < 28; x += 3) p.px(x, y, 'L');
  return p.outline().g;
}
function blueprint() {
  const p = new Pen(32, 24);
  p.fn((x, y) => x === 0 || y === 0 || x === 31 || y === 23 ? 'c' : x % 4 === 0 || y % 4 === 0 ? 'b' : 'B');
  p.line(5, 15, 27, 15, 'W'); p.line(5, 15, 9, 12, 'W'); p.line(27, 15, 23, 12, 'W'); p.line(9, 12, 23, 12, 'W');
  p.line(12, 12, 14, 8, 'W'); p.line(14, 8, 18, 8, 'W'); p.line(18, 8, 20, 12, 'W');
  [[11, 14], [16, 14], [21, 14]].forEach(([x, y]) => p.px(x, y, 'r')); p.rect(4, 19, 10, 1, 'c'); p.rect(4, 21, 6, 1, 'c'); p.px(1, 1, 'r'); p.px(30, 1, 'r');
  return p.g;
}
function bench() {
  const p = new Pen(32, 16);
  p.rect(0, 6, 32, 2, 'N'); p.rect(0, 6, 32, 1, 'y'); p.rect(2, 8, 2, 8, 'D'); p.rect(28, 8, 2, 8, 'D'); p.rect(2, 12, 28, 1, 'D');
  p.rect(8, 2, 9, 4, 'W'); [[9, 3], [10, 3], [11, 3], [9, 5], [10, 5]].forEach(([x, y]) => p.px(x, y, 'D')); [[13, 3], [15, 3], [14, 4], [13, 5], [15, 5]].forEach(([x, y]) => p.px(x, y, 'r'));
  p.rect(22, 1, 3, 5, 'r'); p.px(22, 3, 'W'); p.rect(22, 1, 3, 1, 'L');
  return p.outline().g;
}
function launchPad() { const p = new Pen(48, 8); p.rect(0, 2, 48, 6, 'D'); p.rect(0, 2, 48, 1, 'L'); p.fn((x, y, c) => (y === 4 || y === 5) ? ((x + y) % 6 < 3 ? 'y' : 'k') : undefined); for (let x = 4; x < 48; x += 8) p.px(x, 2, 'c'); return p.outline().g; }
function ladder() { const p = new Pen(16, 16); p.rect(3, 0, 2, 16, 'L'); p.rect(11, 0, 2, 16, 'L'); p.rect(5, 7, 6, 1, 'L'); p.rect(5, 8, 6, 1, 'D'); p.rect(5, 15, 6, 1, 'L'); return p.g; }
function lamp() { const p = new Pen(16, 16); p.rect(7, 0, 2, 7, 'D'); for (let j = 0; j < 4; j++) p.rect(6 - j, 7 + j, 4 + j * 2, 1, 'L'); p.ell(8, 12.5, 2, 1.6, 'y'); return p.outline().g; }

export function defineSprites() {
  const d = [], add = (name, g, tile) => d.push({ name, g, w: g[0].length, h: g.length, tile: !!tile });
  ['stand', 'run1', 'run2', 'jump', 'shoot', 'pogo', 'pogo2'].forEach(p => add('ben_' + p, ben(p)));
  add('benMap0', benMap(0)); add('benMap1', benMap(1)); add('billyCage', billy(true)); add('billy', billy(false)); add('billyAlt', billy(false, true));
  [['gloop', gloop], ['hopper', hopper], ['marsh', marsh], ['beetle', beetle], ['bat', bat], ['pod', pod], ['phantom', phantom], ['sentry', sentry], ['drone', drone], ['boss', boss], ['spore', spore]].forEach(([n, f]) => { add(n + '0', f(0)); add(n + '1', f(1)); });
  add('roller', roller());
  add('bubble', bubble()); add('zshot', zshot()); add('glob', glob()); add('stars0', stars(0)); add('stars1', stars(1)); add('puff', puff());
  add('cheezie', cheezie()); add('choc', choc()); add('cookie', cookie()); add('soda', soda()); add('keyRed', gumdrop('r', 'R')); add('keyBlue', gumdrop('b', 'B')); add('usb', usb());
  let seed = 10;
  for (const b of Object.keys(BIOMES)) {
    add(b + 'Top', ground(b, () => 16, seed++), true); add(b + 'Fill', fillTile(b, seed++), true);
    add(b + 'R45', ground(b, x => x, seed++), true); add(b + 'L45', ground(b, x => 16 - x, seed++), true);
    add(b + 'R22A', ground(b, x => x / 2, seed++), true); add(b + 'R22B', ground(b, x => 8 + x / 2, seed++), true);
    add(b + 'L22A', ground(b, x => 16 - x / 2, seed++), true); add(b + 'L22B', ground(b, x => 8 - x / 2, seed++), true);
    add(b + 'Plat', platTile(b)); add(b + 'Block', blockTile(b), true); add(b + 'Back', backTile(b, seed++), true);
  }
  add('crysC', crystal('c', 'C')); add('crysM', crystal('m', 'M')); add('spike', spikeTile());
  add('chocTop0', chocTop(0), true); add('chocTop1', chocTop(1), true); add('chocDeep0', chocDeep(0), true); add('chocDeep1', chocDeep(1), true);
  add('doorRed', doorTile('r')); add('doorBlue', doorTile('b')); add('exitTop', exitTile(true)); add('exitBot', exitTile(false));
  add('bridge', bridgeTile()); add('hover0', hoverPlat(0)); add('hover1', hoverPlat(1)); add('switchOff', switchTile(false)); add('switchOn', switchTile(true));
  add('terminal0', terminal(0)); add('terminal1', terminal(1));
  add('owGrass', owGrass(3), true); add('owPath', owPath(4), true); add('owRiver0', owRiver(0), true); add('owRiver1', owRiver(1), true);
  add('owTree0', owTree(0)); add('owTree1', owTree(1)); add('owRock', owRock()); add('owCrater', owCrater()); add('owCave', owCave()); add('owCastle', owCastle());
  add('owTele0', owTele(0)); add('owTele1', owTele(1)); add('owFlag', owFlag()); add('saucer', saucer()); add('planet', planet());
  add('bigTree', bigTree()); add('house', house()); add('fence', fence(), true); add('moon', moon()); add('labPanel', labPanel(), true);
  add('console0', labConsole(0)); add('console1', labConsole(1)); add('blueprint', blueprint()); add('bench', bench()); add('pad', launchPad()); add('ladder', ladder(), true); add('lamp', lamp());
  add('hillTop', hillTop()); add('mtnTop', mtnTop()); add('fill', new Pen(16, 16).fn(() => 'W').g, true); add('star', star());
  return d;
}

const lum = h => { const v = parseInt(h.slice(1), 16); return (((v >> 16) & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11) / 255; };

// Atlas: each logical pixel = 4×4 texels (16px sprites → 64px cells), 1px extruded border per sprite.
export function buildAtlas() {
  const defs = defineSprites(), N = 2048, S = 4;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
  const [alb, ac] = mk(), [nrm, nc] = mk();
  const spr = {};
  let cx = 0, cy = 0, rowH = 0;
  for (const d of defs) {
    const pw = d.w * S, ph = d.h * S;
    if (cx + pw + 2 > N) { cx = 0; cy += rowH; rowH = 0; }
    const ox = cx + 1, oy = cy + 1, g = d.g;
    const H = (x, y) => { if (d.tile) { x = Math.max(0, Math.min(d.w - 1, x)); y = Math.max(0, Math.min(d.h - 1, y)); } else if (x < 0 || y < 0 || x >= d.w || y >= d.h) return 0; const c = g[y][x]; return c ? 0.35 + lum(EGA[c]) * 0.65 : 0; };
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const c = g[y][x]; if (!c) continue;
      ac.fillStyle = EGA[c]; ac.fillRect(ox + x * S, oy + y * S, S, S);
      let nx = (H(x - 1, y) - H(x + 1, y)) * 2.2, ny = (H(x, y + 1) - H(x, y - 1)) * 2.2, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      nc.fillStyle = `rgb(${Math.round((nx * 0.5 + 0.5) * 255)},${Math.round((ny * 0.5 + 0.5) * 255)},${Math.round((nz * 0.5 + 0.5) * 255)})`;
      nc.fillRect(ox + x * S, oy + y * S, S, S);
    }
    for (const [cv, ctx] of [[alb, ac], [nrm, nc]]) {
      ctx.drawImage(cv, ox, oy, pw, 1, ox, oy - 1, pw, 1);
      ctx.drawImage(cv, ox, oy + ph - 1, pw, 1, ox, oy + ph, pw, 1);
      ctx.drawImage(cv, ox, oy - 1, 1, ph + 2, ox - 1, oy - 1, 1, ph + 2);
      ctx.drawImage(cv, ox + pw - 1, oy - 1, 1, ph + 2, ox + pw, oy - 1, 1, ph + 2);
    }
    spr[d.name] = { u: ox / N, v: 1 - (oy + ph) / N, uw: pw / N, vh: ph / N, w: d.w, h: d.h };
    cx += pw + 2; rowH = Math.max(rowH, ph + 2);
  }
  return { alb, nrm, spr, defs };
}

export function spriteDataURL(name, scale = 4) {
  const d = defineSprites().find(s => s.name === name); if (!d) return '';
  const c = document.createElement('canvas'); c.width = d.w * scale; c.height = d.h * scale; const x = c.getContext('2d');
  for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) { const k = d.g[j][i]; if (k) { x.fillStyle = EGA[k]; x.fillRect(i * scale, j * scale, scale, scale); } }
  return c.toDataURL();
}
