// Builds the Fizz font family into packages/engine/assets/fonts as OTF and WOFF2 files.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Usage: bun scripts/build-font.ts [--check] [--specimen <file.html>]
//   --check     rebuild in memory and fail if the committed files differ (used by validate)
//   --specimen  also write a standalone HTML specimen sheet to the given path

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import wawoff2 from 'wawoff2';
import { FACES, buildFace } from '../packages/engine/src/font/build';
import { hintText } from '../packages/engine/src/font/tokens';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'packages/engine/assets/fonts');

const args = process.argv.slice(2);
const check = args.includes('--check');
const specimenAt = args.includes('--specimen') ? args[args.indexOf('--specimen') + 1] : undefined;

const same = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const built = new Map<string, { otf: Uint8Array; woff2: Uint8Array }>();
for (const face of FACES) {
  const otf = buildFace(face);
  const woff2 = new Uint8Array(await wawoff2.compress(otf));
  built.set(face.file, { otf, woff2 });
}

if (check) {
  const stale: string[] = [];
  for (const [file, { otf, woff2 }] of built) {
    for (const [ext, bytes] of [
      ['otf', otf],
      ['woff2', woff2],
    ] as const) {
      const path = join(outDir, `${file}.${ext}`);
      if (!existsSync(path) || !same(new Uint8Array(readFileSync(path)), bytes)) {
        stale.push(`${file}.${ext}`);
      }
    }
  }
  if (stale.length) {
    console.error(`Font files are out of date: ${stale.join(', ')}. Run: bun run build:font`);
    process.exit(1);
  }
  console.log(`Font files are up to date (${built.size} faces).`);
} else {
  mkdirSync(outDir, { recursive: true });
  for (const [file, { otf, woff2 }] of built) {
    writeFileSync(join(outDir, `${file}.otf`), otf);
    writeFileSync(join(outDir, `${file}.woff2`), woff2);
    console.log(`${file}: ${otf.length} B otf, ${woff2.length} B woff2`);
  }
}

if (specimenAt) {
  const faces = FACES.map((f) => {
    const b64 = Buffer.from(built.get(f.file)!.woff2).toString('base64');
    const italic = f.style.endsWith('Oblique') ? 'italic' : 'normal';
    const weight = f.style.startsWith('Bold') ? 700 : 400;
    return {
      f,
      css: `@font-face{font-family:"${f.family}";font-weight:${weight};font-style:${italic};src:url(data:font/woff2;base64,${b64}) format("woff2");font-display:block}`,
    };
  });
  const sample = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789 .,:;!?‽\'"‘’“”-–—…·«»×&+=/#%*()[]{}<>@$^_|~`\\',
    'é è ê ë à â ç ô û ù î ï É È Ê À Ç Ô  → ← ↑ ↓ ► ◄ ▸ ♪',
    '🙂😀😉😮😢😠😎❤⭐✓✗👍🍁👽🛸🥤☕💾🎮🔊🔇🔒⚡🏆',
    '┌─┬─┐╔═╦═╗',
    '├─┼─┤╠═╬═╣',
    '└─┴─┘╚═╩═╝',
    '│ │ │║ ║ ║',
    '',
    hintText(
      '{A} {B} {X} {Y} {LB} {RB} {LT} {RT} {Start} {Select} {Esc} {Enter} {[Page Up]} {[Z]}',
    ),
  ];
  const rows = faces
    .map(({ f }) => {
      const weight = f.style.startsWith('Bold') ? 700 : 400;
      const italic = f.style.endsWith('Oblique') ? 'italic' : 'normal';
      return `<h2>${f.family} ${f.style}</h2><pre style="font-family:'${f.family}';font-weight:${weight};font-style:${italic}">${sample
        .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;'))
        .join('\n')}</pre>`;
    })
    .join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Fizz specimen</title><style>${faces
    .map((x) => x.css)
    .join('')}
body{background:#050507;color:#e0e0e0;margin:24px;font:14px system-ui}h2{color:#ffaa40;font:14px system-ui;margin:24px 0 4px}
pre{margin:0;font-size:33px;line-height:33px;text-rendering:optimizeSpeed;-webkit-font-smoothing:none}</style>${rows}`;
  writeFileSync(specimenAt, html);
  console.log(`Specimen written to ${specimenAt}`);
}
