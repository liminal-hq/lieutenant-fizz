// Pixel font candidates for Lieutenant Fizz, drawn as glyph grids and rendered by <pixel-text>.
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
(function () {
  if (customElements.get('pixel-text')) return;

  // Master drawing ("Fizz"): rows from cap top, 7 cap rows + 2 descender rows.
  const RAW = {
    A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
    B: '####./#...#/#...#/####./#...#/#...#/####.',
    C: '.###./#...#/#..../#..../#..../#...#/.###.',
    D: '###../#..#./#...#/#...#/#...#/#..#./###..',
    E: '#####/#..../#..../####./#..../#..../#####',
    F: '#####/#..../#..../####./#..../#..../#....',
    G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
    H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
    I: '###/.#./.#./.#./.#./.#./###',
    J: '..###/...#./...#./...#./#..#./#..#./.##..',
    K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
    L: '#..../#..../#..../#..../#..../#..../#####',
    M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
    N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
    O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
    P: '####./#...#/#...#/####./#..../#..../#....',
    Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
    R: '####./#...#/#...#/####./#.#../#..#./#...#',
    S: '.###./#...#/#..../.###./....#/#...#/.###.',
    T: '#####/..#../..#../..#../..#../..#../..#..',
    U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
    V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
    W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
    X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
    Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
    Z: '#####/....#/...#./..#../.#.../#..../#####',
    a: '...../...../.###./....#/.####/#...#/.####',
    b: '#..../#..../####./#...#/#...#/#...#/####.',
    c: '...../...../.###./#..../#..../#...#/.###.',
    d: '....#/....#/.####/#...#/#...#/#...#/.####',
    e: '...../...../.###./#...#/#####/#..../.###.',
    f: '..##/.#../####/.#../.#../.#../.#..',
    g: '...../...../.####/#...#/#...#/#...#/.####/....#/.###.',
    h: '#..../#..../####./#...#/#...#/#...#/#...#',
    i: '.#./.../##./.#./.#./.#./###',
    j: '..#/.../.##/..#/..#/..#/..#/#.#/.#.',
    k: '#.../#.../#..#/#.#./##../#.#./#..#',
    l: '##./.#./.#./.#./.#./.#./###',
    m: '...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#',
    n: '...../...../####./#...#/#...#/#...#/#...#',
    o: '...../...../.###./#...#/#...#/#...#/.###.',
    p: '...../...../####./#...#/#...#/#...#/####./#..../#....',
    q: '...../...../.####/#...#/#...#/#...#/.####/....#/....#',
    r: '...../...../#.##./##..#/#..../#..../#....',
    s: '...../...../.####/#..../.###./....#/####.',
    t: '.#../.#../####/.#../.#../.#../..##',
    u: '...../...../#...#/#...#/#...#/#...#/.####',
    v: '...../...../#...#/#...#/#...#/.#.#./..#..',
    w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
    x: '...../...../#...#/.#.#./..#../.#.#./#...#',
    y: '...../...../#...#/#...#/#...#/#...#/.####/....#/.###.',
    z: '...../...../#####/...#./..#../.#.../#####',
    0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
    1: '..#../.##../..#../..#../..#../..#../.###.',
    2: '.###./#...#/....#/...#./..#../.#.../#####',
    3: '.###./#...#/....#/..##./....#/#...#/.###.',
    4: '...#./..##./.#.#./#..#./#####/...#./...#.',
    5: '#####/#..../####./....#/....#/#...#/.###.',
    6: '..##./.#.../#..../####./#...#/#...#/.###.',
    7: '#####/....#/...#./..#../.#.../.#.../.#...',
    8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
    9: '.###./#...#/#...#/.####/....#/...#./.##..',
    '.': './././././././#',
    ',': '../../../../../.#/.#/#.',
    ':': '././#/./././#',
    ';': '../../.#/../../../.#/#.',
    '!': '#/#/#/#/#/./#',
    '?': '.###./#...#/....#/...#./..#../...../..#..',
    "'": '#/#',
    '"': '#.#/#.#',
    '-': '..../..../..../####',
    '(': '..#/.#./#../#../#../.#./..#',
    ')': '#../.#./..#/..#/..#/.#./#..',
    '[': '##/#./#./#./#./#./##',
    ']': '##/.#/.#/.#/.#/.#/##',
    '/': '....#/....#/...#./..#../.#.../#..../#....',
    '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
    '+': '...../..#../..#../#####/..#../..#../.....',
    '=': '...../...../#####/...../#####',
    '#': '.#.#./#####/.#.#./.#.#./#####/.#.#.',
    '%': '##..#/##.#./...#./..#../.#.../.#.##/#..##',
    '*': '...../#.#.#/.###./#####/.###./#.#.#',
    '×': '...../#...#/.#.#./..#../.#.#./#...#',
    '·': '././././#',
    '—': '......./......./......./#######',
    '–': '...../...../...../#####',
    '…': '...../...../...../...../...../...../#.#.#',
    '‘': '.#/#./##',
    '’': '##/.#/#.',
    '“': '.#.#/#.#./####',
    '”': '####/.#.#/#.#.',
    '«': '...../..#.#/.#.#./#.#../.#.#./..#.#',
    '»': '...../#.#../.#.#./..#.#/.#.#./#.#..',
    '→': '...../..#../...#./#####/...#./..#..',
    '←': '...../..#../.#.../#####/.#.../..#..',
    '↑': '..#../.###./#.#.#/..#../..#../..#../..#..',
    '↓': '..#../..#../..#../..#../#.#.#/.###./..#..',
    '►': '#.../##../###./####/###./##../#...',
    '◄': '...#/..##/.###/####/.###/..##/...#',
    '▸': '.../#../##./###/##./#../...',
    '‽': '.###./#.#.#/..#.#/..##./..#../...../..#..',
    '🙂': '.#####./#######/##.#.##/#######/#.###.#/##...##/.#####.',
    '😀': '.#####./#######/##.#.##/#######/#.....#/##...##/.#####.',
    '😉': '.#####./#######/##.####/####..#/#.###.#/##...##/.#####.',
    '😮': '.#####./#######/##.#.##/#######/###.###/###.###/.#####.',
    '😢': '.#####./#######/##.#.##/##.####/##...##/#.###.#/.#####.',
    '😠': '.#####./#.###.#/##.#.##/#######/##...##/#.###.#/.#####.',
    '😎': '.#####./#######/#..#..#/##.#.##/#.###.#/##...##/.#####.',
    '❤': '.##.##./#######/#######/.#####./..###../...#.../.......',
    '⭐': '...#.../...#.../#######/.#####./..###../.##.##./.#...#.',
    '✓': '......./......#/.....##/#...##./##.##../.###.../..#....',
    '✗': '......./##...##/.##.##./..###../.##.##./##...##/.......',
    '👍': '...#.../..##.../..#..../##.####/##.###./##.####/##.###.',
    '🍁': '...#.../#.###.#/#######/.#####./.##.##./...#.../...#...',
    '👽': '.#####./#######/#..#..#/##.#.##/.#####./..###../...#...',
    '🛸': '......./..###../.#####./#######/#.#.#.#/.#####./.#...#.',
    '🥤': '..###../.#####./.#####./.#...#./.#####./.#####./..###..',
    '☕': '..#.#../.#.#.../......./######./#####.#/######./.####..',
    '💾': '######./#.###.#/#.###.#/#######/#.....#/#.....#/#######',
    '🎮': '......./.#####./##.####/#...#.#/##.####/##...##/.......',
    '🔊': '...#..../..##.#../####..#./####..#./####..#./..##.#../...#....',
    '🔇': '...#..../..##..../####.#.#/####..#./####.#.#/..##..../...#....',
    '🔒': '..###../.#...#./.#...#./#######/###.###/###.###/#######',
    '⚡': '...###/..###./.###../######/..###./.###../.#....',
    '🏆': '#######/#.###.#/.#####./..###../...#.../..###../.#####.',
  };
  const EMOJI = new Set(Array.from('🙂😀😉😮😢😠😎❤⭐✓✗👍🍁👽🛸🥤☕💾🎮🔊🔇🔒⚡🏆'));
  const NO_SHAPE = new Set(['→', '←', '↑', '↓', '►', '◄', '▸', '«', '»', ...EMOJI]);
  const WIDE = new Set([...EMOJI, '‽', 'M', 'W', 'm', 'w', '1', '%', '#', '*', '×', '&', '+', '=', '/', '…', '«', '»', '—', '–', '→', '←', '↑', '↓', '►', '◄', '▸']);

  const parse = (s) => s.split('/').map((r) => Array.from(r, (c) => (c === '#' ? 1 : 0)));
  const blank = (w, h) => Array.from({ length: h }, () => new Array(w).fill(0));
  const width = (rows) => rows.reduce((m, r) => Math.max(m, r.length), 0);
  const pad = (rows, H, top) => {
    const w = width(rows);
    const out = blank(w, H);
    rows.forEach((r, y) => r.forEach((v, x) => { if (out[y + top]) out[y + top][x] = v; }));
    return out;
  };

  // ---- transforms ----
  const stretch = (rows, dups) => {
    const out = [];
    rows.forEach((r, y) => { out.push(r.slice()); if (dups.includes(y)) out.push(r.slice()); });
    return out;
  };
  const condense = (rows, ch) => {
    const w = width(rows);
    if (w !== 5 || WIDE.has(ch)) return rows.map((r) => r.slice());
    return rows.map((r) => [r[0], r[1] | r[2], r[2] | r[3], r[4]]);
  };
  const bold = (rows) => rows.map((r) => { const o = new Array(r.length + 1).fill(0); r.forEach((v, x) => { if (v) { o[x] = 1; if (!r[x + 2] || r[x + 1]) o[x + 1] = 1; } }); return o; });
  const oblique = (rows, base) => {
    const sh = rows.map((_, y) => Math.floor((base - y) / 3));
    const min = Math.min(...sh), max = Math.max(...sh);
    const w = width(rows) + (max - min);
    const out = rows.map((r, y) => { const o = new Array(w).fill(0); r.forEach((v, x) => { if (v) o[x + sh[y] - min] = 1; }); return o; });
    out.adv = width(rows); out.ox = min;
    return out;
  };
  const squareify = (rows) => {
    const H = rows.length, w = width(rows);
    const at = (x, y) => (y >= 0 && y < H && x >= 0 && x < w ? rows[y][x] : 0);
    let top = H, bot = -1, left = w, right = -1;
    rows.forEach((r, y) => r.forEach((v, x) => { if (v) { top = Math.min(top, y); bot = Math.max(bot, y); left = Math.min(left, x); right = Math.max(right, x); } }));
    const out = rows.map((r) => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
      if (at(x, y)) continue;
      const edge = x === left || x === right || y === top || y === bot;
      if (!edge) continue;
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if (at(x + dx, y) && at(x, y + dy) && !at(x + dx, y + dy)) { out[y][x] = 1; break; }
      }
    }
    return out;
  };
  const trim = (rows) => {
    const w = width(rows);
    let l = 0, r = w - 1;
    const colEmpty = (x) => rows.every((row) => !row[x]);
    while (l < w && colEmpty(l)) l++;
    while (r > l && colEmpty(r)) r--;
    return rows.map((row) => row.slice(l, r + 1));
  };

  const MARKS = { acute: parse('.#/#.'), grave: parse('#./.#'), circ: parse('.#./#.#'), diaer: parse('#.#'), ced: parse('.#/##') };
  const ACCENTS = [
    ['é', 'e', 'acute'], ['è', 'e', 'grave'], ['ê', 'e', 'circ'], ['ë', 'e', 'diaer'],
    ['à', 'a', 'grave'], ['â', 'a', 'circ'], ['ç', 'c', 'ced'], ['ô', 'o', 'circ'],
    ['û', 'u', 'circ'], ['ù', 'u', 'grave'], ['î', 'ı', 'circ'], ['ï', 'ı', 'diaer'],
    ['É', 'E', 'acute'], ['È', 'E', 'grave'], ['Ê', 'E', 'circ'], ['À', 'A', 'grave'], ['Ç', 'C', 'ced'], ['Ô', 'O', 'circ'],
  ];

  function finish(font) {
    const g = font.glyphs, { cap, xh } = font;
    const xTop = 2 + cap - xh;
    const dl = g.i.map((r, y) => (y < xTop ? r.map(() => 0) : r.slice()));
    g['ı'] = dl;
    for (const [ch, base, mark] of ACCENTS) {
      const src = g[base];
      if (!src) continue;
      const m = MARKS[mark];
      const rows = src.map((r) => r.slice());
      const w = width(rows), mw = width(m);
      const off = Math.floor((w - mw) / 2);
      const upper = base === base.toUpperCase() && base !== 'ı';
      const r0 = mark === 'ced' ? 2 + cap : upper ? 0 : Math.max(0, xTop - 3);
      m.forEach((mr, y) => mr.forEach((v, x) => { if (v && rows[r0 + y]) rows[r0 + y][x + off] = 1; }));
      g[ch] = rows;
    }
    // box drawing, generated to the full cell so lines join
    const H = font.H, W = 6, mid = 2 + Math.floor(cap / 2), c = 2;
    const box = (fn) => { const r = blank(W, H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fn(x, y)) r[y][x] = 1; return r; };
    const J = font.joiners = new Set();
    const add = (ch, fn) => { g[ch] = box(fn); J.add(ch); };
    add('─', (x, y) => y === mid);
    add('│', (x, y) => x === c);
    add('┌', (x, y) => (y === mid && x >= c) || (x === c && y >= mid));
    add('┐', (x, y) => (y === mid && x <= c) || (x === c && y >= mid));
    add('└', (x, y) => (y === mid && x >= c) || (x === c && y <= mid));
    add('┘', (x, y) => (y === mid && x <= c) || (x === c && y <= mid));
    add('═', (x, y) => y === mid - 1 || y === mid + 1);
    add('║', (x, y) => x === 1 || x === 3);
    add('╔', (x, y) => (y === mid - 1 && x >= 1) || (x === 1 && y >= mid - 1) || (y === mid + 1 && x >= 3) || (x === 3 && y >= mid + 1));
    add('╗', (x, y) => (y === mid - 1 && x <= 3) || (x === 3 && y >= mid - 1) || (y === mid + 1 && x <= 1) || (x === 1 && y >= mid + 1));
    add('╚', (x, y) => (y === mid + 1 && x >= 1) || (x === 1 && y <= mid + 1) || (y === mid - 1 && x >= 3) || (x === 3 && y <= mid - 1));
    add('╝', (x, y) => (y === mid + 1 && x <= 3) || (x === 3 && y <= mid + 1) || (y === mid - 1 && x <= 1) || (x === 1 && y <= mid - 1));
    font.space = Math.max(3, Math.round(cap * 0.45));
    font.cache = {};
    return font;
  }

  const master = {};
  for (const [ch, s] of Object.entries(RAW)) master[ch] = pad(parse(s), 11, 2);
  const mapG = (src, fn) => { const o = {}; for (const [ch, rows] of Object.entries(src)) o[ch] = fn(rows, ch); return o; };

  const FONTS = {};
  FONTS.fizz = finish({ cap: 7, xh: 5, H: 11, glyphs: mapG(master, (r) => r.map((x) => x.slice())) });
  FONTS.zargoth = finish({ cap: 7, xh: 5, H: 11, glyphs: mapG(master, (r, ch) => (NO_SHAPE.has(ch) ? r.map((x) => x.slice()) : squareify(r))) });
  const tall = mapG(master, (r, ch) => stretch(condense(r, ch), [3, 7]));
  FONTS.billy = finish({ cap: 9, xh: 6, H: 13, glyphs: tall });
  FONTS.colossus = finish({ cap: 9, xh: 6, H: 13, heavy: true, glyphs: mapG(master, (r, ch) => { const s = stretch(r, [3, 7]); return NO_SHAPE.has(ch) || ch === '1' ? s : bold(s); }) });
  const sc = mapG(master, (r) => r.map((x) => x.slice()));
  const PICK = { M: [0, 1, 2, 4, 6], N: [0, 1, 2, 3, 6], W: [0, 2, 4, 5, 6] };
  for (const C of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const src = master[C], pick = PICK[C] || [0, 2, 3, 4, 6];
    const rows = blank(width(src), 11);
    pick.forEach((p, i) => { rows[4 + i] = src[2 + p].slice(); });
    sc[C.toLowerCase()] = rows;
  }
  FONTS.mildred = finish({ cap: 7, xh: 5, H: 11, glyphs: sc });

  function glyph(font, ch, cut) {
    const key = cut + ch;
    if (font.cache[key]) return font.cache[key];
    let rows = font.glyphs[ch] || font.glyphs['?'];
    if (!font.joiners.has(ch) && !EMOJI.has(ch)) {
      if (cut === 'bold') { if (!font.heavy) rows = bold(rows); }
      else if (cut === 'condensed') rows = condense(rows, ch);
      else if (cut === 'oblique') rows = oblique(rows, 1 + font.cap);
    }
    return (font.cache[key] = rows);
  }
  function cellWidth(font, cut) {
    const k = '#cell' + cut;
    if (font.cache[k]) return font.cache[k];
    let m = 0;
    for (const ch of 'ABCDEFGHIJKLNOPQRSTUVXYZabcdefghijklnopqrstuvxyz0123456789') m = Math.max(m, width(trim(glyph(font, ch, cut))));
    return (font.cache[k] = m);
  }

  function tokens(text) {
    text = text.replace(/\uFE0F/g, '');
    const out = [];
    const re = /\{([^}]+)\}/g;
    let i = 0, m;
    while ((m = re.exec(text))) {
      for (const ch of text.slice(i, m.index)) out.push(ch);
      out.push({ btn: m[1] });
      i = re.lastIndex;
    }
    for (const ch of text.slice(i)) out.push(ch);
    return out;
  }

  // Lays text into a mask: 1 = ink, 2 = knocked-out ink (button letters).
  function layout(text, fontKey, cut, mono) {
    const font = FONTS[fontKey] || FONTS.fizz;
    const H = font.H, rowsTotal = H + 3, oy = 1;
    const items = [];
    let x = cut === 'oblique' ? 2 : 0;
    const cell = cellWidth(font, cut);
    for (const t of tokens(text)) {
      if (typeof t === 'object') {
        let label = t.btn;
        const forceKey = label.startsWith('[');
        if (forceKey) label = label.replace(/^\[/, '').replace(/\]$/, '');
        if (label.length === 1 && !forceKey) {
          const d = H + 2;
          items.push({ kind: 'disc', x, d, g: trim(glyph(font, label, 'regular')) });
          x += d + 2;
        } else {
          const gs = Array.from(label, (c) => glyph(font, c, 'regular'));
          const tw = gs.reduce((s, g) => s + width(g) + 1, -1);
          const bw = tw + 6;
          items.push({ kind: 'key', x, bw, gs });
          x += bw + 2;
        }
        continue;
      }
      if (t === ' ') { x += mono ? cell + 1 : font.space; continue; }
      const g = glyph(font, t, cut);
      const w = width(g);
      if (font.joiners.has(t)) { items.push({ kind: 'g', x, g }); x += w; continue; }
      if (mono) { const tg = trim(g); const tw = width(tg); items.push({ kind: 'g', x: x + Math.floor((cell - tw) / 2), g: tg }); x += Math.max(cell, tw) + 1; }
      else { items.push({ kind: 'g', x: x + (g.ox || 0), g }); x += (g.adv ?? w) + 1; }
    }
    const W = Math.max(1, x + (cut === 'oblique' ? 3 : 0));
    const mask = blank(W, rowsTotal);
    const set = (px, py, v) => { if (py >= 0 && py < rowsTotal && px >= 0 && px < W) mask[py][px] = v; };
    for (const it of items) {
      if (it.kind === 'g') it.g.forEach((r, y) => r.forEach((v, gx) => { if (v) set(it.x + gx, y + oy, 1); }));
      else if (it.kind === 'disc') {
        const d = it.d, rr = d / 2;
        for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
          const dx = i + 0.5 - rr, dy = j + 0.5 - rr;
          if (dx * dx + dy * dy <= rr * rr - 0.3) set(it.x + i, j, 1);
        }
        const gx = it.x + Math.floor((d - width(it.g)) / 2);
        it.g.forEach((r, y) => r.forEach((v, xx) => { if (v) set(gx + xx, y + oy, 2); }));
      } else {
        const bw = it.bw;
        for (let i = 1; i < bw - 1; i++) { set(it.x + i, 0, 1); set(it.x + i, rowsTotal - 1, 1); set(it.x + i, rowsTotal - 2, 1); }
        for (let j = 1; j < rowsTotal - 1; j++) { set(it.x, j, 1); set(it.x + bw - 1, j, 1); }
        let gx = it.x + 3;
        for (const g of it.gs) { g.forEach((r, y) => r.forEach((v, xx) => { if (v) set(gx + xx, y + oy, 1); })); gx += width(g) + 1; }
      }
    }
    return { mask, W, H: rowsTotal, font };
  }

  function draw(el) {
    const a = (n) => el.getAttribute(n);
    const text = a('text') ?? '';
    const cut = a('cut') || 'regular';
    const mono = a('mono') === 'true' || a('mono') === '';
    const scale = Math.max(1, parseInt(a('scale') || '3', 10));
    const color = a('color') || '#e0e0e0';
    const knock = a('knock') || '#050507';
    const outline = a('outline');
    const shadows = (a('shadow') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const bands = (a('bands') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const dither = a('dither') === 'true';
    const { mask, W, H, font } = layout(text, a('font'), cut, mono);
    const o = outline ? 1 : 0;
    const LW = W + o * 2, LH = H + o * 2 + shadows.length;
    const dpr = window.devicePixelRatio || 1;
    const c = el._c;
    c.width = Math.round(LW * scale * dpr);
    c.height = Math.round(LH * scale * dpr);
    c.style.width = LW * scale + 'px';
    c.style.height = LH * scale + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    const each = (fn) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y][x]) fn(x, y, mask[y][x]); };
    const ink = (x, y, dx, dy, grow) => {
      if (grow) ctx.fillRect(x + o + dx - 1, y + o + dy - 1, 3, 3); else ctx.fillRect(x + o + dx, y + o + dy, 1, 1);
    };
    for (let s = shadows.length - 1; s >= 0; s--) {
      ctx.fillStyle = shadows[s];
      each((x, y) => {
        const dx = dither ? s + 1 : 0, dy = s + 1;
        if (dither && (x + y) % 2) return;
        ink(x, y, dx, dy, !!outline);
      });
    }
    if (outline) { ctx.fillStyle = outline; each((x, y) => ink(x, y, 0, 0, true)); }
    const cap = font.cap;
    each((x, y, v) => {
      if (v === 2) ctx.fillStyle = knock;
      else if (bands.length) {
        const t = Math.min(bands.length - 1, Math.max(0, Math.floor(((y - 3) / cap) * bands.length)));
        ctx.fillStyle = bands[t];
      } else ctx.fillStyle = color;
      ink(x, y, 0, 0, false);
    });
  }

  const ATTRS = ['text', 'font', 'cut', 'mono', 'scale', 'color', 'knock', 'outline', 'shadow', 'bands', 'dither'];
  class PixelText extends HTMLElement {
    static get observedAttributes() { return ATTRS; }
    connectedCallback() {
      this.style.display = 'inline-block';
      this.style.lineHeight = '0';
      if (!this._c) {
        this._c = document.createElement('canvas');
        this._c.style.imageRendering = 'pixelated';
        this._c.style.display = 'block';
        this.appendChild(this._c);
      }
      draw(this);
    }
    attributeChangedCallback() { if (this._c) draw(this); }
  }
  for (const n of ATTRS) {
    Object.defineProperty(PixelText.prototype, n, {
      get() { return this.getAttribute(n); },
      set(v) { if (v == null || v === false) this.removeAttribute(n); else this.setAttribute(n, v === true ? '' : String(v)); },
    });
  }
  customElements.define('pixel-text', PixelText);
  window.LFPixelFonts = FONTS;
})();
