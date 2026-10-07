// Lieutenant Fizz engine. JS stands in for the Rust/WASM core: fixed-step f64 simulation writes
// straight into one pre-allocated Float32Array (20 floats/instance) that Three.js draws in a single call.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { buildAtlas } from './sprites.js';
import { T, isSlope, slopeH, buildLevel, buildOverworld, LEVEL_INFO } from './levels.js';

const STEP = 1 / 60, MAX = 120000, G = 60, STRIDE = 20;
const SAVE_AUTO = 'mab-save-auto-v1', SAVE_QUICK = 'mab-save-quick-v1';
const POINTS = { cheezie: 1, choc: 2, cookie: 5 };
const BIOME = {
  crater: { clear: 0x5555ff, amb: [1, 1, 1], night: [0.32, 0.28, 0.42], lm: 0.55, lantern: true, layers: [{ kind: 'stars', nightOnly: true }, { kind: 'hills', s: 'mtnTop', tint: 0xaa00aa, nt: 0x3a1858, f: 0.22, base: 4.5, amp: 2 }, { kind: 'hills', s: 'hillTop', tint: 0x00aa00, nt: 0x14102a, f: 0.5, base: 3.5, amp: 1.5 }], crys: 'crysM', lc: [1.0, 0.67, 0.3] },
  caves: { clear: 0x000000, amb: [0.85, 0.85, 0.95], night: [0.14, 0.12, 0.24], lm: 0.6, lantern: true, layers: [{ kind: 'wall', s: 'cavesBack', tint: 0x50506a, nt: 0x9a9a9a, f: 0.5 }], crys: 'crysC', lc: [0.35, 1.1, 1.2] },
  citadel: { clear: 0x000000, amb: [0.95, 0.9, 0.95], night: [0.3, 0.24, 0.32], lm: 0.6, lantern: true, layers: [{ kind: 'wall', s: 'citadelBack', tint: 0x8a4a70, nt: 0x8a6a7a, f: 0.6 }], crys: 'crysM', lc: [1.2, 0.5, 1.1] }
};
const ENT = {
  gloop: { w: 0.9, h: 0.6, stun: true }, hopper: { w: 0.9, h: 0.9, stun: true }, marsh: { w: 0.9, h: 0.9, inv: true, harmless: true },
  beetle: { w: 1.0, h: 0.75, stun: true }, bat: { w: 0.8, h: 0.7, stun: true, fly: true }, pod: { w: 0.8, h: 1.0, stun: true, harmless: true },
  phantom: { w: 0.8, h: 1.4, stun: true }, roller: { w: 1.9, h: 1.9, inv: true }, sentry: { w: 1.4, h: 0.9, stun: true, fly: true },
  drone: { w: 0.9, h: 0.6, inv: true, fly: true }, boss: { w: 2.8, h: 2.7, boss: true }, switch: { w: 0.8, h: 1, harmless: true, prop: true },
  terminal: { w: 1, h: 1.5, harmless: true, prop: true }, cage: { w: 1, h: 1.5, harmless: true, prop: true }
};
const solidT = t => t === T.FILL || t === T.BLOCK || t === T.DOOR_R || t === T.DOOR_B || t === T.RIVER || t === T.TREE || t === T.ROCK;
const hashf = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const ov = (a, bx, by, bw, bh) => a.x < bx + bw && a.x + a.w > bx && a.y < by + bh && a.y + a.h > by;

export class Engine {
  constructor(host, fx, onEvent) {
    this.host = host; this.fxHost = fx; this.emit = onEvent || (() => {});
    this.opts = { lighting: true, normals: true, poster: false, culling: true, stress: false, captions: true, night: false };
    this.zoom = 1; this.mode = 'attract'; this.paused = false; this.keys = {}; this.prevH = {}; this.held = {}; this.edge = {};
    this.tickCount = 0; this.fpsE = 60; this.statT = 0; this.capT = {}; this.game = null; this.camX = 0; this.camY = 0;
  }

  async init() {
    const A = buildAtlas(); this.spr = A.spr;
    this.setupRenderer(A);
    this.bindInput();
    this.loadAttract();
    this.last = performance.now(); this.acc = 0;
    const loop = t => { if (this.dead) return; this.raf = requestAnimationFrame(loop); this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  }
  destroy() {
    this.dead = true; cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku); window.removeEventListener('blur', this.bl);
    this.host.removeEventListener('wheel', this.wh); if (this.ro) this.ro.disconnect();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }

