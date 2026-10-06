// Sound effects + music. Prefers Liminal HQ's Undertone (procedural Web Audio synth, Strudel-style
// mini-notation). If the package can't be loaded, a tiny built-in synth plays the same patterns.
const UNDERTONE_URLS = ['https://esm.sh/@liminal-hq/undertone@0.2.0', 'https://cdn.jsdelivr.net/npm/@liminal-hq/undertone@0.2.0/+esm'];

// ---------- One-shot SFX (Undertone voice controls as data) ----------
const V = (n, o) => Object.assign({ n, w: 'triangle', a: 0.001, d: 0.1, r: 0.05, g: 0.4 }, o);
export const SFX = {
  jump: [V('e4', { w: 'square', d: 0.08, g: 0.18, lpf: 2200 }), V('b4', { w: 'square', d: 0.1, g: 0.16, lpf: 2600, nudge: 0.035 })],
  boing: [V('g3', { d: 0.14, g: 0.45 }), V('g4', { d: 0.1, g: 0.3, nudge: 0.04 }), V('d5', { w: 'sine', d: 0.08, g: 0.2, nudge: 0.07 })],
  fzzt: [V('white', { d: 0.08, g: 0.22, hpf: 3000 }), V('c6', { w: 'sine', d: 0.12, g: 0.25, slide: 0.08 })],
  crunch: [V('white', { d: 0.03, g: 0.3, lpf: 2500 }), V('c5', { d: 0.1, g: 0.35, lpf: 4000 }), V('e5', { d: 0.14, g: 0.35, lpf: 4500, nudge: 0.05 })],
  soda: [V('white', { a: 0.03, d: 0.3, g: 0.18, hpf: 5000 }), V('a5', { w: 'sine', d: 0.2, g: 0.2, nudge: 0.05 })],
  key: [V('c5', { d: 0.1, g: 0.35 }), V('e5', { d: 0.1, g: 0.35, nudge: 0.07 }), V('g5', { d: 0.2, g: 0.35, nudge: 0.14 })],
  usb: [V('g5', { d: 0.1, g: 0.35 }), V('c6', { d: 0.1, g: 0.35, nudge: 0.08 }), V('e6', { d: 0.1, g: 0.35, nudge: 0.16 }), V('g6', { w: 'sine', d: 0.35, g: 0.3, nudge: 0.24 })],
  stun: [V('a4', { w: 'square', d: 0.12, g: 0.2, lpf: 1500, slide: 0.12 }), V('white', { d: 0.05, g: 0.15, hpf: 4000 })],
  plink: [V('c7', { w: 'sine', d: 0.05, g: 0.25 })],
  bonk: [V('c2', { d: 0.1, g: 0.6, slide: 0.07, lpf: 400 }), V('white', { d: 0.02, g: 0.3, lpf: 3000 })],
  hurt: [V('a3', { w: 'square', d: 0.45, g: 0.3, lpf: 900, slide: 0.4 }), V('e3', { w: 'square', d: 0.4, g: 0.25, lpf: 700, slide: 0.35, nudge: 0.15 })],
  clunk: [V('c2', { d: 0.15, g: 0.6, lpf: 300 }), V('brown', { d: 0.08, g: 0.4, lpf: 800 })],
  click: [V('a5', { w: 'sine', d: 0.06, g: 0.3, lpf: 3000 }), V('white', { a: 0, d: 0.008, g: 0.12, lpf: 6000 })],
  life: [V('c5', { d: 0.1, g: 0.35 }), V('e5', { d: 0.1, g: 0.35, nudge: 0.09 }), V('g5', { d: 0.1, g: 0.35, nudge: 0.18 }), V('c6', { w: 'sine', d: 0.3, g: 0.35, nudge: 0.27 })],
  vworp: [V('c5', { w: 'sawtooth', d: 0.4, g: 0.18, lpf: 2000, slide: 0.35 }), V('g5', { w: 'sine', d: 0.35, g: 0.2, slide: 0.3, nudge: 0.1 })],
  zap: [V('e5', { w: 'square', d: 0.08, g: 0.12, lpf: 2500, slide: 0.1 })],
  thoom: [V('c1', { w: 'sine', d: 0.4, g: 0.9, slide: 0.2 }), V('brown', { d: 0.3, g: 0.5, lpf: 600 })],
  clang: [V('a5', { d: 0.4, g: 0.3 }), V('e6', { w: 'sine', d: 0.3, g: 0.2 }), V('white', { d: 0.05, g: 0.2, hpf: 4000 })],
  zzzap: [V('c6', { w: 'sawtooth', d: 0.3, g: 0.2, lpf: 3000, slide: 0.25 }), V('white', { d: 0.2, g: 0.2, hpf: 2000 }), V('c3', { w: 'square', d: 0.25, g: 0.2, lpf: 800, nudge: 0.05 })],
  win: [V('c5', { d: 0.1, g: 0.35 }), V('e5', { d: 0.1, g: 0.35, nudge: 0.08 }), V('g5', { d: 0.1, g: 0.35, nudge: 0.16 }), V('c6', { d: 0.1, g: 0.35, nudge: 0.24 }), V('e6', { w: 'sine', d: 0.4, g: 0.35, nudge: 0.32 })],
  beep: [V('c6', { w: 'square', d: 0.05, g: 0.15, lpf: 3000 }), V('g5', { w: 'square', d: 0.05, g: 0.15, lpf: 3000, nudge: 0.09 }), V('e6', { w: 'square', d: 0.08, g: 0.15, lpf: 3000, nudge: 0.18 })],
  pfff: [V('pink', { a: 0.01, d: 0.22, g: 0.25, lpf: 1500 })],
  snort: [V('brown', { d: 0.15, g: 0.4 }), V('c2', { w: 'sawtooth', d: 0.12, g: 0.25, lpf: 400 })],
  skree: [V('b6', { w: 'sawtooth', d: 0.15, g: 0.1, lpf: 4000, slide: 0.2 })],
  krunch: [V('brown', { d: 0.3, g: 0.55 }), V('c1', { d: 0.2, g: 0.5, slide: 0.1 })],
  bwomp: [V('g2', { w: 'sine', d: 0.18, g: 0.5, slide: 0.15 })],
  sproing: [V('c3', { d: 0.2, g: 0.45 }), V('c4', { d: 0.15, g: 0.35, nudge: 0.05 }), V('g4', { d: 0.15, g: 0.3, nudge: 0.1 }), V('c5', { w: 'sine', d: 0.2, g: 0.25, nudge: 0.15 })],
  poof: [V('white', { a: 0.02, d: 0.15, g: 0.25, lpf: 2000 })],
  splorp: [V('e2', { w: 'sine', d: 0.15, g: 0.4, slide: 0.12 }), V('pink', { d: 0.06, g: 0.15, lpf: 1200 })],
  menu: [V('a5', { w: 'sine', d: 0.06, g: 0.3, lpf: 3000 }), V('white', { a: 0, d: 0.008, g: 0.1, lpf: 6000 })]
};
const CAPTION_SFX = { boing: 'boing', fzzt: 'fzzt', crunch: 'crunch', fsssht: 'soda', 'red gumdrop': 'key', 'blue gumdrop': 'key', 'gold USB drive': 'usb', fizzled: 'stun', plink: 'plink', blorp: 'bwomp', bonk: 'bonk', 'whoa!': 'hurt', clunk: 'clunk', 'click-clack': 'click', 'ding! extra life': 'life', vworp: 'vworp', 'zap zap zap': 'zap', brrrt: 'zap', THOOM: 'thoom', 'CLANG — dome open!': 'clang', ZZZAP: 'zzzap', 'ta-da!': 'win', 'beep boop': 'beep', pfff: 'pfff', snort: 'snort', thunk: 'clunk', skreee: 'skree', KRUNCH: 'krunch', bwomp: 'bwomp', sproing: 'sproing', poof: 'poof', splorp: 'splorp', 'click — no fizz': 'plink', 'needs a drive': 'plink' };

