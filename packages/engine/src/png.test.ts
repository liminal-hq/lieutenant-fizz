// Checks the PNG writer: the header, the chunk checksums and that the pixels inflate back unchanged.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { chunk, crc32, encodePngRgba } from './png';

interface Chunk {
  type: string;
  data: Uint8Array;
  crc: number;
  crcOk: boolean;
}

function chunks(png: Uint8Array): Chunk[] {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Chunk[] = [];
  let at = 8;
  while (at < png.length) {
    const len = dv.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + len);
    const crc = dv.getUint32(at + 8 + len);
    out.push({ type, data, crc, crcOk: crc === crc32(png.subarray(at + 4, at + 8 + len)) });
    at += 12 + len;
  }
  return out;
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('gives the well-known CRC of an empty IEND chunk', () => {
    expect(chunk('IEND', new Uint8Array(0)).subarray(8)).toEqual(
      Uint8Array.from([0xae, 0x42, 0x60, 0x82]),
    );
  });
});

describe('encodePngRgba', () => {
  const rgba = Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  ]);
  const png = encodePngRgba(3, 2, rgba);

  it('starts with the PNG signature', () => {
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('writes IHDR, IDAT and IEND, each with a valid CRC', () => {
    const cs = chunks(png);
    expect(cs.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(cs.every((c) => c.crcOk)).toBe(true);
  });

  it('describes an 8-bit RGBA image of the right size', () => {
    const ihdr = chunks(png)[0]!.data;
    const dv = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    expect([dv.getUint32(0), dv.getUint32(4)]).toEqual([3, 2]);
    expect([...ihdr.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
  });

  it('inflates back to the same pixels, one filter byte per row', () => {
    const raw = inflateSync(chunks(png)[1]!.data);
    expect(raw.length).toBe(2 * (1 + 12));
    expect(raw[0]).toBe(0);
    expect(raw[13]).toBe(0);
    expect([...raw.subarray(1, 13)]).toEqual([...rgba.subarray(0, 12)]);
    expect([...raw.subarray(14, 26)]).toEqual([...rgba.subarray(12)]);
  });

  it('is deterministic', () => {
    expect(encodePngRgba(3, 2, rgba)).toEqual(png);
  });

  it('rejects a size that does not match the pixels', () => {
    expect(() => encodePngRgba(3, 3, rgba)).toThrow(/expected 36 bytes/);
    expect(() => encodePngRgba(0, 2, new Uint8Array(0))).toThrow(/bad PNG size/);
  });
});
