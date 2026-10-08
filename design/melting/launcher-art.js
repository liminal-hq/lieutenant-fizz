// Art for the Android launcher: one tileable 640×144 demo strip per episode, plus Ben's run frames and the soda cursor.
import { defineSprites, EGA } from './sprites.js';

export function buildLauncherArt() {
  const by = {}; defineSprites().forEach((d) => { by[d.name] = d; });
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const put = (x, n, px, py, tint) => { const d = by[n]; if (!d) return; for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) { const k = d.g[j][i]; if (!k || k === '.') continue; x.fillStyle = tint || EGA[k] || k; x.fillRect(px + i, py + j, 1, 1); } };
  const one = (n) => { const d = by[n]; if (!d) return ''; const [c, x] = cv(d.w, d.h); put(x, n, 0, 0); return c.toDataURL(); };
  const strip = (p) => {
    const [c, x] = cv(640, 144);
    x.fillStyle = p.sky; x.fillRect(0, 0, 640, 144);
    if (p.stars) for (let i = 0; i < 28; i++) put(x, 'star', (i * 157) % 632, (i * 61) % 50);
    if (p.orb) put(x, p.orb, 440, 10);
    for (let i = 0; i < 41; i++) put(x, 'mtnTop', i * 16 - 4, 60, p.far);
    x.fillStyle = p.far; x.fillRect(0, 76, 640, 40);
    for (let i = 0; i < 40; i++) put(x, 'hillTop', i * 16, 84, p.near);
    x.fillStyle = p.near; x.fillRect(0, 100, 640, 14);
    [[60, 'crysC'], [270, 'crysM'], [420, 'crysC'], [600, 'crysM']].forEach(([px, n]) => { const d = by[n]; if (d) put(x, n, px, 112 - d.h, p.crys); });
    for (let i = 0; i < 40; i++) { put(x, 'craterTop', i * 16, 112, p.groundTint); put(x, 'craterFill', i * 16, 128, p.fillTint); }
    [[176, 240, 72], [336, 384, 88], [496, 560, 64]].forEach(([a, b, y]) => { for (let px = a; px < b; px += 16) put(x, 'craterPlat', px, y, p.groundTint); });
    [[200, 56], [352, 72], [520, 48], [100, 96]].forEach(([px, py]) => put(x, p.pickup, px, py));
    return c.toDataURL();
  };
  return {
    demos: [
      strip({ sky: '#5555ff', far: '#aa00aa', near: '#ff55ff', orb: 'planet', pickup: 'cheezie' }),
      strip({ sky: '#000000', stars: true, far: '#0000aa', near: '#00aaaa', orb: 'moon', crys: '#55ffff', groundTint: '#555555', fillTint: '#0000aa', pickup: 'choc' }),
      strip({ sky: '#aa0000', far: '#555555', near: '#aa5500', crys: '#ffff55', groundTint: '#aaaaaa', fillTint: '#555555', pickup: 'cookie' }),
    ],
    run: [one('ben_run1'), one('ben_run2')], jump: one('ben_jump'), soda: one('soda'), cheezie: one('cheezie'),
  };
}