  setupRenderer(A) {
    const r = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    if (!r.capabilities.isWebGL2) throw new Error('WebGL2 is not available');
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.domElement.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;';
    this.host.appendChild(r.domElement); this.renderer = r;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10); this.cam.position.z = 5;
    this.scene = new THREE.Scene();
    const tex = c => { const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
    const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.setIndex(base.index); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const buf = new Float32Array(MAX * STRIDE);
    for (let i = 0; i < MAX; i++) { buf[i * STRIDE + 10] = 1; buf[i * STRIDE + 15] = 1; }
    const ib = new THREE.InstancedInterleavedBuffer(buf, STRIDE, 1); ib.setUsage(THREE.DynamicDrawUsage);
    ['iM0', 'iM1', 'iM2', 'iM3', 'iData'].forEach((n, k) => g.setAttribute(n, new THREE.InterleavedBufferAttribute(ib, 4, k * 4)));
    g.instanceCount = 0; this.buf = buf; this.ib = ib; this.geo = g;
    this.uLP = Array.from({ length: 16 }, () => new THREE.Vector4()); this.uLC = Array.from({ length: 16 }, () => new THREE.Vector3());
    this.lightPool = Array.from({ length: 256 }, () => ({ x: 0, y: 0, z: 0, r: 0, cr: 0, cg: 0, cb: 0, d: 0 }));
    this.uniforms = {
      uAlb: { value: tex(A.alb) }, uNrm: { value: tex(A.nrm) }, uAmb: { value: new THREE.Vector3(1, 1, 1) }, uNL: { value: 0 },
      uLP: { value: this.uLP }, uLC: { value: this.uLC }, uLighting: { value: 1 }, uNormals: { value: 1 }, uPoster: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        attribute vec4 iM0; attribute vec4 iM1; attribute vec4 iM2; attribute vec4 iM3; attribute vec4 iData;
        varying vec2 vUv; varying vec3 vTint; varying float vA; varying float vEm; varying vec2 vWorld; varying float vFlip; varying float vAct;
        void main(){
          mat4 m = mat4(vec4(iM0.xyz, 0.0), vec4(iM1.xyz, 0.0), iM2, iM3);
          vec4 wp = m * vec4(position, 1.0);
          vWorld = wp.xy;
          vUv = iData.xy + uv * vec2(iM0.w, iM1.w);
          float t = iData.z;
          vTint = vec3(floor(t / 65536.0), mod(floor(t / 256.0), 256.0), mod(t, 256.0)) / 255.0;
          float act = step(3.5, iData.w); float w2 = iData.w - 4.0 * act; vEm = step(1.5, w2); vA = w2 - 2.0 * vEm; vAct = act;
          vFlip = sign(iM0.x);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform sampler2D uAlb; uniform sampler2D uNrm; uniform vec3 uAmb; uniform int uNL;
        uniform vec4 uLP[16]; uniform vec3 uLC[16]; uniform float uLighting; uniform float uNormals; uniform float uPoster;
        varying vec2 vUv; varying vec3 vTint; varying float vA; varying float vEm; varying vec2 vWorld; varying float vFlip; varying float vAct;
        void main(){
          vec4 c = texture2D(uAlb, vUv);
          if (c.a < 0.5) discard;
          vec3 base = c.rgb * vTint;
          if (uLighting < 0.5 || vEm > 0.5) { gl_FragColor = vec4(base, vA); return; }
          vec3 n = texture2D(uNrm, vUv).xyz * 2.0 - 1.0; n.x *= vFlip;
          if (uNormals < 0.5) n = vec3(0.0, 0.0, 1.0);
          n = normalize(n);
          vec3 L = uAmb;
          for (int i = 0; i < 16; i++) {
            if (i >= uNL) break;
            vec3 d = vec3(uLP[i].xy - vWorld, uLP[i].z);
            float att = clamp(1.0 - length(d) / uLP[i].w, 0.0, 1.0); att *= att;
            L += uLC[i] * max(dot(n, normalize(d)), 0.0) * att;
          }
          if (vAct > 0.5) L = max(L, vec3(0.62));
          if (uPoster > 0.5) L = floor(L * 4.0 + 0.5) / 4.0;
          gl_FragColor = vec4(base * L, vA);
        }`
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.scene.add(this.mesh);
    const resize = () => { const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1; r.setSize(w, h, false); this.vw = w; this.vh = h; };
    resize(); this.ro = new ResizeObserver(resize); this.ro.observe(this.host);
  }

  // ---------- Input: keyboard (Keen + modern layouts) and gamepad ----------
  bindInput() {
    const mapped = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'KeyZ', 'KeyX', 'KeyC', 'Enter', 'Escape', 'F5', 'F9', 'Tab']);
    this.kd = e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (mapped.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.emit('pause');
      if (e.code === 'Enter') { this.enterHit = true; this.emit('confirm'); }
      if (e.code === 'F5') this.quickSave();
      if (e.code === 'F9') this.quickLoad();
      if (e.code === 'Backquote') this.emit('togglePanel');
      if (e.code === 'Minus') this.setZoom(this.zoom / 1.25);
      if (e.code === 'Equal') this.setZoom(this.zoom * 1.25);
      if (e.code === 'Digit0') this.setZoom(1);
    };
    this.ku = e => { this.keys[e.code] = false; if (e.code.startsWith('Alt')) e.preventDefault(); };
    this.bl = () => { this.keys = {}; };
    window.addEventListener('keydown', this.kd); window.addEventListener('keyup', this.ku); window.addEventListener('blur', this.bl);
    this.wh = e => { e.preventDefault(); this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0015)); };
    this.host.addEventListener('wheel', this.wh, { passive: false });
  }
  readInput() {
    const k = this.keys, h = this.held;
    h.left = !!(k.ArrowLeft || k.KeyA); h.right = !!(k.ArrowRight || k.KeyD); h.up = !!(k.ArrowUp || k.KeyW); h.down = !!(k.ArrowDown || k.KeyS);
    h.jump = !!(k.ControlLeft || k.ControlRight || k.KeyZ); h.pogo = !!(k.AltLeft || k.AltRight || k.KeyX); h.fire = !!(k.Space || k.KeyC); h.start = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = false;
    for (const gp of pads) {
      if (!gp) continue; pad = true;
      const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      h.left = h.left || b(14) || ax < -0.4; h.right = h.right || b(15) || ax > 0.4; h.up = h.up || b(12) || ay < -0.5; h.down = h.down || b(13) || ay > 0.5;
      h.jump = h.jump || b(0); h.pogo = h.pogo || b(1) || b(3); h.fire = h.fire || b(2) || b(7); h.start = h.start || b(9);
    }
    this.padConnected = pad;
    for (const key in h) { this.edge[key] = h[key] && !this.prevH[key]; this.prevH[key] = h[key]; }
    if (this.edge.start) this.emit(this.mode === 'level' || this.mode === 'map' ? 'pause' : 'confirm');
    if (this.paused || this.mode === 'cine' || this.mode === 'attract') { if (this.edge.jump || this.edge.fire) this.emit('advance'); }
    if (this.paused || this.mode === 'attract') { if (this.edge.up) this.emit('nav', -1); if (this.edge.down) this.emit('nav', 1); }
  }
  setZoom(z) { this.zoom = Math.max(0.05, Math.min(3, z)); }
  setOpt(k, v) { this.opts[k] = v; }
  setPaused(p) { this.paused = p; }

  // ---------- Game flow ----------
  freshGame() { return { lives: 3, score: 0, nextLife: 100, ammo: 5, done: {}, mapPos: null }; }
  loadAttract() { this.mode = 'attract'; this.sim = this.makeLevel('crater'); this.sim.p.hidden = true; }
  newGame() { this.game = this.freshGame(); this.startCine(0); this.hud(); }
  startCine(stage) {
    if (this.mode !== 'cine') {
      this.mode = 'cine';
      const st = []; for (let i = 0; i < 260; i++) st.push({ x: (hashf(i, 1) - 0.5) * 60, y: (hashf(i, 2) - 0.5) * 30, z: 0.2 + hashf(i, 3) * 0.8 });
      this.sim = { kind: 'cine', t: 0, st, stage: 0, stT: 0, camX: 0, camY: 0, pcx: 0, pcy: 0, fx: [], sx: 0, sy: 2 };
    }
    const s = this.sim; s.stage = stage; s.stT = 0; s.ly = -4.4; s.scroll = 0;
    if (stage === 3) { s.sx = 0; s.sy = 0.5; s.fx = []; }
  }
  hasSave() { try { return !!localStorage.getItem(SAVE_AUTO) || !!localStorage.getItem(SAVE_QUICK); } catch (e) { return false; } }
  continueGame() {
    try {
      const q = localStorage.getItem(SAVE_QUICK), a = localStorage.getItem(SAVE_AUTO);
      const qs = q && JSON.parse(q), as = a && JSON.parse(a);
      if (qs && (!as || qs.at > as.at)) return this.restore(qs);
      if (as) { this.game = as.game; this.toMap(); return true; }
    } catch (e) { console.warn(e); }
    return false;
  }
  toMap(pos) {
    this.mode = 'map';
    const s = buildOverworld(); s.kind = 'map'; s.t = 0; s.fx = []; s.near = null;
    const at = pos || this.game.mapPos || s.start;
    s.p = { x: at.x, y: at.y, w: 0.6, h: 0.6, vx: 0, vy: 0, px: at.x, py: at.y, face: 1, anim: 0 };
    s.camX = s.pcx = at.x; s.camY = s.pcy = at.y;
    this.sim = s; this.enterHit = false; this.autoSave(); this.hud(); this.emit('mapPrompt', null);
  }
  enterLevel(id) {
    const pt = this.sim && this.sim.kind === 'map' ? this.sim.points.find(p => p.id === id) : null;
    if (pt) this.game.mapPos = { x: pt.x + 0.2, y: pt.y - 1 };
    this.mode = 'level'; this.sim = this.makeLevel(id); this.hud();
    this.emit('levelStart', { id, name: this.sim.name });
  }
  makeLevel(id) {
    const s = buildLevel(id); s.kind = 'level'; s.t = 0; s.shots = []; s.fx = []; s.keys = { red: false, blue: false }; s.bridgeOn = false; s.hasUsb = false; s.hacked = false; s.shake = 0;
    s.ents = s.ents.map(e => this.initEnt(e, s));
    s.p = { x: s.start.x, y: s.start.y, w: 0.7, h: 1.4, vx: 0, vy: 0, px: s.start.x, py: s.start.y, face: 1, onGround: false, pogo: false, cut: false, anim: 0, shootT: 0, dead: 0, inv: 0, onPlat: null };
    s.camX = s.pcx = s.start.x + 6; s.camY = s.pcy = s.start.y + 3;
    s.lights = [];
    for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) { const t = s.m[y * s.W + x]; if (t === T.CRYS) s.lights.push({ x: x + 0.5, y: y + 0.7, c: BIOME[s.biome].lc, r: 6 }); if (t === T.EXIT && s.m[(y + 1) * s.W + x] !== T.EXIT) s.lights.push({ x: x + 0.5, y: y + 0.4, c: [0.35, 0.9, 0.4], r: 6 }); }
    let solid = 0; for (let i = 0; i < s.m.length; i++) if (s.m[i]) solid++; s.solidCount = solid;
    s.hazards = [];
    for (let y = 0; y < s.H; y++) { let run = -1; for (let x = 0; x <= s.W; x++) { const t = x < s.W ? s.m[y * s.W + x] : 0, top = (t === T.SPIKE) || (t === T.CHOC && s.m[(y + 1) * s.W + x] !== T.CHOC); if (top && run < 0) run = x; if (!top && run >= 0) { s.hazards.push({ x: (run + x) / 2, y: y + 0.7, w: x - run }); run = -1; } } }
    return s;
  }
  initEnt(e, s) {
    const d = ENT[e.type] || { w: 1, h: 1 };
    const o = Object.assign({ w: d.w, h: d.h, vx: 0, vy: 0, dir: -1, stun: 0, t: hashf(e.x | 0, 7) * 10, cd: 0, fireT: 1.5, state: 'idle', st: 0, onGround: false, ax: e.x, ay: e.y, rot: 0, alpha: 1 }, e);
    o.x = e.x - o.w / 2 + 0.5; o.px = o.x; o.py = o.y; o.ax = o.x; o.ay = o.y;
    if (e.type === 'bat') { let y = Math.floor(e.y); while (y < s.H - 1 && !solidT(s.m[y * s.W + Math.floor(e.x)])) y++; o.y = y - o.h; o.ay = o.y; o.py = o.y; }
    if (e.type === 'boss') { o.hp = 3; o.state = 'wait'; o.x = e.x; o.ax = e.x; }
    return o;
  }
  hud() {
    const g = this.game || this.freshGame(), s = this.sim;
    this.emit('hud', { score: g.score, lives: g.lives, ammo: g.ammo, red: !!(s && s.keys && s.keys.red), blue: !!(s && s.keys && s.keys.blue), usb: !!(s && s.hasUsb), done: Object.assign({}, g.done) });
  }

  // ---------- Save / load (on-device) ----------
  serialise() {
    const s = this.sim, copy = {};
    for (const k in s) { if (k === 'm') copy.m = Array.from(s.m); else if (k === 'near' || k === 'fx') continue; else copy[k] = s[k]; }
    if (s.p && s.p.onPlat) copy.p = Object.assign({}, s.p, { onPlat: null });
    return copy;
  }
  autoSave() { try { localStorage.setItem(SAVE_AUTO, JSON.stringify({ v: 1, at: Date.now(), game: this.game })); } catch (e) { } }
  quickSave() {
    if (!this.game || (this.mode !== 'level' && this.mode !== 'map') || (this.sim.p && this.sim.p.dead)) return false;
    try { localStorage.setItem(SAVE_QUICK, JSON.stringify({ v: 1, at: Date.now(), game: this.game, mode: this.mode, sim: this.serialise() })); this.emit('toast', 'Saved to this device'); return true; }
    catch (e) { this.emit('toast', "Couldn't save — storage is full or blocked"); return false; }
  }
  quickLoad() {
    try { const q = localStorage.getItem(SAVE_QUICK); if (!q) { this.emit('toast', 'No quick-save yet. Press F5 to make one.'); return false; } return this.restore(JSON.parse(q)); }
    catch (e) { this.emit('toast', "That save couldn't be read"); return false; }
  }
  restore(q) {
    this.game = q.game; const s = q.sim; s.m = Uint8Array.from(s.m); s.fx = []; s.near = null;
    this.sim = s; this.mode = q.mode; this.hud(); this.emit('loaded', { mode: q.mode, name: s.name });
    this.emit('toast', 'Loaded your quick-save'); return true;
  }

  // ---------- Collision ----------
  tile(x, y) { const s = this.sim; if (x < 0 || x >= s.W || y < 0 || y >= s.H) return 0; return s.m[y * s.W + x]; }
  solid(cx, cy, down, pb) {
    const s = this.sim; if (cx < 0 || cx >= s.W) return true; if (cy < 0) return false; if (cy >= s.H) return s.kind === 'map';
    const t = s.m[cy * s.W + cx];
    if (solidT(t)) return true;
    if (t === T.BRIDGE) return s.bridgeOn;
    if (t === T.PLAT) return !!down && pb >= cy + 1 - 1e-6;
    return false;
  }
  moveX(e, dx, grounded) {
    e.x += dx; const y0 = Math.floor(e.y + 1e-4), y1 = Math.floor(e.y + e.h - 1e-4);
    const chk = cx => { for (let cy = y0; cy <= y1; cy++) { if (!this.solid(cx, cy)) continue; if (cy === y0 && grounded && cy + 1 - e.y <= 0.55 && !this.solid(cx, cy + 1)) continue; return true; } return false; };
    if (dx > 0) { const cx = Math.floor(e.x + e.w); if (chk(cx)) { e.x = cx - e.w - 1e-6; return true; } }
    else if (dx < 0) { const cx = Math.floor(e.x); if (chk(cx)) { e.x = cx + 1; return true; } }
    return false;
  }
  moveY(e, dy) {
    const pb = e.y; e.y += dy; e.bonk = false;
    const x0 = Math.floor(e.x + 1e-4), x1 = Math.floor(e.x + e.w - 1e-4), fx = Math.floor(e.x + e.w / 2);
    if (dy < 0) {
      const cy = Math.floor(e.y), cs = isSlope(this.tile(fx, cy)) || isSlope(this.tile(fx, cy + 1));
      for (let cx = x0; cx <= x1; cx++) { if (cs && cx !== fx) continue; if (this.solid(cx, cy, true, pb)) { e.y = cy + 1; e.vy = 0; return true; } }
    } else if (dy > 0) {
      const cy = Math.floor(e.y + e.h);
      for (let cx = x0; cx <= x1; cx++) if (this.solid(cx, cy)) { e.y = cy - e.h - 1e-6; e.vy = 0; e.bonk = true; break; }
    }
    return false;
  }
  phys(e, dt) {
    const s = this.sim, was = e.onGround;
    e.hitX = this.moveX(e, e.vx * dt, was); if (e.hitX) e.vx = 0;
    const pb = e.y;
    e.onGround = this.moveY(e, e.vy * dt); e.onSlope = 0;
    const fx = e.x + e.w / 2, tx = Math.floor(fx), ty = Math.floor(e.y);
    for (let k = 0; k < 2; k++) {
      const yy = ty - k, t = this.tile(tx, yy);
      if (isSlope(t)) {
        const hs = yy + slopeH(t, fx - tx);
        if (e.vy <= 0 && ((e.y < hs && e.y > hs - 1) || (was && e.y >= hs && e.y - hs < 0.55))) { e.y = hs; e.vy = 0; e.onGround = true; e.onSlope = t; }
        break;
      } else if (k === 0 && solidT(t)) break;
    }
    e.onPlat = null;
    if (s.plats && e.vy <= 0) for (const pl of s.plats) {
      const top = pl.y + pl.h;
      if (e.x + e.w > pl.x && e.x < pl.x + pl.w && pb >= top - pl.dy - 0.05 && e.y <= top + 0.001) { e.y = top; e.vy = 0; e.onGround = true; e.onPlat = pl; break; }
    }
  }
  groundAhead(e) {
    const fx = e.dir > 0 ? e.x + e.w + 0.05 : e.x - 0.05, cx = Math.floor(fx), cy = Math.floor(e.y - 0.1), t = this.tile(cx, cy), t2 = this.tile(cx, Math.floor(e.y));
    if (t === T.SPIKE || t === T.CHOC || t2 === T.SPIKE) return false;
    return this.solid(cx, cy, true, e.y) || isSlope(t) || isSlope(t2);
  }

  // ---------- Simulation tick ----------
  tick(dt) {
    const s = this.sim; this.tickCount++; s.t += dt;
    if (s.p) { s.p.px = s.p.x; s.p.py = s.p.y; } s.pcx = s.camX; s.pcy = s.camY;
    for (const f of s.fx) f.t += dt;
    if (s.fx.length) s.fx = s.fx.filter(f => f.t < f.life);
    if (s.kind === 'cine') return this.tickCine(dt);
    if (s.kind === 'map') { this.tickMap(dt); return this.follow(dt, 0, 0); }
    if (this.mode === 'attract') { s.camX = 14 + (Math.sin(s.t * 0.04 - 1.57) * 0.5 + 0.5) * (s.W - 28); s.camY = 9; s.pcx = s.camX; this.tickEnts(dt); return; }
    for (const pl of s.plats) { pl.ph += dt * pl.speed; const k = 0.5 - 0.5 * Math.cos(pl.ph * Math.PI); const nx = pl.ax + (pl.bx - pl.ax) * k, ny = pl.ay + (pl.by - pl.ay) * k; pl.dx = nx - pl.x; pl.dy = ny - pl.y; pl.x = nx; pl.y = ny; }
    this.tickBen(dt); this.tickEnts(dt); this.tickShots(dt);
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 2);
    this.follow(dt, s.p.face * 1.5, s.p.lookDown > 0.2 ? -3.6 : 1.6);
  }
  follow(dt, look, up) {
    const s = this.sim, p = s.p, hw = this.halfW || 10, hh = this.halfH || 7;
    if (p && !p.dead) { const tx = p.x + p.w / 2 + look, ty = p.y + up; s.camX += (tx - s.camX) * Math.min(1, 5 * dt); s.camY += (ty - s.camY) * Math.min(1, 3.5 * dt); }
    s.camX = hw * 2 < s.W ? Math.max(hw, Math.min(s.W - hw, s.camX)) : s.W / 2;
    s.camY = hh * 2 < s.H ? Math.max(hh, Math.min(s.H - hh, s.camY)) : s.H / 2;
  }

  tickCine(dt) {
    const s = this.sim; s.stT += dt;
    for (const f of s.fx) { if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; } }
    const tick20 = Math.floor(s.t * 20) !== Math.floor((s.t - dt) * 20);
    if (s.stage === 2) {
      const T = s.stT, prev = s.ly; s.ly = -4.4 + Math.max(0, T - 1.3) ** 2 * 1.7; s.scroll = Math.max(0, s.ly - 0.5);
      const v = (s.ly - prev) / Math.max(dt, 1e-4);
      if (T > 1.3 && s.ly > -3.2 && tick20) s.fx.push({ x: (Math.random() - 0.5) * 1.4, y: s.ly - s.scroll - 0.7, kind: 'puff', t: 0, life: 0.9, vx: (Math.random() - 0.5) * 2, vy: -2 - (s.scroll > 0 ? v : 0), tint: 0xff5555 });
      return;
    }
    if (s.stage < 2) return;
    const os = s.stage - 2, sp = [[0, 0.3], [0, -8], [-3, 0], [-40, 0], [-6, 0], [-1, 0.5]][os] || [0, 0];
    for (const st of s.st) { st.x += sp[0] * st.z * dt; st.y += sp[1] * st.z * dt; if (st.x < -30) st.x += 60; if (st.x > 30) st.x -= 60; if (st.y < -15) st.y += 30; if (st.y > 15) st.y -= 30; }
    s.sy += ((os === 5 ? 2.6 - Math.min(s.stT, 4) * 0.3 : 3) - s.sy) * Math.min(1, dt * 1.5);
    if (tick20) s.fx.push(os === 1 ? { x: s.sx + (Math.random() - 0.5) * 1.2, y: s.sy - 0.7, kind: 'puff', t: 0, life: 0.8, vx: 0, vy: -5, tint: 0xff5555 } : { x: s.sx - 1.6, y: s.sy - 0.1 + Math.sin(s.t * 9) * 0.1, kind: 'puff', t: 0, life: 0.8, vx: -6, vy: 0, tint: 0xff5555 });
  }

  tickMap(dt) {
    const s = this.sim, p = s.p, h = this.held, e = this.edge;
    let vx = (h.right ? 1 : 0) - (h.left ? 1 : 0), vy = (h.up ? 1 : 0) - (h.down ? 1 : 0);
    const l = Math.hypot(vx, vy) || 1; p.vx = vx / l * 5; p.vy = vy / l * 5; if (vx) p.face = vx;
    this.moveX(p, p.vx * dt, false); this.moveY(p, p.vy * dt);
    if (vx || vy) p.anim += dt * 6;
    let near = null; for (const pt of s.points) if (Math.hypot(p.x + 0.3 - (pt.x + 0.5), p.y + 0.3 - (pt.y + 0.5)) < (pt.big ? 1.6 : 0.95)) near = pt;
    if (near !== s.near) { s.near = near; this.emit('mapPrompt', near ? this.promptFor(near) : null); }
    const ent = this.enterHit; this.enterHit = false;
    if (near && (e.jump || e.fire || ent)) this.activate(near);
  }
  promptFor(pt) {
    const g = this.game;
    if (pt.type === 'level') return { title: LEVEL_INFO[pt.id].name, text: (g.done[pt.id] ? 'Cleared · ' : '') + LEVEL_INFO[pt.id].blurb, action: 'Enter' };
    if (pt.type === 'tele') return g.done[pt.req] ? { title: 'Teleporter', text: 'Humming and ready.', action: 'Teleport' } : { title: 'Teleporter', text: `Quiet for now. Clear ${LEVEL_INFO[pt.req].name} to power it.`, action: null };
    return { title: 'Spaghetti with meatballs flying saucer', text: 'Parked and steaming gently. Billy first.', action: null };
  }
  activate(pt) {
    const s = this.sim, p = s.p;
    if (pt.type === 'level') { this.enterLevel(pt.id); return; }
    if (pt.type === 'tele' && this.game.done[pt.req]) {
      const to = s.points.find(q => q.id === pt.to); this.cap(p.x, p.y + 1, 'vworp', '#55ffff');
      p.x = to.x + 0.2; p.y = to.y - 1.2; p.px = p.x; p.py = p.y; s.camX = s.pcx = p.x; s.camY = s.pcy = p.y; s.near = null;
    }
  }

  tickBen(dt) {
    const s = this.sim, p = s.p, h = this.held, e = this.edge, g = this.game;
    if (p.dead) { p.dead += dt; p.vy -= 30 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot = (p.rot || 0) + dt * 8; if (p.dead > 1.4 && !p.deadSent) { p.deadSent = true; this.onDeath(); } return; }
    if (s.won) return;
    if (p.inv > 0) p.inv -= dt; if (p.shootT > 0) p.shootT -= dt;
    if (p.onPlat) { p.x += p.onPlat.dx; p.y += p.onPlat.dy; }
    if (e.pogo) { p.pogo = !p.pogo; }
    const ax = (h.right ? 1 : 0) - (h.left ? 1 : 0); if (ax) p.face = ax;
    p.lookDown = h.down && !h.up && p.onGround && !p.pogo && !ax ? (p.lookDown || 0) + dt : 0;
    const MAXR = 7;
    if (p.onGround && !p.pogo) { if (ax) p.vx += ax * (Math.sign(p.vx) === -ax ? 90 : 55) * dt; else { const f = 60 * dt; p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f; } }
    else { p.vx += ax * 32 * dt; if (!ax) p.vx *= 1 - 1.5 * dt; }
    p.vx = Math.max(-MAXR, Math.min(MAXR, p.vx));
    if (p.onGround) {
      if (p.pogo) { p.vy = h.jump ? Math.sqrt(2 * G * (this.pogoHeight || 6.6)) : 14; p.onGround = false; p.squash = 0.12; this.cap(p.x + 0.35, p.y, 'boing', '#ffff55'); }
      else if (e.jump) { if (this.audio) this.audio.play('jump'); p.vy = 20.5; p.cut = true; p.onGround = false; }
    }
    if (p.cut && !h.jump && p.vy > 0) { p.vy *= 0.45; p.cut = false; }
    if (p.vy <= 0) p.cut = false;
    if (p.squash > 0) p.squash -= dt;
    p.vy = Math.max(p.vy - G * dt, -22);
    if (e.fire) this.fire();
    this.phys(p, dt);
    if (p.bonk && p.pogo) p.vy = 0;
    p.anim += Math.abs(p.vx) * dt;

    // tiles: hazards, doors, exit
    let die = p.y < -1.5;
    for (let cx = Math.floor(p.x); cx <= Math.floor(p.x + p.w); cx++) for (let cy = Math.floor(p.y); cy <= Math.floor(p.y + p.h); cy++) {
      const t = this.tile(cx, cy);
      if (t === T.SPIKE && p.y < cy + 0.55) die = true;
      if (t === T.CHOC && p.y < cy + (this.tile(cx, cy + 1) === T.CHOC ? 1 : 0.55)) die = true;
      if (t === T.EXIT && !s.won) { s.won = true; g.done[s.id] = true; this.cap(p.x, p.y + 2, 'ta-da!', '#55ff55'); this.hud(); this.emit('levelComplete', { id: s.id, name: s.name }); return; }
    }
    for (const [tt, key, name] of [[T.DOOR_R, 'red', 'red'], [T.DOOR_B, 'blue', 'blue']]) {
      if (!s.keys[key]) continue;
      const cx = p.face > 0 ? Math.floor(p.x + p.w + 0.1) : Math.floor(p.x - 0.1);
      if (this.tile(cx, Math.floor(p.y + 0.2)) === tt) { for (let i = 0; i < s.m.length; i++) if (s.m[i] === tt) s.m[i] = 0; s.keys[key] = false; this.cap(cx + 0.5, p.y + 2, 'clunk', '#ffffff'); this.hud(); this.emit('toast', `The ${name} cookie door swings open`); }
    }
    if (die) return this.kill();
    // items
    for (const it of s.items) {
      if (it.taken || !ov(p, it.x - 0.4, it.y - 0.4, 0.8, 0.8)) continue;
      it.taken = true;
      if (POINTS[it.type]) {
        g.score += POINTS[it.type]; this.cap(it.x, it.y + 0.6, 'crunch', '#ffff55');
        while (g.score >= g.nextLife) { g.lives++; g.nextLife += 100; this.cap(p.x, p.y + 2.2, 'ding! extra life', '#55ff55'); this.emit('toast', 'Extra life! Every 100 snack points earns one.'); }
      } else if (it.type === 'soda') { g.ammo += 5; this.cap(it.x, it.y + 0.6, 'fsssht', '#55ffff'); }
      else if (it.type === 'keyRed') { s.keys.red = true; this.cap(it.x, it.y + 0.6, 'red gumdrop', '#ff5555'); }
      else if (it.type === 'keyBlue') { s.keys.blue = true; this.cap(it.x, it.y + 0.6, 'blue gumdrop', '#5555ff'); }
      else if (it.type === 'usb') { s.hasUsb = true; this.cap(it.x, it.y + 0.6, 'gold USB drive', '#ffff55'); this.emit('toast', 'Gold USB drive! Find the security terminal.'); }
      this.hud();
    }
    // entity contact
    for (const en of s.ents) {
      if (en.dead || !ov(p, en.x, en.y, en.w, en.h)) { en.touch = false; continue; }
      const first = !en.touch; en.touch = true;
      const d = ENT[en.type] || {};
      if (en.type === 'switch') { if (first) { s.bridgeOn = !s.bridgeOn; this.cap(en.x + 0.4, en.y + 1.4, 'click-clack', '#aaaaaa'); this.emit('toast', s.bridgeOn ? 'Somewhere ahead, a bridge rumbles into place' : 'The bridge folds away'); } continue; }
      if (en.type === 'terminal') { if (first) { if (s.hasUsb && !s.hacked) { s.hacked = true; s.hasUsb = false; this.hud(); this.cap(en.x + 0.5, en.y + 2, 'beep boop', '#55ff55'); setTimeout(() => this.emit('ending'), 1400); } else if (!s.hacked) this.cap(en.x + 0.5, en.y + 2, 'needs a drive', '#aaaaaa'); } continue; }
      if (d.prop) continue;
      const stomp = p.vy < 0 && p.py >= en.y + en.h * 0.55;
      if (en.type === 'marsh') { if (stomp) { p.vy = p.pogo ? 26 : 18; this.cap(p.x, p.y, 'sproing', '#ff55ff'); } else if (first) { p.vx = Math.sign(p.x - en.x || 1) * 12; p.vy = Math.max(p.vy, 7); p.onGround = false; this.cap(en.x, en.y + 1.2, 'bwomp', '#ff55ff'); } continue; }
      if (en.stun > 0 || d.harmless) { if (stomp) p.vy = p.pogo ? 20 : 12; continue; }
      if (en.type === 'boss') { if (stomp && en.state === 'hot') { this.hitBoss(en); p.vy = 22; continue; } }
      else if (stomp && d.stun) { en.stun = 3; p.vy = p.pogo ? 20 : 12; this.cap(en.x + en.w / 2, en.y + en.h + 0.4, 'bonk', '#ffffff'); continue; }
      if (en.type === 'boss' && (en.state === 'down')) continue;
      if (p.inv <= 0) return this.kill();
    }
    for (const en of s.ents) if (en.type === 'pod' && en.puff && en.stun <= 0) { if (ov(p, en.x - 2.2, en.y, 2.1, 1.2) || ov(p, en.x + en.w + 0.1, en.y, 2.1, 1.2)) return this.kill(); }
  }
  fire() {
    const s = this.sim, p = s.p, g = this.game;
    if (g.ammo <= 0) { this.cap(p.x + 0.35, p.y + 1.6, 'click — no fizz', '#aaaaaa'); return; }
    g.ammo--; this.hud();
    let vx = p.face * 16, vy = 0, sx = p.x + p.w / 2 + p.face * 0.6, sy = p.y + 0.85;
    if (this.held.up) { vx = 0; vy = 16; sx = p.x + p.w / 2; sy = p.y + 1.5; } else if (this.held.down && !p.onGround) { vx = 0; vy = -16; sx = p.x + p.w / 2; sy = p.y; }
    s.shots.push({ x: sx, y: sy, vx, vy, ben: true, life: 1.1, kind: 'bubble' }); p.shootT = 0.25; this.cap(sx, sy + 0.5, 'fzzt', '#55ffff');
  }
  kill() {
    const s = this.sim, p = s.p; if (p.dead) return;
    p.dead = 0.001; p.vy = 14; p.vx = -p.face * 2; p.pogo = false; s.shake = 0.6; this.cap(p.x, p.y + 1.6, 'whoa!', '#ff5555');
  }
  onDeath() {
    const g = this.game; g.lives--; this.hud();
    if (g.lives < 0) this.emit('gameOver', { score: g.score }); else this.emit('died', { lives: g.lives, name: this.sim.name });
  }

  tickEnts(dt) {
    const s = this.sim, p = s.p;
    for (const e of s.ents) {
      e.px = e.x; e.py = e.y; e.t += dt; if (e.dead) continue;
      const d = ENT[e.type] || {}; if (d.prop) continue;
      if (e.type === 'boss') { this.tickBoss(e, dt); continue; }
      if (e.stun > 0) { e.stun -= dt; if (!d.fly) { e.vx = 0; e.vy = Math.max(e.vy - G * dt, -20); this.phys(e, dt); } else if (e.type === 'bat') { this.moveY(e, -4 * dt); } continue; }
      const dx = (p.x + p.w / 2) - (e.x + e.w / 2), dy = p.y - e.y, ben = !p.dead && !p.hidden;
      switch (e.type) {
        case 'gloop': e.vx = e.dir * 1.5; e.vy = Math.max(e.vy - G * dt, -20); this.phys(e, dt); if (e.hitX || (e.onGround && !this.groundAhead(e))) e.dir *= -1; break;
        case 'hopper': {
          e.vy = Math.max(e.vy - G * dt, -20); e.cd -= dt;
          const behind = Math.sign(e.x - p.x) === -p.face;
          if (e.onGround) { e.vx = 0; if (ben && behind && Math.abs(dx) < 10 && Math.abs(dy) < 4 && e.cd <= 0) { e.dir = Math.sign(dx) || 1; e.vy = 13; e.vx = e.dir * 5.5; e.cd = 0.55; } }
          this.phys(e, dt); break;
        }
        case 'marsh': e.vx = e.dir * 2.2; e.vy = Math.max(e.vy - G * dt, -20); this.phys(e, dt); if (e.onGround) e.vy = 11; if (e.hitX) e.dir *= -1; break;
        case 'beetle': {
          e.vy = Math.max(e.vy - G * dt, -20);
          if (e.state === 'charge') { e.vx = e.dir * 9; e.st -= dt; this.phys(e, dt); if (e.hitX) { e.state = 'idle'; e.stun = 1.2; this.cap(e.x + 0.5, e.y + 1, 'thunk', '#ffffff'); } else if (e.st <= 0 || (e.onGround && !this.groundAhead(e))) { e.state = 'idle'; e.vx = 0; } }
          else { e.vx = 0; this.phys(e, dt); if (ben && Math.abs(dy) < 1.2 && Math.abs(dx) < 11) { e.state = 'charge'; e.dir = Math.sign(dx) || 1; e.st = 2.2; this.cap(e.x + 0.5, e.y + 1.2, 'snort', '#ff5555'); } }
          break;
        }
        case 'bat':
          if (e.state === 'idle') { e.x = e.ax; e.y = e.ay; if (ben && Math.abs(dx) < 2.4 && dy < -0.5 && dy > -11) { e.state = 'drop'; e.vx = Math.sign(dx) * 2; this.cap(e.x, e.y, 'skreee', '#55ffff'); } }
          else if (e.state === 'drop') { this.moveX(e, e.vx * dt); const landed = this.moveY(e, -15 * dt); if (landed || e.y <= p.y - 0.2 || e.y < 0) e.state = 'rise'; }
          else { e.x += (e.ax - e.x) * Math.min(1, dt * 2); this.moveY(e, 6 * dt); if (e.y >= e.ay - 0.02 || e.bonk) { e.state = 'idle'; } }
          break;
        case 'pod': { const c = (e.t % 3); const was = e.puff; e.puff = c > 2; if (e.puff && !was) this.cap(e.x + 0.4, e.y + 1.4, 'pfff', '#ff55ff'); break; }
        case 'phantom': {
          e.vy = Math.max(e.vy - G * dt, -20); e.vx = 0; this.phys(e, dt); e.dir = Math.sign(dx) || 1; e.cd -= dt; e.fireT -= dt;
          if (e.alpha < 1) e.alpha = Math.min(1, e.alpha + dt * 2);
          if (ben && Math.abs(dx) < 12 && Math.abs(dy) < 6 && e.fireT <= 0) { e.fireT = 2.6; const a0 = Math.atan2(dy + 0.5, dx); [-0.3, 0, 0.3].forEach(o => s.shots.push({ x: e.x + e.w / 2, y: e.y + 0.9, vx: Math.cos(a0 + o) * 6, vy: Math.sin(a0 + o) * 6, life: 3, kind: 'zshot' })); this.cap(e.x + 0.4, e.y + 2, 'zap zap zap', '#ff5555'); }
          break;
        }
        case 'roller': {
          e.vy = Math.max(e.vy - G * dt, -20);
          const sl = e.onSlope, down = sl === T.R45 || sl === T.R22A || sl === T.R22B ? -1 : sl ? 1 : 0, acc = (sl === T.R45 || sl === T.L45) ? 14 : 7;
          if (down) e.vx += down * acc * dt; else if (Math.abs(e.vx) < 2.5) e.vx = (Math.sign(e.vx) || e.dir) * 2.5;
          e.vx = Math.max(-8.5, Math.min(8.5, e.vx));
          const vx = e.vx; this.phys(e, dt); if (e.hitX) { e.vx = -vx * 0.6; e.dir = Math.sign(e.vx) || -e.dir; this.cap(e.x + 1, e.y + 2.2, 'KRUNCH', '#aaaaaa'); s.shake = Math.max(s.shake, 0.3); }
          e.rot -= e.vx * dt / 0.95; break;
        }
        case 'sentry': {
          const ty = Math.max(e.ay - 4, Math.min(e.ay + 4, p.y + 0.3)); e.y += Math.max(-2.5, Math.min(2.5, (ty - e.y) * 2)) * dt; e.x = e.ax + Math.sin(e.t * 0.9) * 0.8;
          e.dir = Math.sign(dx) || 1; e.fireT -= dt;
          if (ben && Math.abs(dx) < 9 && e.fireT <= 0) { e.fireT = 1.8; [-0.2, 0, 0.2].forEach(o => s.shots.push({ x: e.x + e.w / 2 + e.dir * 0.8, y: e.y + 0.4, vx: Math.cos(o) * 7 * e.dir, vy: Math.sin(o) * 7, life: 2.5, kind: 'zshot' })); this.cap(e.x + 0.7, e.y + 1.4, 'brrrt', '#ff5555'); }
          break;
        }
        case 'drone': e.x = e.ax + 2.6 * Math.sin(e.t * 1.6); e.y = e.ay + 1.4 * Math.sin(e.t * 3.2); break;
      }
    }
  }
  tickBoss(e, dt) {
    const s = this.sim, p = s.p, A = s.arena, floor = A.floor, dx = (p.x + p.w / 2) - (e.x + e.w / 2);
    e.st += dt;
    switch (e.state) {
      case 'wait': if (p.x > A.x0 + 3 && !p.dead) { e.state = 'rise'; e.st = 0; this.emit('dialogue', 'bossIntro'); } break;
      case 'hover': {
        e.y += ((floor + 4.5 + Math.sin(e.t * 2) * 0.4) - e.y) * Math.min(1, dt * 3);
        e.x += Math.max(-3, Math.min(3, dx * 2)) * dt; e.x = Math.max(A.x0, Math.min(A.x1 - e.w, e.x));
        if (Math.floor(e.st / 0.9) !== Math.floor((e.st - dt) / 0.9)) { s.shots.push({ x: e.x + e.w / 2, y: e.y, vx: 0, vy: -1, g: true, life: 4, kind: 'glob' }); this.cap(e.x + 1.4, e.y - 0.3, 'splorp', '#aa5500'); }
        if (e.st > 4.2) { e.state = 'land'; e.st = 0; }
        break;
      }
      case 'land': e.y -= 9 * dt; if (e.y <= floor) { e.y = floor; e.state = 'charge'; e.st = 0; e.dir = Math.sign(dx) || 1; s.shake = 0.8; this.cap(e.x + 1.4, e.y + 3, 'THOOM', '#ffffff'); } break;
      case 'charge': { e.vx = e.dir * 10; const before = e.x; e.x += e.vx * dt; if (e.x < A.x0 || e.x + e.w > A.x1) { e.x = Math.max(A.x0, Math.min(A.x1 - e.w, before)); e.state = 'hot'; e.st = 0; s.shake = 0.5; this.cap(e.x + 1.4, e.y + 3, 'CLANG — dome open!', '#ffff55'); } break; }
      case 'hot': if (e.st > 2.4) { e.state = 'rise'; e.st = 0; } break;
      case 'rise': e.y += 5 * dt; if (e.y >= floor + 4.5) { e.state = 'hover'; e.st = 0; } break;
      case 'down': e.y = Math.max(floor, e.y - 6 * dt); if (Math.random() < 0.3) s.fx.push({ x: e.x + Math.random() * e.w, y: e.y + Math.random() * e.h, kind: 'puff', t: 0, life: 0.5, tint: 0xffff55 }); if (e.st > 2) { e.dead = true; s.items.push({ type: 'usb', x: e.x + e.w / 2, y: floor + 0.6, taken: false }); this.emit('dialogue', 'bossDefeated'); } break;
    }
  }
  hitBoss(e) {
    e.hp--; this.cap(e.x + 1.4, e.y + 3.2, 'ZZZAP', '#55ffff'); this.sim.shake = 0.5; this.emit('bossHp', e.hp);
    if (e.hp <= 0) { e.state = 'down'; e.st = 0; } else { e.state = 'rise'; e.st = 0; }
  }
  tickShots(dt) {
    const s = this.sim, p = s.p;
    for (let i = s.shots.length - 1; i >= 0; i--) {
      const b = s.shots[i];
      if (b.g) b.vy -= 20 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let gone = b.life <= 0 || this.solid(Math.floor(b.x), Math.floor(b.y)) || b.y < 0;
      if (b.ben && !gone) {
        for (const e of s.ents) {
          if (e.dead || (ENT[e.type] || {}).prop) continue;
          if (e.type === 'phantom' && e.cd <= 0 && Math.abs(b.x - (e.x + e.w / 2)) < 2.6 && Math.abs(b.y - (e.y + 0.7)) < 1.2 && e.stun <= 0) { this.teleportPhantom(e); continue; }
          if (b.x > e.x - 0.15 && b.x < e.x + e.w + 0.15 && b.y > e.y - 0.2 && b.y < e.y + Math.max(e.h, 1.1) + 0.2) {
            gone = true; const d = ENT[e.type];
            if (e.type === 'boss') { if (e.state === 'hot') this.hitBoss(e); else this.cap(b.x, b.y + 0.5, 'plink', '#aaaaaa'); }
            else if (d.inv) this.cap(b.x, b.y + 0.5, e.type === 'marsh' ? 'blorp' : 'plink', '#aaaaaa');
            else { e.stun = 6; e.state = 'idle'; this.cap(e.x + e.w / 2, e.y + e.h + 0.4, 'fizzled', '#55ffff'); }
            break;
          }
        }
      } else if (!b.ben && !gone && !p.dead && b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h) { gone = true; if (p.inv <= 0) this.kill(); }
      if (gone) { s.fx.push({ x: b.x, y: b.y, kind: 'puff', t: 0, life: 0.3, tint: b.ben ? 0x55ffff : 0xff5555 }); s.shots[i] = s.shots[s.shots.length - 1]; s.shots.pop(); }
    }
  }
  teleportPhantom(e) {
    const s = this.sim, p = s.p;
    for (let tries = 0; tries < 6; tries++) {
      const nx = Math.floor(p.x + (hashf(this.tickCount, tries) < 0.5 ? -1 : 1) * (5 + tries % 3));
      for (let y = Math.min(s.H - 3, Math.floor(p.y) + 4); y > 0; y--) {
        if (this.solid(nx, y - 1) && !this.solid(nx, y) && !this.solid(nx, y + 1) && this.tile(nx, y) !== T.CHOC && this.tile(nx, y - 1) !== T.CHOC) {
          s.fx.push({ x: e.x + 0.4, y: e.y + 0.7, kind: 'puff', t: 0, life: 0.6, tint: 0xffffff });
          e.x = nx + 0.1; e.y = y; e.px = e.x; e.py = e.y; e.cd = 2.4; e.alpha = 0; e.fireT = Math.min(e.fireT, 0.8);
          this.cap(e.x + 0.4, e.y + 2, 'poof', '#ffffff'); return;
        }
      }
    }
  }

  // ---------- Sound-cue captions (visual stand-ins for audio) ----------
  cap(wx, wy, text, colour) {
    if (this.audio) this.audio.caption(text);
    if (!this.opts.captions || !this.fxHost || !this.ppu) return;
    const now = performance.now(); if (this.capT[text] && now - this.capT[text] < 180) return; this.capT[text] = now;
    const sx = (wx - this.camX) * this.ppu + this.vw / 2, sy = this.vh / 2 - (wy - this.camY) * this.ppu;
    if (sx < -50 || sy < -50 || sx > this.vw + 50 || sy > this.vh + 50) return;
    const d = document.createElement('div'); d.textContent = text;
    d.style.cssText = `position:absolute;left:${sx}px;top:${sy}px;transform:translate(-50%,-50%);font-family:'Space Grotesk',sans-serif;font-weight:700;font-style:italic;font-size:15px;color:${colour};-webkit-text-stroke:0.5px #000;text-shadow:2px 2px 0 #000;white-space:nowrap;`;
    this.fxHost.appendChild(d);
    const a = d.animate([{ transform: 'translate(-50%,-50%) scale(0.8)', opacity: 1 }, { transform: 'translate(-50%,-60%) scale(1.05)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-180%)', opacity: 0 }], { duration: 950, easing: 'ease-out' });
    a.onfinish = () => d.remove();
  }

  // ---------- Frame ----------
  frame(t) {
    const dt = Math.max(0, (t - this.last) / 1000); this.last = t;
    if (this.paused) { this.readInput(); this.acc = 0; }
    else { this.acc += Math.min(dt, 0.25); while (this.acc >= STEP) { this.readInput(); this.tick(STEP); this.acc -= STEP; } }
    const s = this.sim, a = this.paused ? 1 : this.acc / STEP;
    const tall = s.kind === 'map' ? 12 : s.kind === 'cine' ? 14 : 13;
    this.ppu = (this.vh / tall) * this.zoom; this.halfW = this.vw / 2 / this.ppu; this.halfH = this.vh / 2 / this.ppu;
    const snap = 1 / (this.ppu * this.renderer.getPixelRatio());
    const sh = s.shake ? (Math.sin(s.t * 70) * s.shake * 0.15) : 0;
    this.camX = Math.round((s.pcx + (s.camX - s.pcx) * a + sh) / snap) * snap; this.camY = Math.round((s.pcy + (s.camY - s.pcy) * a) / snap) * snap;
    const c = this.cam; c.left = -this.halfW; c.right = this.halfW; c.top = this.halfH; c.bottom = -this.halfH; c.position.set(this.camX, this.camY, 5); c.updateProjectionMatrix();
    const bio = s.kind === 'level' ? BIOME[s.biome] : null;
    const night = this.opts.night && bio, skyGlow = !!(night && bio.layers[0].kind === 'stars');
    if (skyGlow) this.renderer.setClearColor(0x000000, 0); else this.renderer.setClearColor(bio ? (night ? 0x000000 : bio.clear) : 0x000000, 1);
    if (this.onSky) this.onSky(skyGlow);
    const amb = bio ? (night ? bio.night : bio.amb) : [1, 1, 1]; this.lightMul = night ? 1 : (bio ? bio.lm : 1);
    this.uniforms.uAmb.value.set(amb[0], amb[1], amb[2]);
    this.uniforms.uLighting.value = this.opts.lighting && bio ? 1 : 0; this.uniforms.uNormals.value = this.opts.normals ? 1 : 0; this.uniforms.uPoster.value = this.opts.poster ? 1 : 0;
    this.n = 0; this.world = 0;
    if (s.kind === 'cine') this.drawCine(); else if (s.kind === 'map') this.drawMap(a); else this.drawLevel(a);
    const nl = bio ? this.updateLights(bio) : 0;
    const n = this.n; this.geo.instanceCount = n;
    if (n > 0) { const ib = this.ib; if (ib.addUpdateRange) { ib.clearUpdateRanges(); ib.addUpdateRange(0, n * STRIDE); } else { ib.updateRange.offset = 0; ib.updateRange.count = n * STRIDE; } ib.needsUpdate = true; }
    this.renderer.render(this.scene, this.cam);
    if (dt > 0) this.fpsE += (1 / dt - this.fpsE) * 0.05;
    this.statT += dt;
    if (this.statT > 0.25) { this.statT = 0; this.emit('stats', { fps: Math.round(this.fpsE), ms: (1000 / this.fpsE).toFixed(1), tick: this.tickCount, inst: n, world: this.world, calls: this.renderer.info.render.calls, lights: nl, zoom: this.zoom, tall: this.halfH * 2, pad: !!this.padConnected }); }
  }
  push(x, y, sp, opt) {
    if (this.n >= MAX || !sp) return;
    const b = this.buf, o = this.n * STRIDE, sc = opt && opt.s || 1, sx = sp.w / 16 * sc * (opt && opt.flip ? -1 : 1) * (opt && opt.sx || 1), sy = sp.h / 16 * sc * (opt && opt.sy || 1), r = opt && opt.rot || 0;
    if (r) { const cs = Math.cos(r), sn = Math.sin(r); b[o] = cs * sx; b[o + 1] = sn * sx; b[o + 4] = -sn * sy; b[o + 5] = cs * sy; }
    else { b[o] = sx; b[o + 1] = 0; b[o + 4] = 0; b[o + 5] = sy; }
    b[o + 3] = sp.uw; b[o + 7] = sp.vh; b[o + 12] = x; b[o + 13] = y; b[o + 16] = sp.u; b[o + 17] = sp.v;
    b[o + 18] = opt && opt.tint !== undefined ? opt.tint : 0xffffff; b[o + 19] = (opt && opt.a !== undefined ? opt.a : 1) + (opt && opt.em ? 2 : 0) + (opt && opt.act ? 4 : 0);
    this.n++;
  }
  view() { const cx = this.camX, cy = this.camY, hw = this.halfW, hh = this.halfH; return [cx - hw - 1, cx + hw + 1, cy - hh - 1, cy + hh + 1]; }

  drawCine() {
    const s = this.sim, S = this.spr;
    if (s.stage === 0) this.drawYard(0, false);
    else if (s.stage === 1) this.drawLab();
    else if (s.stage === 2) this.drawYard(s.scroll || 0, true);
    else {
      const os = s.stage - 2;
      for (const st of s.st) { const str = os === 3 ? 1 + st.z * 10 : 1, strY = os === 1 ? 1 + st.z * 3 : 1; this.push(st.x, st.y, S.star, { s: 0.6 + st.z * 0.6, sx: str, sy: strY, em: true, a: 0.5 + st.z * 0.5, tint: st.z > 0.8 ? 0xffff55 : 0xffffff }); }
      if (os >= 4) { const k = os === 4 ? Math.min(1, s.stT / 6) : 1; const sc = os === 4 ? 1.5 + k * 3.5 : 9; const px = os === 4 ? 9 - k * 3 : 0, py = os === 4 ? 3.5 : -10 - Math.min(s.stT, 4) * 0.2; this.push(px, py, S.planet, { s: sc, em: true }); }
    }
    for (const f of s.fx) this.push(f.x, f.y, S.puff, { s: 0.6 + f.t, em: true, a: 1 - f.t / f.life, tint: f.tint });
    if (s.stage >= 3) this.push(s.sx, s.sy + Math.sin(s.t * 2.2) * 0.12, S.saucer, { s: 1.6, em: true, rot: s.stage === 7 ? -0.08 : Math.sin(s.t * 1.3) * 0.03 });
    this.world = this.n;
  }
  drawYard(oy, launch) {
    const s = this.sim, S = this.spr, t = s.t, T = s.stT, F = S.fill, G = -2.5;
    const P = (x, y, sp, o) => this.push(x, y - oy, sp, Object.assign({ em: true }, o));
    this.push(0, 0, F, { sx: 40, sy: 20, tint: 0x070718, em: true });
    P(0, G + 2.4, F, { sx: 40, sy: 3, tint: 0x110d2c }); P(0, G + 1.1, F, { sx: 40, sy: 1.4, tint: 0x22143a });
    for (const st of s.st) { const yy = ((st.y + 15 - oy * 0.3 * st.z) % 30 + 30) % 30 - 15; if (yy > G - oy + 1.4) this.push(st.x * 0.45, yy, S.star, { s: 0.35 + st.z * 0.4, em: true, a: 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.6 + st.z * 40)), tint: st.z > 0.85 ? 0xffff55 : 0xffffff }); }
    this.push(-6.5, 4.4 - oy * 0.3, S.moon, { s: 1.5, em: true });
    for (let x = -14; x < 14; x++) P(x + 0.5, G + 0.9, S.hillTop, { tint: 0x1b1638 });
    P(0, G + 0.2, F, { sx: 40, sy: 0.42, tint: 0x1b1638 });
    P(-8.2, G + 1.75, S.house, { s: 1.4, tint: 0x8a90bb }); P(-9.1, G + 1.3, S.puff, { s: 1.8, a: 0.2, tint: 0xffd866 });
    for (let x = -13.5; x <= 13.5; x++) P(x, G + 0.5, S.fence, { tint: 0x5e6490 });
    P(6, G + 3.75, S.bigTree, { s: 1.5, tint: 0x9aa2cc }); P(5.16, G + 4.5, S.puff, { s: 2, a: 0.2, tint: 0xffd866 });
    if (!launch) { P(6, G + 0.45, S.puff, { s: 1.3 + 0.15 * Math.sin(t * 3), a: 0.4, tint: 0xffcc44 }); P(6, G + 1.4, F, { sx: 0.5, sy: 1.8, a: 0.1, tint: 0xffdd88 }); }
    const sau = () => P(0, s.ly, S.saucer, { s: 1.6, rot: Math.sin(t * 6) * 0.02 });
    if (launch && s.ly < -3.2) sau();
    P(0, G - 4, F, { sx: 40, sy: 8, tint: 0x0b2412 }); P(0, G - 0.06, F, { sx: 40, sy: 0.14, tint: 0x2f7a34 });
    const k = launch ? Math.min(1, T / 1.2) : 0;
    if (k > 0) { P(0, G - 0.08, F, { sx: 2.6 * k, sy: 0.2, tint: 0x000000 }); P(0, G + 0.15, S.puff, { s: 2.2 * k, a: 0.35 * k, tint: 0x55ffff }); }
    P(-0.65 - k * 1.3, G - 0.04, F, { sx: 1.3, sy: 0.14, tint: 0x8888aa }); P(0.65 + k * 1.3, G - 0.04, F, { sx: 1.3, sy: 0.14, tint: 0x8888aa });
    if (launch && s.ly >= -3.2) sau();
    if (!launch) { const bx = -10 + Math.min(T, 6.6) * 2.2, walk = T < 6.6; P(bx, G + 0.75, walk ? ((Math.floor(t * 8) & 1) ? S.ben_run1 : S.ben_run2) : S.ben_stand, { tint: 0xc8ccee }); }
    for (let i = 0; i < 9; i++) { const fx = hashf(i, 9) * 22 - 11 + Math.sin(t * 0.6 + i) * 1.2, fy = G + 0.6 + hashf(i, 4) * 3 + Math.sin(t * 1.3 + i * 2) * 0.4; P(fx, fy, S.star, { s: 0.6, a: 0.25 + 0.75 * Math.max(0, Math.sin(t * 2.4 + i * 1.7)), tint: 0xffff55 }); }
  }
  drawLab() {
    const s = this.sim, S = this.spr, t = s.t, T = s.stT, F = S.fill, G = -2.5, f = Math.floor(t * 3) & 1;
    const P = (x, y, sp, o) => this.push(x, y, sp, Object.assign({ em: true }, o));
    for (let x = -14; x < 14; x++) for (let y = Math.floor(G); y < 8; y++) P(x + 0.5, y + 0.5, S.labPanel, { tint: 0x5a5a88 });
    P(0, 5.6, F, { sx: 40, sy: 0.3, tint: 0x3a3a55 }); P(0, 5.38, F, { sx: 40, sy: 0.1, tint: 0x8a8ab0 });
    P(-4.2, 1.6, S.blueprint, { s: 1.3 }); P(-1.1, 2.1, S.blueprint, { flip: true });
    P(6, 5.1, F, { sx: 4.6, sy: 0.35, tint: 0x0c0c18 }); P(6, 4.88, F, { sx: 4.6, sy: 0.08, tint: 0x55ffff, a: 0.6 + 0.4 * f });
    P(-11.3, G + 1, S['console' + f]); P(11.3, G + 1, S['console' + (1 - f)], { flip: true });
    P(6, G + 0.3, S.pad, { s: 1.2 }); P(6, G + 1.4 + Math.sin(t * 2) * 0.05, S.saucer, { s: 1.6 });
    P(-1.2, 4.4, S.lamp); 
    for (let y = Math.floor(G); y < 8; y++) P(-8, y + 0.5, S.ladder);
    P(0, G - 4, F, { sx: 40, sy: 8, tint: 0x22223a }); P(0, G - 0.06, F, { sx: 40, sy: 0.14, tint: 0x9a9ac0 });
    P(-1, G + 0.5, S.bench); P(-1.22, G + 0.78, S.puff, { s: 0.9 + 0.15 * Math.sin(t * 4), a: 0.35, tint: 0xffff88 });
    let bx = -8, by = G + 0.75, walk = false;
    if (T < 2.2) by = 4 + (G + 0.75 - 4) * (T / 2.2); else { const w = Math.min(T - 2.2, 2.35); bx = -8 + w * 2.3; walk = w < 2.35; }
    P(bx, by, walk ? ((Math.floor(t * 8) & 1) ? S.ben_run1 : S.ben_run2) : S.ben_stand);
  }
  drawMap(a) {
    const s = this.sim, S = this.spr, [x0, x1, y0, y1] = this.view(), t = s.t, cul = this.opts.culling;
    const tx0 = cul ? Math.max(0, Math.floor(x0)) : 0, tx1 = cul ? Math.min(s.W - 1, Math.ceil(x1)) : s.W - 1, ty0 = cul ? Math.max(0, Math.floor(y0)) : 0, ty1 = cul ? Math.min(s.H - 1, Math.ceil(y1)) : s.H - 1;
    const rf = Math.floor(t * 2) & 1;
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const tt = s.m[y * s.W + x];
      if (tt === T.RIVER) { this.push(x + 0.5, y + 0.5, (x + y + rf) & 1 ? S.owRiver0 : S.owRiver1, { em: true }); continue; }
      this.push(x + 0.5, y + 0.5, tt === T.PATH ? S.owPath : S.owGrass, { em: true });
      if (tt === T.TREE) this.push(x + 0.5, y + 0.5, hashf(x, y) < 0.5 ? S.owTree0 : S.owTree1, { em: true });
      if (tt === T.ROCK) this.push(x + 0.5, y + 0.5, S.owRock, { em: true });
    }
    this.world += s.W * s.H;
    for (const pt of s.points) {
      const x = pt.x + 0.5, y = pt.y + 0.5;
      if (pt.type === 'saucer') this.push(x, y, S.saucer, { em: true });
      else if (pt.type === 'tele') { const on = this.game.done[pt.req]; this.push(x, y, on && (Math.floor(t * 4) & 1) ? S.owTele1 : S.owTele0, { em: true, tint: on ? 0xffffff : 0x777777 }); }
      else { this.push(pt.big ? x + 0.5 : x, pt.big ? y + 0.5 : y, pt.id === 'crater' ? S.owCrater : pt.id === 'caves' ? S.owCave : S.owCastle, { em: true }); if (this.game.done[pt.id]) this.push(x + 0.6, y + 0.9, S.owFlag, { em: true, s: 0.7 }); }
    }
    const p = s.p, px = p.px + (p.x - p.px) * a, py = p.py + (p.y - p.py) * a;
    this.push(px + 0.3, py + 0.4, (Math.floor(p.anim) & 1) ? S.benMap1 : S.benMap0, { em: true, flip: p.face < 0 });
  }
  drawLevel(a) {
    const s = this.sim, S = this.spr, bio = BIOME[s.biome], b = s.biome, t = s.t, cul = this.opts.culling;
    const [x0, x1, y0, y1] = this.view(), cx = this.camX, cy = this.camY;
    for (const L of bio.layers) {
      if (L.kind === 'stars') {
        if (L.nightOnly && !this.opts.night) continue;
        const f = 0.04, ox = cx * (1 - f), oy = cy * (1 - f), C = 2.5;
        for (let gx = Math.floor((x0 - ox) / C); gx <= Math.ceil((x1 - ox) / C); gx++) for (let gy = Math.floor((y0 - oy) / C); gy <= Math.ceil((y1 - oy) / C); gy++) {
          const h = hashf(gx, gy); if (h > 0.3) continue;
          this.push((gx + hashf(gy, gx)) * C + ox, (gy + hashf(gx + 7, gy + 3)) * C + oy, S.star, { s: 0.9, em: true, a: 0.6 + 0.4 * Math.sin(t * 1.5 + h * 60), tint: h < 0.05 ? 0xffff55 : h < 0.1 ? 0x55ffff : 0xffffff });
        }
      } else if (L.kind === 'hills') {
        const ox = cx * (1 - L.f), oy = cy * (1 - L.f) * 0.6;
        for (let ix = Math.floor(x0 - ox); ix <= Math.ceil(x1 - ox); ix++) {
          const ht = Math.round(L.base + L.amp * Math.sin(ix * 0.19 + L.f * 9) + 2 * Math.sin(ix * 0.067 + L.f * 20)) + oy, wx = ix + 0.5 + ox;
          const tn = this.opts.night ? L.nt : L.tint; this.push(wx, ht + 0.5, S[L.s], { tint: tn, em: true });
          if (ht > y0) this.push(wx, (ht + y0) / 2, S.fill, { sy: ht - y0, tint: tn, em: true });
        }
      } else if (L.kind === 'wall') {
        const ox = cx * (1 - L.f), oy = cy * (1 - L.f);
        for (let ix = Math.floor(x0 - ox); ix <= Math.ceil(x1 - ox); ix++) for (let iy = Math.floor(y0 - oy); iy <= Math.ceil(y1 - oy); iy++) this.push(ix + 0.5 + ox, iy + 0.5 + oy, S[L.s], this.opts.night ? { tint: L.nt } : { tint: L.tint, em: true });
      }
    }
    if (this.opts.stress) {
      const bx0 = cul ? Math.max(-100, Math.floor(x0)) : -100, bx1 = cul ? Math.min(299, Math.ceil(x1)) : 299, by0 = cul ? Math.max(-60, Math.floor(y0)) : -60, by1 = cul ? Math.min(64, Math.ceil(y1)) : 64;
      const sp = S[b + 'Back'];
      for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) this.push(x + 0.5, y + 0.5, sp, { tint: 0x707070 });
      this.world += 50000;
    }
    const W = s.W, H = s.H, m = s.m, fr = Math.floor(t * 3) & 1;
    const tx0 = cul ? Math.max(0, Math.floor(x0)) : 0, tx1 = cul ? Math.min(W - 1, Math.ceil(x1)) : W - 1, ty0 = cul ? Math.max(0, Math.floor(y0)) : 0, ty1 = cul ? Math.min(H - 1, Math.ceil(y1)) : H - 1;
    const names = { 6: 'R45', 7: 'L45', 8: 'R22A', 9: 'R22B', 10: 'L22A', 11: 'L22B' };
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const tt = m[y * W + x]; if (!tt) continue;
      const up = y + 1 < H ? m[(y + 1) * W + x] : T.FILL;
      let sp, op = null;
      switch (tt) {
        case T.FILL: sp = (up === T.FILL || up === T.BLOCK || isSlope(up) || up === T.DOOR_R || up === T.DOOR_B) ? S[b + 'Fill'] : S[b + 'Top']; break;
        case T.BLOCK: sp = S[b + 'Block']; break; case T.PLAT: sp = S[b + 'Plat']; break; case T.SPIKE: sp = S.spike; break;
        case T.CHOC: sp = up === T.CHOC ? (fr ? S.chocDeep1 : S.chocDeep0) : (fr ? S.chocTop1 : S.chocTop0); op = { em: true }; break;
        case T.DOOR_R: sp = S.doorRed; break; case T.DOOR_B: sp = S.doorBlue; break;
        case T.BRIDGE: sp = S.bridge; op = { a: s.bridgeOn ? 1 : 0.22 }; break;
        case T.CRYS: sp = S[bio.crys]; op = { em: true }; break;
        case T.EXIT: sp = up === T.EXIT ? S.exitBot : S.exitTop; op = { em: true }; break;
        default: sp = isSlope(tt) ? S[b + names[tt]] : null;
      }
      this.push(x + 0.5, y + 0.5, sp, op);
    }
    this.world += s.solidCount;
    const vis = (x, y, r = 2) => !cul || (x > x0 - r && x < x1 + r && y > y0 - r && y < y1 + r);
    for (const pl of s.plats) if (vis(pl.x, pl.y)) this.push(pl.x + 1, pl.y + 0.25, fr ? S.hover1 : S.hover0);
    for (const it of s.items) if (!it.taken && vis(it.x, it.y)) this.push(it.x, it.y + Math.sin(t * 3 + it.x) * 0.08, S[it.type], { s: it.type === 'usb' ? 1.2 : 1, em: true });
    for (const e of s.ents) {
      if (e.dead) continue;
      const x = e.px + (e.x - e.px) * a, y = e.py + (e.y - e.py) * a; if (!vis(x, y, 3)) continue;
      const f2 = (Math.floor(e.t * 4) & 1), flip = e.dir > 0, tint = e.stun > 0 ? 0xaaaaaa : 0xffffff, bx = x + e.w / 2;
      let sp, op = { flip, tint };
      switch (e.type) {
        case 'gloop': sp = f2 ? S.gloop1 : S.gloop0; break;
        case 'hopper': sp = e.onGround ? S.hopper0 : S.hopper1; break;
        case 'marsh': sp = e.vy > 4 || !e.onGround ? S.marsh0 : S.marsh1; break;
        case 'beetle': sp = e.state === 'charge' ? (Math.floor(e.t * 12) & 1 ? S.beetle1 : S.beetle0) : (f2 ? S.beetle1 : S.beetle0); break;
        case 'bat': sp = e.state === 'idle' && e.stun <= 0 ? S.bat0 : (Math.floor(e.t * 10) & 1 ? S.bat1 : S.bat0); break;
        case 'pod': sp = e.puff ? S.pod1 : S.pod0; break;
        case 'phantom': sp = e.alpha < 0.6 ? S.phantom1 : S.phantom0; op.a = Math.max(0.2, e.alpha); break;
        case 'roller': sp = S.roller; op.rot = e.rot; op.flip = false; break;
        case 'sentry': sp = f2 ? S.sentry1 : S.sentry0; break;
        case 'drone': sp = Math.floor(e.t * 8) & 1 ? S.drone1 : S.drone0; op.flip = false; break;
        case 'boss': sp = e.state === 'hot' || e.state === 'down' ? S.boss1 : S.boss0; op.flip = e.dir > 0; if (e.state === 'hot' && Math.floor(e.t * 8) & 1) op.tint = 0xffaaaa; break;
        case 'switch': sp = s.bridgeOn ? S.switchOn : S.switchOff; op = null; break;
        case 'terminal': sp = Math.floor(e.t * 2) & 1 ? S.terminal1 : S.terminal0; op = { em: true }; break;
        case 'cage': sp = s.hacked ? S.billy : S.billyCage; op = null; break;
      }
      if (op && !op.em) op.act = true;
      this.push(bx, y + (sp ? sp.h / 32 : 0.5) - 1 / 16, sp, op);
      if (e.stun > 0) this.push(bx, y + e.h + 0.3, Math.floor(e.t * 6) & 1 ? S.stars1 : S.stars0, { em: true });
      if (e.type === 'pod' && e.puff && e.stun <= 0) { const k = (e.t % 1); [-1.2, -2.0, e.w + 1.2, e.w + 2.0].forEach((ox, i) => this.push(x + (ox < 0 ? ox + 0.4 : ox - 0.4), y + 0.6 + k * 0.4, (i & 1) ? S.spore1 : S.spore0, { em: true, a: 0.9 })); }
    }
    this.world += s.items.length + s.ents.length + s.plats.length;
    for (const sh of s.shots) this.push(sh.x, sh.y, S[sh.kind], { em: true });
    for (const f of s.fx) this.push(f.x, f.y, S.puff, { s: 0.5 + f.t * 1.5, em: true, a: 1 - f.t / f.life, tint: f.tint });
    const p = s.p;
    if (!p.hidden) {
      const px = p.px + (p.x - p.px) * a, py = p.py + (p.y - p.py) * a;
      if (!(p.inv > 0 && Math.floor(t * 12) & 1)) {
        const sp = p.dead ? S.ben_jump : p.pogo ? (p.squash > 0 ? S.ben_pogo2 : S.ben_pogo) : p.shootT > 0 ? S.ben_shoot : !p.onGround ? S.ben_jump : Math.abs(p.vx) > 0.5 ? ((Math.floor(p.anim * 1.4) & 1) ? S.ben_run2 : S.ben_run1) : S.ben_stand;
        this.push(px + p.w / 2, py + sp.h / 32, sp, { flip: p.face < 0, rot: p.dead ? p.rot : 0, act: true });
      }
    }
  }
  updateLights(bio) {
    const s = this.sim, L = this.lightPool, t = s.t; let n = 0;
    const add = (x, y, z, r, cr, cg, cb) => { if (n >= L.length) return; const o = L[n++]; o.x = x; o.y = y; o.z = z; o.r = r; o.cr = cr; o.cg = cg; o.cb = cb; o.d = (x - this.camX) ** 2 + (y - this.camY) ** 2; };
    const p = s.p;
    if (bio.lantern && !p.hidden) { add(p.x + p.w / 2, p.y + 1.1, 1.2, 5.5, 0.95, 0.7, 0.45); L[n - 1].d = -1; }
    for (const l of s.lights) { const fl = 1.6 + 0.12 * Math.sin(t * 9 + l.x) + 0.08 * Math.sin(t * 23 + l.x * 3); add(l.x, l.y + 0.4, 1.4, 8.5, l.c[0] * fl, l.c[1] * fl, l.c[2] * fl); }
    for (const h of s.hazards) { const k = 0.6 + 0.4 * Math.sin(t * 4 + h.x); add(h.x, h.y, 0.9, 3 + h.w * 0.4, 0.96 * k * 1.3, 0.25 * k, 0.37 * k); }
    for (const sh of s.shots) add(sh.x, sh.y, 0.6, 3, sh.ben ? 0.3 : 1.2, sh.ben ? 1.1 : 0.3, sh.ben ? 1.2 : 0.3);
    for (const e of s.ents) {
      if (e.dead) continue;
      if (e.type === 'sentry') add(e.x + e.w / 2, e.y + 0.4, 0.8, 3.5, 1.3, 0.2, 0.2);
      else if (e.type === 'pod' && e.puff) add(e.x + 0.4, e.y + 0.8, 0.8, 4, 1.2, 0.3, 1.2);
      else if (e.type === 'terminal') add(e.x + 0.5, e.y + 1.2, 1, 4, 0.3, 1.2, 0.3);
      else if (e.type === 'boss' && e.state === 'hot') add(e.x + e.w / 2, e.y + 2.4, 1.2, 6, 1.4, 1.2, 0.3);
    }
    const IC = { cheezie: [0.9, 0.6, 0.15], choc: [0.7, 0.4, 0.2], cookie: [0.9, 0.7, 0.3], soda: [0.15, 0.75, 0.9], keyRed: [1.1, 0.3, 0.3], keyBlue: [0.3, 0.4, 1.2], usb: [1.2, 1.1, 0.4] };
    for (const it of s.items) if (!it.taken) { const c = IC[it.type] || IC.cheezie; add(it.x, it.y, 0.8, it.type === 'usb' || it.type.startsWith('key') ? 3.2 : 2.4, c[0], c[1], c[2]); }
    const cnt = Math.min(16, n);
    for (let k = 0; k < cnt; k++) {
      let mi = k; for (let j = k + 1; j < n; j++) if (L[j].d < L[mi].d) mi = j;
      if (mi !== k) { const tmp = L[k]; L[k] = L[mi]; L[mi] = tmp; }
      const o = L[k], lm = this.lightMul || 1; this.uLP[k].set(o.x, o.y, o.z, o.r); this.uLC[k].set(o.cr * lm, o.cg * lm, o.cb * lm);
    }
    this.uniforms.uNL.value = cnt; return cnt;
  }
}
