// Tile ids, slope maths, and level builders for the overworld and Zargoth's three biomes.
export const T = { EMPTY: 0, FILL: 1, BLOCK: 2, PLAT: 3, SPIKE: 4, CHOC: 5, R45: 6, L45: 7, R22A: 8, R22B: 9, L22A: 10, L22B: 11, DOOR_R: 12, DOOR_B: 13, BRIDGE: 14, BACK: 15, CRYS: 16, EXIT: 17, GRASS: 20, PATH: 21, RIVER: 22, TREE: 23, ROCK: 24 };
export const isSlope = t => t >= 6 && t <= 11;
export function slopeH(t, lx) {
  switch (t) { case 6: return lx; case 7: return 1 - lx; case 8: return lx / 2; case 9: return 0.5 + lx / 2; case 10: return 1 - lx / 2; case 11: return 0.5 - lx / 2; }
  return 0;
}
export const LEVEL_INFO = {
  crater: { name: 'Crater Fields', biome: 'crater', blurb: 'Twinkling crystal craters and chocolate pools.' },
  caves: { name: 'Crystal Caves', biome: 'caves', blurb: 'Dark, glittering tunnels over chocolate rivers.' },
  citadel: { name: "Mildred's Citadel", biome: 'citadel', blurb: 'A castle of cake, cookie doors and frozen chocolate.' }
};

class Builder {
  constructor(W, H) { this.W = W; this.H = H; this.m = new Uint8Array(W * H); this.hAt = new Float32Array(W).fill(-1); this.ents = []; this.items = []; this.plats = []; this.marks = {}; this.x = 0; this.h = 4; }
  set(x, y, t) { if (x >= 0 && x < this.W && y >= 0 && y < this.H) this.m[y * this.W + x] = t; }
  get(x, y) { return (x >= 0 && x < this.W && y >= 0 && y < this.H) ? this.m[y * this.W + x] : 0; }
  fill(x0, x1, y0, y1, t) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.set(x, y, t); return this; }
  col(x, h) { this.fill(x, x, 0, h - 1, T.FILL); this.hAt[x] = h; }
  run(segs) {
    for (const [k, n, label] of segs) {
      if (label) this.marks[label] = this.x;
      for (let i = 0; i < n; i++) {
        const x = this.x;
        if (k === 'flat') { this.col(x, this.h); this.x++; }
        else if (k === 'up') { this.col(x, this.h); this.set(x, this.h, T.R45); this.hAt[x] = this.h + 0.5; this.x++; this.h++; }
        else if (k === 'down') { this.h--; this.col(x, this.h); this.set(x, this.h, T.L45); this.hAt[x] = this.h + 0.5; this.x++; }
        else if (k === 'up22') { this.col(x, this.h); this.set(x, this.h, T.R22A); this.col(x + 1, this.h); this.set(x + 1, this.h, T.R22B); this.x += 2; this.h++; }
        else if (k === 'down22') { this.h--; this.col(x, this.h); this.set(x, this.h, T.L22A); this.col(x + 1, this.h); this.set(x + 1, this.h, T.L22B); this.x += 2; }
        else if (k === 'gap') { this.x++; }
        else if (k === 'choc') { this.set(x, 0, T.FILL); this.fill(x, x, 1, this.h - 2, T.CHOC); this.hAt[x] = this.h - 1; this.x++; }
        else if (k === 'spikes') { this.col(x, this.h); this.set(x, this.h, T.SPIKE); this.x++; }
      }
    }
    return this;
  }
  g(x) { return this.hAt[Math.floor(x)]; }
  ent(type, x, y, extra) { this.ents.push(Object.assign({ type, x, y: y ?? this.g(x) }, extra || {})); return this; }
  item(type, x, y) { this.items.push({ type, x: x + 0.5, y: y + 0.5, taken: false }); return this; }
  row(type, x0, n, y, step = 1) { for (let i = 0; i < n; i++) this.item(type, x0 + i * step, y); return this; }
  plat(x0, x1, y) { return this.fill(x0, x1, y, y, T.PLAT); }
  hover(x, y, bx, by, speed) { this.plats.push({ x, y, ax: x, ay: y, bx, by, w: 2, h: 0.5, speed: speed || 0.35, ph: 0, dx: 0, dy: 0 }); return this; }
  crys(x) { this.set(x, Math.ceil(this.g(x)), T.CRYS); return this; }
  walls() { this.fill(0, 0, 0, this.H - 1, T.BLOCK); this.fill(this.W - 1, this.W - 1, 0, this.H - 1, T.BLOCK); return this; }
  out(id, extra) { return Object.assign({ id, W: this.W, H: this.H, m: this.m, ents: this.ents, items: this.items, plats: this.plats, marks: this.marks }, LEVEL_INFO[id], extra); }
}