// ---------- Music (mini-notation, shared by both back ends) ----------
const P = (notes, o) => Object.assign({ notes, w: 'triangle', a: 0.005, d: 0.12, s: 0.3, r: 0.08, g: 0.2 }, o);
const kick = (pat, g = 0.7) => P(pat, { w: 'sine', d: 0.12, s: 0, r: 0.06, g, slide: 0.09 });
const hats = (pat, g = 0.1) => P(pat, { noise: true, d: 0.03, s: 0, r: 0.01, g, hpf: 6000 });
const snare = (pat, g = 0.28) => P(pat, { noise: true, d: 0.09, s: 0, r: 0.05, g, hpf: 1600 });
const pad = (notes, o) => P(notes, Object.assign({ w: 'sine', a: 0.6, d: 0.5, s: 0.7, r: 1.1, g: 0.07, lpf: 1400, room: 0.5 }, o));
const bell = (notes, o) => P(notes, Object.assign({ w: 'sine', a: 0.002, d: 0.35, s: 0.05, r: 0.4, g: 0.07, delay: 0.4 }, o));
export const MUSIC = {
  // Title: bright C-major theme, eight bars, call-and-answer between lead and bass.
  title: { bpm: 140, parts: [
    P('<[c5 ~ g4 c5 e5 g5 e5 c5] [a4 ~ e4 a4 c5 e5 c5 a4] [f4 a4 c5 f5 e5 c5 a4 c5] [g4 b4 d5 g5 f5 d5 b4 d5] [e5 ~ e5 g5 c6 ~ b5 g5] [a5 ~ g5 e5 c5 ~ e5 a5] [f5 e5 d5 c5 d5 ~ b4 d5] [c5 ~ g4 ~ c5 ~ ~ ~]>', { w: 'square', g: 0.075, lpf: 2600, d: 0.1 }),
    pad('<[c4,e4,g4] [a3,c4,e4] [f3,a3,c4] [g3,b3,d4] [c4,e4,g4] [a3,c4,e4] [f3,a3,d4] [c4,e4,g4]>', { g: 0.05, a: 0.05, room: 0.3 }),
    P('<[c2 c3 g2 c3] [a1 a2 e2 a2] [f1 f2 c2 f2] [g1 g2 d2 g2] [c2 c3 g2 c3] [a1 a2 e2 a2] [f2 f2 g2 g2] [c2 g1 c2 ~]>', { g: 0.3, s: 0.45 }),
    kick('c1 ~ ~ c1 c1 ~ ~ ~', 0.6), snare('~ white ~ white', 0.24), hats('[~ white]*4', 0.08)] },
  // Opening 1: the backyard at night. Music box over a soft pad, crickets.
  yard: { bpm: 76, parts: [
    bell('<[a5 e5 c5 e5] [b5 e5 c5 e5] [c6 f5 a5 f5] [b5 e5 g#5 e5]>'),
    pad('<[a3,c4,e4] [g3,b3,e4] [f3,a3,c4] [e3,g#3,b3]>'),
    P('<a1 e1 f1 e1>', { g: 0.16, s: 0.8, r: 0.6 }),
    P('[white ~ white ~ ~ ~ ~ ~ white white ~ ~ ~ ~ ~ ~]', { noise: true, d: 0.015, s: 0, r: 0.01, g: 0.03, hpf: 9000 })] },
  // Opening 2: the secret lab. Curious D-dorian arpeggio, stray bleeps.
  lab: { bpm: 110, parts: [
    P('<[d4 a4 d5 a4 f5 a4 d5 a4] [c4 g4 c5 g4 e5 g4 c5 g4] [a#3 f4 a#4 f4 d5 f4 a#4 f4] [c4 g4 c5 g4 e5 g4 e5 g5]>', { w: 'square', g: 0.045, lpf: 1700, d: 0.08 }),
    bell('~ <d6 a5 f6 e6> ~ ~ ~ ~ <a6 c6> ~', { g: 0.05, d: 0.06, delay: 0.5 }),
    P('<[d2 ~ d2 a1] [c2 ~ c2 g1] [a#1 ~ a#1 f1] [c2 ~ c2 g1]>', { g: 0.28, s: 0.5 }),
    kick('c1 ~ ~ ~ c1 ~ ~ ~', 0.45), hats('~ white ~ white', 0.05)] },
  // Opening 3: liftoff. Chords climb a step every bar, snare roll on the turn.
  launch: { bpm: 128, parts: [
    P('<[c5 e5 g5 c6]*2 [d5 f#5 a5 d6]*2 [e5 g#5 b5 e6]*2 [f5 a5 c6 f6]*2>', { w: 'square', g: 0.06, lpf: 2400, d: 0.07 }),
    P('<[c3,g3,c4,e4] [d3,a3,d4,f#4] [e3,b3,e4,g#4] [f3,c4,f4,a4]>', { w: 'sawtooth', a: 0.2, s: 0.7, r: 0.4, g: 0.04, lpf: 1000 }),
    P('<[c2 c2 c3 c2] [d2 d2 d3 d2] [e2 e2 e3 e2] [f2 f2 f3 g2]>', { g: 0.3, s: 0.4 }),
    kick('c1*4', 0.6), snare('<[~ white ~ white] [~ white ~ white] [~ white ~ white] [~ white [white white] [white white white white]]>', 0.22), hats('white*8', 0.07)] },
  // Deep space: F lydian, wide pad, sparkling arpeggio, slow melody with echo.
  cine: { bpm: 84, parts: [
    pad('<[f3,a3,c4,e4] [g3,b3,d4,e4] [a3,c4,e4,g4] [d3,f3,a3,c4]>', { g: 0.08 }),
    P('<[c5 ~ e5 ~ g5 ~ ~ ~] [b4 ~ d5 ~ e5 ~ ~ ~] [c5 ~ e5 ~ a5 ~ g5 ~] [a4 ~ c5 ~ f5 ~ e5 ~]>', { w: 'triangle', a: 0.02, d: 0.3, s: 0.2, r: 0.4, g: 0.07, delay: 0.4 }),
    bell('<[f5 c6 a5 e6]*2 [g5 d6 b5 e6]*2 [a5 e6 c6 g6]*2 [d5 a5 f5 c6]*2>', { g: 0.03, d: 0.1, s: 0, delay: 0.3 }),
    P('<f1 g1 a1 d2>', { w: 'sawtooth', a: 1, s: 0.6, r: 1.5, g: 0.06, lpf: 350 }),
    kick('c1 ~ ~ ~', 0.3)] },
  // Overworld: jaunty oom-pah walk in F.
  map: { bpm: 112, parts: [
    P('<[a4 c5 ~ a4 g4 ~ f4 ~] [g4 a#4 ~ g4 f4 ~ e4 ~] [f4 a4 c5 f5 e5 c5 a4 c5] [d5 ~ c5 ~ a#4 ~ g4 ~] [a4 c5 ~ a4 g4 ~ f4 ~] [g4 a#4 ~ d5 c5 ~ a4 ~] [a#4 d5 f5 d5 c5 a4 g4 e4] [f4 ~ c4 ~ f4 ~ ~ ~]>', { g: 0.13, d: 0.16, s: 0.3 }),
    P('<[~ [a3,c4,f4] ~ [a3,c4,f4]] [~ [g3,c4,e4] ~ [g3,c4,e4]] [~ [a3,c4,f4] ~ [a3,c4,f4]] [~ [a#3,d4,f4] ~ [a#3,d4,f4]] [~ [a3,c4,f4] ~ [a3,c4,f4]] [~ [g3,c4,e4] ~ [g3,c4,e4]] [~ [a#3,d4,f4] ~ [g3,c4,e4]] [~ [a3,c4,f4] ~ ~]>', { w: 'square', g: 0.03, lpf: 1400, d: 0.08, s: 0 }),
    P('<[f2 ~ c3 ~] [c2 ~ g2 ~] [f2 ~ c3 ~] [a#1 ~ f2 ~] [f2 ~ c3 ~] [c2 ~ g2 ~] [a#1 ~ c2 ~] [f2 c2 f2 ~]>', { g: 0.3, s: 0.5 }),
    hats('~ white ~ white', 0.06), kick('c1 ~ c1 ~', 0.4)] },
  // Crater Fields: driving A-minor run-and-jump.
  crater: { bpm: 148, parts: [
    P('<[a4 ~ c5 e5 a5 ~ g5 e5] [f5 ~ e5 c5 a4 ~ c5 e5] [d5 ~ f5 a5 g5 f5 e5 d5] [e5 ~ b4 ~ g#4 ~ b4 ~] [a4 ~ c5 e5 a5 ~ b5 c6] [b5 ~ a5 g5 f5 ~ e5 f5] [d5 e5 f5 g5 a5 g5 f5 d5] [e5 ~ ~ ~ e4 ~ ~ ~]>', { w: 'square', g: 0.07, lpf: 2300, d: 0.09 }),
    P('<[a2 a2 a3 a2 a2 a2 a3 g2] [f2 f2 f3 f2 f2 f2 f3 e2] [d2 d2 d3 d2 d2 d2 d3 c2] [e2 e2 e3 e2 e2 e2 e3 g#2]>', { g: 0.3, s: 0.35, d: 0.08 }),
    P('<[c4,e4] [a3,c4] [f3,a3] [g#3,b3]>', { w: 'square', a: 0.05, s: 0.6, g: 0.025, lpf: 900 }),
    kick('c1 ~ ~ c1 c1 ~ ~ ~'), snare('~ white ~ white'), hats('white*8')] },
  // Crystal Caves: dripping, echoing D minor.
  caves: { bpm: 92, parts: [
    pad('<[d3,f3,a3] [a#2,d3,f3] [g2,a#2,d3] [a2,c#3,e3]>', { g: 0.09, room: 0.6 }),
    bell('[~ ~ <d6 a5 f6 c#6> ~ ~ ~ ~ ~ ~ <a5 f5> ~ ~ ~ ~ ~ ~]', { g: 0.055, d: 0.06, delay: 0.55 }),
    P('<[d5 ~ ~ e5 f5 ~ e5 ~] [d5 ~ ~ ~ a4 ~ ~ ~] [a#4 ~ ~ c5 d5 ~ f5 ~] [e5 ~ ~ ~ c#5 ~ ~ ~]>', { w: 'triangle', g: 0.07, d: 0.3, s: 0.3, delay: 0.3 }),
    P('<d2 a#1 g1 a1>', { g: 0.24, s: 0.8, r: 0.3 }),
    kick('c1 ~ ~ ~ ~ ~ c1 ~', 0.4), hats('~ ~ white ~', 0.04)] },
  // Mildred's Citadel: menacing G-minor march with organ chords.
  citadel: { bpm: 124, parts: [
    P('<[g4 ~ g4 a#4 d5 ~ c5 a#4] [a4 ~ a4 c5 d5 ~ f5 d5] [d#5 ~ d5 c5 a#4 ~ a4 g4] [f#4 ~ a4 c5 d5 ~ ~ ~] [g5 ~ f5 d#5 d5 ~ c5 a#4] [c5 ~ a#4 a4 g4 ~ a4 a#4] [d#5 d5 c5 a#4 a4 g4 f#4 a4] [g4 ~ d4 ~ g4 ~ ~ ~]>', { w: 'square', g: 0.07, lpf: 2000 }),
    P('<[g3,a#3,d4] [f3,a3,d4] [d#3,g3,a#3] [d3,f#3,a3] [g3,a#3,d4] [d#3,g3,c4] [c3,d#3,g3] [d3,f#3,a3]>', { w: 'sine', a: 0.05, s: 0.6, g: 0.05 }),
    P('<[g2 d3 g2 d3] [f2 c3 f2 c3] [d#2 a#2 d#2 a#2] [d2 a2 d2 f#2] [g2 d3 g2 d3] [d#2 a#2 d#2 a#2] [c2 g2 c2 g2] [d2 a2 d2 ~]>', { g: 0.3, s: 0.4 }),
    kick('c1 ~ c1 ~'), snare('~ white ~ [white white]', 0.24), hats('white*4', 0.07)] },
  // Cocoa Colossus: frantic E minor.
  boss: { bpm: 172, parts: [
    P('<[e5 e5 g5 e5 a5 g5 f#5 d5] [e5 e5 g5 e5 b5 a5 g5 f#5] [c6 b5 a5 g5 a5 g5 f#5 e5] [d#5 ~ f#5 ~ b5 ~ a5 f#5]>', { w: 'sawtooth', g: 0.055, lpf: 1900, d: 0.08 }),
    P('<[e2 e2 e3 e2 e2 e3 d3 e2] [e2 e2 e3 e2 e2 e3 d3 e2] [c2 c2 c3 c2 c2 c3 b2 c2] [b1 b1 b2 b1 b1 b2 a2 d#2]>', { w: 'square', g: 0.12, lpf: 600, s: 0.3 }),
    kick('c1*4', 0.65), hats('white*8', 0.09), snare('~ white ~ white', 0.3)] },
  // Ending: triumphant reprise of the title in C.
  ending: { bpm: 116, parts: [
    P('<[c5 ~ g4 c5 e5 ~ d5 c5] [f5 ~ e5 d5 c5 ~ a4 c5] [d5 ~ b4 d5 g5 ~ f5 e5] [e5 ~ d5 ~ c5 ~ ~ ~] [e5 ~ f5 g5 a5 ~ g5 f5] [e5 ~ d5 c5 a4 ~ c5 e5] [f5 e5 d5 c5 b4 c5 d5 b4] [c5 g4 c5 e5 g5 c6 ~ ~]>', { w: 'square', g: 0.08, lpf: 2600 }),
    pad('<[c4,e4,g4] [f3,a3,c4] [g3,b3,d4] [c4,e4,g4] [a3,c4,f4] [a3,c4,e4] [f3,g3,b3,d4] [c4,e4,g4]>', { g: 0.06, a: 0.1, room: 0.3 }),
    P('<[c2 g2 c3 g2] [f2 c3 f2 c3] [g2 d3 g2 d3] [c2 g2 c2 g2] [f2 c3 f2 c3] [a1 e2 a2 e2] [g1 d2 g2 d2] [c2 g2 c3 ~]>', { g: 0.3, s: 0.4 }),
    kick('c1 ~ c1 ~'), hats('white*8', 0.08), snare('~ white ~ white')] }
};

