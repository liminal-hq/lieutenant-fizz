// Tests for reading a zip: one the engine wrote, one another writer made, and the ways a file can be wrong.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildZip } from './zip';
import { readZip } from './zip-read';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('readZip', () => {
  it('reads a zip the engine wrote, stored and deflated', async () => {
    const big = text('{"e":"pos"}\n'.repeat(500));
    const zip = await buildZip([
      { name: 'a.txt', data: text('hello') },
      { name: 'big.txt', data: big },
    ]);
    const files = await readZip(zip);
    expect(files.map((f) => f.name)).toEqual(['a.txt', 'big.txt']);
    expect(new TextDecoder().decode(files[0]!.data)).toBe('hello');
    expect(files[1]!.data).toEqual(big);
  });

  it('reads a zip made by a different writer', async () => {
    // Hand-built with Node's deflate, so it shares nothing with the engine's writer.
    const data = text('the quick brown fox '.repeat(100));
    const body = new Uint8Array(deflateRawSync(data));
    const { crc32 } = await import('node:zlib');
    const name = text('fox.txt');
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc32(data), true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc32(data), true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    central.set(name, 46);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true);
    ev.setUint32(16, local.length + body.length, true);
    const zip = new Uint8Array([...local, ...body, ...central, ...end]);
    const [file] = await readZip(zip);
    expect(file!.name).toBe('fox.txt');
    expect(file!.data).toEqual(data);
  });

  it('refuses what is not a zip, a damaged zip and a failed check, with a plain message', async () => {
    await expect(readZip(text('not a zip'))).rejects.toThrow('not a zip');
    await expect(readZip(new Uint8Array(100))).rejects.toThrow('not a zip');
    const zip = await buildZip([{ name: 'a.txt', data: text('hello') }]);
    const broken = new Uint8Array(zip);
    broken[35] = broken[35]! ^ 0xff; // the first byte of the stored file, after the 30 byte header and the name
    await expect(readZip(broken)).rejects.toThrow('fails its check');
    await expect(readZip(zip.subarray(0, zip.length - 30))).rejects.toThrow();
  });

  it('refuses a zip whose files add up to more than the limit it is given', async () => {
    const zip = await buildZip([
      { name: 'a.txt', data: text('a'.repeat(600)) },
      { name: 'b.txt', data: text('b'.repeat(600)) },
    ]);
    await expect(readZip(zip, { maxTotal: 1000 })).rejects.toThrow('too large to open');
    expect(await readZip(zip, { maxTotal: 1200 })).toHaveLength(2);
    expect(await readZip(zip)).toHaveLength(2);
  });

  it('stops inflating a file that is larger than it says it is', async () => {
    const zip = new Uint8Array(
      await buildZip([{ name: 'big.txt', data: text('z'.repeat(50_000)) }]),
    );
    const dv = new DataView(zip.buffer);
    // The central directory entry's uncompressed size: say 10 bytes for 50,000.
    let at = 0;
    while (dv.getUint32(at, true) !== 0x02014b50) at += 1;
    dv.setUint32(at + 24, 10, true);
    await expect(readZip(zip)).rejects.toThrow('larger than it says');
  });
});
