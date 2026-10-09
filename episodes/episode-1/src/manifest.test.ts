// Checks the web manifest: that it parses, that every icon is on disk at the size it claims, and its URLs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pub = join(dirname(fileURLToPath(import.meta.url)), '../public');

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}
const manifest = JSON.parse(readFileSync(join(pub, 'manifest.webmanifest'), 'utf8')) as {
  id: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  icons: Icon[];
};

/** The width and height in a PNG's IHDR chunk. */
function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect([...b.subarray(0, 8)], `${file} is a PNG`).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(b.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('manifest.webmanifest', () => {
  it('has an absolute id and relative start_url and scope, so it works under any base path', () => {
    expect(manifest.id).toBe('/lieutenant-fizz/episode-1/');
    expect(manifest.id.startsWith('/')).toBe(true);
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
  });

  it('asks for a fullscreen landscape launch', () => {
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.orientation).toBe('landscape');
  });

  it('lists a 192 and a 512 icon for both "any" and "maskable"', () => {
    for (const purpose of ['any', 'maskable']) {
      const sizes = manifest.icons
        .filter((i) => i.purpose === purpose && i.type === 'image/png')
        .map((i) => i.sizes);
      expect(sizes.sort(), purpose).toEqual(['192x192', '512x512']);
    }
  });

  it('points every icon at a file that exists, with relative paths', () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/'), icon.src).toBe(false);
      expect(existsSync(join(pub, icon.src)), icon.src).toBe(true);
    }
  });

  it('declares the size of every PNG icon as the size in the file', () => {
    for (const icon of manifest.icons.filter((i) => i.type === 'image/png')) {
      const [w, h] = pngSize(join(pub, icon.src));
      expect(icon.sizes, icon.src).toBe(`${w}x${h}`);
    }
  });

  it('has the Home Screen and tab icons the page head links to', () => {
    expect(pngSize(join(pub, 'icons/apple-touch-icon.png'))).toEqual([180, 180]);
    expect(pngSize(join(pub, 'icons/favicon-32.png'))).toEqual([32, 32]);
  });
});