// ---------- Fallback synth: a small mini-notation subset + Web Audio voices ----------
function parseMini(src) {
  let i = 0; const s = src;
  const ws = () => { while (s[i] === ' ') i++; };
  const seq = close => { const items = []; for (;;) { ws(); if (i >= s.length || s[i] === close || s[i] === ',') break; items.push(item()); } return { t: 'seq', items }; };
  const group = (close, kind) => { i++; const parts = [seq(close)]; while (s[i] === ',') { i++; parts.push(seq(close)); } i++; return parts.length > 1 ? { t: 'stack', parts } : kind === 'alt' ? { t: 'alt', items: parts[0].items } : parts[0]; };
  const atom = () => { if (s[i] === '[') return group(']', 'seq'); if (s[i] === '<') return group('>', 'alt'); let w = ''; while (i < s.length && !' []<>,*'.includes(s[i])) w += s[i++]; return w === '~' ? { t: 'rest' } : { t: 'word', v: w }; };
  const item = () => { const a = atom(); if (s[i] === '*') { i++; let n = ''; while (/[0-9]/.test(s[i])) n += s[i++]; a.rep = +n; } return a; };
  return seq(null);
}
function evalMini(node, t0, t1, cyc, out) {
  const rep = node.rep || 1, d = (t1 - t0) / rep;
  for (let k = 0; k < rep; k++) {
    const a = t0 + k * d, b = a + d, c = cyc * rep + k;
    if (node.t === 'word') out.push({ t0: a, t1: b, v: node.v });
    else if (node.t === 'seq') { const n = node.items.length; node.items.forEach((it, j) => evalMini(it, a + (b - a) * j / n, a + (b - a) * (j + 1) / n, c, out)); }
    else if (node.t === 'alt') evalMini(node.items[((c % node.items.length) + node.items.length) % node.items.length], a, b, Math.floor(c / node.items.length), out);
    else if (node.t === 'stack') node.parts.forEach(p => evalMini(p, a, b, c, out));
  }
}
const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function hz(name) { const m = /^([a-g])(#|b)?(-?\d)$/.exec(name); if (!m) return 440; const n = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12; return 440 * Math.pow(2, (n - 69) / 12); }

class MiniSynth {
  constructor(ctx, out) { this.ctx = ctx; this.out = out; this.noise = {};
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.33; const fb = ctx.createGain(); fb.gain.value = 0.35; this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(out); }
  noiseBuf(kind) {
    if (this.noise[kind]) return this.noise[kind];
    const ctx = this.ctx, len = ctx.sampleRate * 1.5, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let l = 0, p0 = 0, p1 = 0, p2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (kind === 'brown') { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else if (kind === 'pink') { p0 = 0.997 * p0 + w * 0.029591; p1 = 0.985 * p1 + w * 0.032534; p2 = 0.95 * p2 + w * 0.048056; d[i] = (p0 + p1 + p2 + w * 0.05) * 1.5; } else d[i] = w; }
    return (this.noise[kind] = b);
  }
  voice(v, when, dur, gated) {
    const ctx = this.ctx, t = when + (v.nudge || 0), isNoise = v.n === 'white' || v.n === 'pink' || v.n === 'brown';
    let src;
    if (isNoise) { src = ctx.createBufferSource(); src.buffer = this.noiseBuf(v.n); }
    else { src = ctx.createOscillator(); src.type = v.w; const f = hz(v.n); if (v.slide) { src.frequency.setValueAtTime(f * 2, t); src.frequency.exponentialRampToValueAtTime(f, t + v.slide); } else src.frequency.setValueAtTime(f, t); }
    let node = src;
    if (v.lpf) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = v.lpf; node.connect(f); node = f; }
    if (v.hpf) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = v.hpf; node.connect(f); node = f; }
    const g = ctx.createGain(), a = v.a || 0.001, d = v.d || 0.1, s = gated ? (v.s ?? 0) : 0, r = v.r || 0.05, peak = v.g;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.linearRampToValueAtTime(peak * s, t + a + d);
    const end = gated ? Math.max(t + a + d, t + dur) : t + a + d; g.gain.setValueAtTime(peak * s, end); g.gain.linearRampToValueAtTime(0, end + r);
    node.connect(g); g.connect(this.out);
    if (v.delay) { const sg = ctx.createGain(); sg.gain.value = v.delay; g.connect(sg); sg.connect(this.delay); }
    src.start(t); src.stop(end + r + 0.05);
  }
  playSfx(list, vol) { const t = this.ctx.currentTime + 0.01; for (const v of list) this.voice(Object.assign({}, v, { g: v.g * vol }), t, 0, false); }
  loop(track, vol) {
    const ctx = this.ctx, cyc = 240 / track.bpm, parsed = track.parts.map(p => ({ p, tree: parseMini(p.notes) }));
    let c = 0, next = ctx.currentTime + 0.1, stopped = false;
    const tick = () => {
      if (stopped) return;
      while (next < ctx.currentTime + 0.3) {
        for (const { p, tree } of parsed) {
          const ev = []; evalMini(tree, 0, 1, c, ev);
          for (const e of ev) this.voice({ n: p.noise ? e.v : e.v, w: p.w, a: p.a, d: p.d, s: p.s, r: p.r, g: p.g * vol, lpf: p.lpf, hpf: p.hpf, slide: p.slide, delay: p.delay }, next + e.t0 * cyc, (e.t1 - e.t0) * cyc, true);
        }
        c++; next += cyc;
      }
    };
    tick(); const id = setInterval(tick, 50);
    return { stop: () => { stopped = true; clearInterval(id); } };
  }
}

