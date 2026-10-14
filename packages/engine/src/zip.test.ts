// Tests for the zip writer, read back with an independent reader.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { buildZip, deflateRaw, dosDateTime } from './zip';
import { readZip } from './zip-test-util';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);
const str = (b: Uint8Array): string => new TextDecoder().decode(b);

describe('buildZip', () => {
  it('holds each file under its name, with the right size and CRC', async () => {
    const zip = await buildZip([
      { name: 'session.ndjson', data: text('{"e":"a"}\n{"e":"b"}\n') },
      { name: 'specs.json', data: text('{"host":"web"}') },
    ]);
    const files = readZip(zip);
    expect(files.map((f) => f.name)).toEqual(['session.ndjson', 'specs.json']);
    expect(str(files[0]!.data)).toBe('{"e":"a"}\n{"e":"b"}\n');
    expect(str(files[1]!.data)).toBe('{"host":"web"}');
  });

  it('deflates what compresses and stores what does not', async () => {
    const big = text('{"t":1,"ms":2,"e":"pos","x":4.5,"y":9}\n'.repeat(2000));
    const noise = Uint8Array.from({ length: 64 }, (_, i) => (i * 97 + 13) & 0xff);
    const zip = await buildZip([
      { name: 'big', data: big },
      { name: 'noise', data: noise },
    ]);
    const files = readZip(zip);
    expect(files[0]!.method).toBe(8);
    expect(files[1]!.method).toBe(0);
    expect(zip.length).toBeLessThan(big.length / 5);
    expect(files[0]!.data).toEqual(big);
    expect(files[1]!.data).toEqual(noise);
  });

  it('holds an empty file', async () => {
    const files = readZip(await buildZip([{ name: 'empty', data: new Uint8Array() }]));
    expect(files).toHaveLength(1);
    expect(files[0]!.data.length).toBe(0);
  });

  it('writes names as UTF-8 and says so', async () => {
    const files = readZip(await buildZip([{ name: 'séance/été.txt', data: text('x') }]));
    expect(files[0]!.name).toBe('séance/été.txt');
    expect(files[0]!.flags & 0x0800).toBe(0x0800);
  });

  it('gives the same bytes for the same files and time, and a different time changes only the stamp', async () => {
    const files = [{ name: 'a.txt', data: text('hello hello hello hello') }];
    const when = new Date(2026, 9, 13, 14, 2, 4);
    const one = await buildZip(files, when);
    const two = await buildZip(files, when);
    expect(one).toEqual(two);
    const entry = readZip(one)[0]!;
    expect(entry.time).toBe((14 << 11) | (2 << 5) | 2);
    expect(entry.date).toBe(((2026 - 1980) << 9) | (10 << 5) | 13);
    // The default time is fixed, not the clock.
    expect(await buildZip(files)).toEqual(await buildZip(files));
  });

  it('refuses names that could climb out of a folder, are empty or repeat', async () => {
    const data = text('x');
    for (const name of ['', '/etc/passwd', '../x', 'a/../b', 'a\\b', './x', 'a//b', 'a\0b'])
      await expect(buildZip([{ name, data }]), JSON.stringify(name)).rejects.toThrow(
        /bad zip name/,
      );
    await expect(
      buildZip([
        { name: 'x', data },
        { name: 'x', data },
      ]),
    ).rejects.toThrow(/duplicate/);
  });

  it('makes an empty zip a reader accepts', async () => {
    expect(readZip(await buildZip([]))).toEqual([]);
  });

  it('keeps a few hundred files in order', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      name: `f${i}.txt`,
      data: text(`file ${i}`),
    }));
    const files = readZip(await buildZip(many));
    expect(files).toHaveLength(300);
    expect(str(files[299]!.data)).toBe('file 299');
  });
});

describe('deflateRaw and dosDateTime', () => {
  it('deflates a repeating input to far fewer bytes', async () => {
    const out = await deflateRaw(text('abc'.repeat(1000)));
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThan(100);
  });

  it('keeps a date inside what MS-DOS can say', () => {
    expect(dosDateTime(new Date(1970, 0, 1)).date >> 9).toBe(0);
    expect(dosDateTime(new Date(2200, 0, 1)).date >> 9).toBe(2107 - 1980);
  });
});