function crater() {
  const b = new Builder(192, 28);
  b.run([['flat', 14, 'start'], ['up', 2], ['flat', 6, 'p1'], ['down', 2], ['flat', 5], ['choc', 4, 'pool1'], ['flat', 8, 'g1'],
    ['up22', 2], ['flat', 10, 'top1'], ['gap', 3, 'gap1'], ['flat', 9, 'g2'], ['down22', 2], ['flat', 6], ['spikes', 4, 'sp1'], ['flat', 10, 'g3'],
    ['up', 3], ['flat', 8, 'mesa'], ['down', 3], ['choc', 6, 'pool2'], ['flat', 10, 'g4'], ['up22', 3], ['flat', 14, 'high'], ['down', 3],
    ['flat', 12, 'g5'], ['spikes', 3, 'sp2'], ['flat', 8, 'g6'], ['up', 2], ['flat', 22, 'end']]);
  b.walls();
  b.row('cheezie', 17, 4, 7).row('cheezie', 29, 4, 7).item('soda', 36, 5).row('choc', 46, 3, 8, 3);
  b.fill(49, 51, 10, 10, T.BLOCK).item('cookie', 50, 11);
  b.plat(107, 108, 5).row('cheezie', 105, 6, 8);
  b.row('cheezie', 72, 3, 5).row('choc', 94, 4, 8, 2).item('soda', 125, 9).row('cheezie', 128, 5, 8, 2);
  b.plat(131, 134, 12).item('keyRed', 132, 13).row('choc', 146, 3, 5, 3).item('cookie', 157, 7);
  b.fill(171, 171, 6, 7, T.DOOR_R).fill(171, 171, 8, 27, T.BLOCK);
  b.fill(186, 186, 6, 7, T.EXIT).row('cheezie', 175, 4, 7, 2);
  [10, 26, 60, 98, 118, 150, 178].forEach(x => b.crys(x));
  b.ent('gloop', 35).ent('gloop', 62).ent('gloop', 85).ent('hopper', 97).ent('hopper', 148).ent('marsh', 115).ent('pod', 136).ent('drone', 88.5, 7.5).ent('drone', 165.5, 7.5);
  return b.out('crater', { start: { x: 3, y: 4 } });
}

function caves() {
  const b = new Builder(176, 26); b.h = 5;
  b.run([['flat', 12, 'start'], ['down22', 1], ['flat', 8], ['choc', 8, 'river1'], ['flat', 10, 'g1'], ['up', 2], ['flat', 10, 'ledge'], ['down', 2], ['flat', 6, 'sw'],
    ['choc', 14, 'river2'], ['flat', 10, 'g2'], ['up22', 2], ['flat', 8], ['spikes', 3], ['flat', 12, 'g3'], ['down', 3], ['flat', 6], ['choc', 10, 'river3'],
    ['flat', 8, 'g4'], ['up', 3], ['flat', 12, 'g5'], ['down22', 1], ['flat', 20, 'end']]);
  b.fill(1, 40, 13, 25, T.FILL).fill(41, 80, 15, 25, T.FILL).fill(81, 120, 13, 25, T.FILL).fill(121, 174, 14, 25, T.FILL);
  b.fill(30, 33, 11, 12, T.FILL).fill(95, 97, 11, 12, T.FILL).fill(160, 161, 12, 13, T.FILL);
  b.walls();
  b.hover(22, 4, 27, 4, 0.3).hover(120, 3.5, 123, 6, 0.4).hover(125, 6, 128, 3.5, 0.4);
  b.ent('switch', 57, 4).fill(60, 73, 3, 3, T.BRIDGE);
  b.row('cheezie', 4, 5, 6).row('cheezie', 22, 6, 7).item('soda', 34, 5).row('choc', 43, 4, 8, 2).row('cheezie', 61, 7, 6, 2);
  b.plat(100, 103, 9).item('keyBlue', 101, 10).row('choc', 88, 3, 8, 2).item('cookie', 112, 7).row('cheezie', 120, 5, 9, 2).item('soda', 140, 7);
  b.fill(150, 150, 6, 13, T.DOOR_B);
  b.fill(170, 170, 5, 6, T.EXIT).row('cookie', 158, 2, 7, 3);
  [8, 18, 36, 47, 76, 92, 108, 133, 146, 165].forEach(x => b.crys(x));
  [[50, 14], [86, 12], [118, 12], [138, 13]].forEach(([x, y]) => b.set(x, y, T.CRYS));
  b.ent('bat', 35, 12).ent('bat', 66, 14).ent('bat', 92, 12).ent('bat', 105, 12).ent('bat', 158, 13);
  b.ent('beetle', 46).ent('beetle', 145).ent('hopper', 78).ent('gloop', 16).ent('gloop', 102).ent('pod', 108).ent('drone', 124.5, 8.5);
  b.ents.filter(e => e.type === 'bat').forEach(e => { e.y = e.y - 0.7; });
  return b.out('caves', { start: { x: 3, y: 5 } });
}