// ---------- Public audio manager ----------
export class GameAudio {
  constructor() {
    if (window.__mabAudio) window.__mabAudio.dispose();
    window.__mabAudio = this;
    this.music = true; this.sfx = true; this.musicVol = 1; this.sfxVol = 1; this.track = null; this.handle = null; this.ut = null; this.backend = 'loading'; this.cache = {}; }
  async init() {
    for (const url of UNDERTONE_URLS) {
      try { const m = await Promise.race([import(url), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]); if (m && m.note && m.stack) { this.ut = m; this.backend = 'Undertone 0.2'; break; } }
      catch (e) { console.warn('Undertone unavailable from', url, e && e.message); }
    }
    if (!this.ut) this.backend = 'Built-in synth';
    if (this.disposed) return this.backend;
    this.unlock = () => { if (this.disposed) return; this.ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };
    window.addEventListener('pointerdown', this.unlock); window.addEventListener('keydown', this.unlock);
    return this.backend;
  }
  dispose() {
    this.disposed = true;
    if (this.handle) { try { this.handle.stop(); } catch (e) { } this.handle = null; }
    if (this.unlock) { window.removeEventListener('pointerdown', this.unlock); window.removeEventListener('keydown', this.unlock); }
    if (this.ctx) { try { this.ctx.close(); } catch (e) { } }
    if (window.__mabAudio === this) window.__mabAudio = null;
  }
  ensure() {
    if (this.disposed) return null;
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    this.ctx = new AC();
    this.mini = new MiniSynth(this.ctx, this.ctx.destination);
    if (this.pending) { const t = this.pending; this.pending = null; this.playMusic(t, true); }
    return this.ctx;
  }
  utVoice(v, vol, gatedPart) {
    const U = this.ut, isNoise = v.n === 'white' || v.n === 'pink' || v.n === 'brown' || v.noise;
    let p = isNoise ? U.sound(v.notes || v.n) : U.note(v.notes || v.n).sound(v.w);
    p = p.attack(v.a ?? 0.001).decay(v.d ?? 0.1).release(v.r ?? 0.05).gain(v.g * vol);
    if (gatedPart) p = p.sustain(v.s ?? 0.3); else p = p.sustain(0);
    if (v.lpf) p = p.lpf(v.lpf); if (v.hpf) p = p.hpf(v.hpf); if (v.slide) p = p.slide(v.slide); if (v.nudge) p = p.nudge(v.nudge);
    if (v.room) p = p.room(v.room).roomsize(6).orbit(1); if (v.delay) p = p.delay(v.delay).delaytime(0.33).delayfeedback(0.35).orbit(2);
    return p;
  }
  play(name) {
    if (!this.sfx || !SFX[name]) return;
    const ctx = this.ensure(); if (!ctx || ctx.state !== 'running') return;
    try {
      if (this.ut) { const k = name + this.sfxVol; if (!this.cache[k]) this.cache[k] = this.ut.stack(...SFX[name].map(v => this.utVoice(v, this.sfxVol, false))); this.cache[k].play({ ctx }); }
      else this.mini.playSfx(SFX[name], this.sfxVol);
    } catch (e) { console.warn('sfx', name, e); }
  }
  caption(text) { const k = CAPTION_SFX[text]; if (k) this.play(k); }
  playMusic(track, force) {
    if (this.disposed) return;
    if (track === this.track && !force) return;
    this.track = track;
    if (this.handle) { try { this.handle.stop(); } catch (e) { } this.handle = null; }
    if (!this.music || !track || !MUSIC[track]) return;
    const ctx = this.ctx; if (!ctx) { this.pending = track; return; }
    const T = MUSIC[track];
    try {
      if (this.ut) this.handle = this.ut.stack(...T.parts.map(p => this.utVoice(p, this.musicVol, true))).loop({ ctx, bpm: T.bpm });
      else this.handle = this.mini.loop(T, this.musicVol);
    } catch (e) { console.warn('music', track, e); }
  }
  setMusic(on) {
    this.music = on;
    if (this.handle) { try { this.handle.stop(); } catch (e) { } this.handle = null; }
    if (on && this.track) this.playMusic(this.track, true);
  }
  setSfx(on) { this.sfx = on; }
  setActive(on) { this.active = on; if (!this.ctx || this.disposed) return; try { on ? this.ctx.resume() : this.ctx.suspend(); } catch (e) { } }
}