function citadel() {
  const b = new Builder(158, 26);
  b.run([['flat', 14, 'start'], ['up22', 2], ['flat', 8], ['down', 2], ['spikes', 3], ['flat', 10], ['up', 4, 'ramp'], ['flat', 10, 'top'], ['down', 4], ['flat', 12, 'g2'],
    ['choc', 6], ['flat', 12, 'g3'], ['up22', 2], ['flat', 14, 'g4'], ['down', 2], ['flat', 8, 'pre'], ['flat', 40, 'arena']]);
  b.fill(1, 116, 15, 25, T.FILL).fill(117, 156, 18, 25, T.FILL);
  b.fill(117, 117, 8, 17, T.BLOCK);
  b.fill(148, 156, 4, 8, T.BLOCK);
  b.walls();
  b.plat(124, 127, 8).plat(137, 140, 8);
  b.row('cookie', 18, 3, 8, 3).row('choc', 32, 5, 6, 2).row('cheezie', 45, 8, 10).item('soda', 60, 5).row('cheezie', 71, 6, 7).row('choc', 80, 4, 6, 2);
  b.plat(96, 99, 10).row('cookie', 96, 2, 11, 2).item('soda', 104, 7).row('cheezie', 109, 6, 6);
  b.fill(10, 10, 4, 4, T.CRYS); b.fill(64, 64, 4, 4, T.CRYS); b.fill(110, 110, 4, 4, T.CRYS);
  b.ent('roller', 50, 8).ent('marsh', 36).ent('sentry', 66, 8).ent('sentry', 101, 10).ent('phantom', 84).ent('phantom', 112).ent('beetle', 95);
  b.ent('boss', 138, 4).ent('terminal', 120, 4).ent('cage', 152, 9);
  return b.out('citadel', { start: { x: 3, y: 4 }, arena: { x0: 118, x1: 147, floor: 4 } });
}

export function buildLevel(id) { return id === 'caves' ? caves() : id === 'citadel' ? citadel() : crater(); }

export function buildOverworld() {
  const W = 60, H = 44, m = new Uint8Array(W * H);
  const set = (x, y, t) => { if (x >= 0 && x < W && y >= 0 && y < H) m[y * W + x] = t; };
  const get = (x, y) => (x >= 0 && x < W && y >= 0 && y < H) ? m[y * W + x] : T.RIVER;
  m.fill(T.GRASS);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) set(x, y, T.RIVER);
  for (let y = 0; y < H; y++) { set(24, y, T.RIVER); set(25, y, T.RIVER); }
  for (let x = 24; x < W; x++) { set(x, 22, T.RIVER); set(x, 23, T.RIVER); }
  const points = [
    { type: 'saucer', x: 8, y: 10, label: 'The spaghetti with meatballs flying saucer' },
    { type: 'level', id: 'crater', x: 12, y: 30 },
    { type: 'tele', id: 'tA', x: 20, y: 38, to: 'tB', req: 'crater' },
    { type: 'tele', id: 'tB', x: 29, y: 38, to: 'tA', req: 'crater' },
    { type: 'level', id: 'caves', x: 46, y: 35 },
    { type: 'tele', id: 'tB2', x: 53, y: 27, to: 'tC', req: 'caves' },
    { type: 'tele', id: 'tC', x: 53, y: 18, to: 'tB2', req: 'caves' },
    { type: 'level', id: 'citadel', x: 41, y: 8, big: true }
  ];
  const path = (x0, y0, x1, y1) => { const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0); for (let x = x0; x !== x1 + sx && sx; x += sx) set(x, y0, T.PATH); for (let y = y0; y !== y1 + sy && sy; y += sy) set(x1, y, T.PATH); set(x1, y1, T.PATH); };
  path(8, 9, 12, 30); path(12, 30, 20, 38); path(29, 38, 46, 35); path(46, 35, 53, 27); path(53, 18, 41, 8);
  let s = 99; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let x = 2; x < W - 2; x++) for (let y = 2; y < H - 2; y++) {
    if (get(x, y) !== T.GRASS) continue;
    let near = false;
    for (const p of points) if (Math.abs(p.x - x) < 3 && Math.abs(p.y - y) < 3) near = true;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (get(x + dx, y + dy) === T.PATH) near = true;
    if (!near) { const q = r(); if (q < 0.16) set(x, y, T.TREE); else if (q < 0.18) set(x, y, T.ROCK); }
  }
  return { id: 'map', W, H, m, points, start: { x: 9.2, y: 8.2 } };
}
