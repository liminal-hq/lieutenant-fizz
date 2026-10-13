// A zip reader for tests, built on Node's own zlib so it does not share any code with the writer it checks.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { crc32, inflateRawSync } from 'node:zlib';

export interface ReadEntry {
  name: string;
  data: Uint8Array;
  method: number;
  flags: number;
  time: number;
  date: number;
}

/**
 * Reads every file from a zip by its central directory, checking each against its stored size and CRC-32.
 * Throws on anything a strict reader would refuse.
 */
export function readZip(bytes: Uint8Array): ReadEntry[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('no end of central directory');
  const count = dv.getUint16(end + 10, true);
  const cdSize = dv.getUint32(end + 12, true);
  const cdOffset = dv.getUint32(end + 16, true);
  if (cdOffset + cdSize !== end) throw new Error('central directory does not end where it should');
  const out: ReadEntry[] = [];
  let at = cdOffset;
  for (let i = 0; i < count; i += 1) {
    if (dv.getUint32(at, true) !== 0x02014b50) throw new Error('bad central header');
    const flags = dv.getUint16(at + 8, true);
    const method = dv.getUint16(at + 10, true);
    const time = dv.getUint16(at + 12, true);
    const date = dv.getUint16(at + 14, true);
    const crc = dv.getUint32(at + 16, true);
    const csize = dv.getUint32(at + 20, true);
    const usize = dv.getUint32(at + 24, true);
    const nameLen = dv.getUint16(at + 28, true);
    const extraLen = dv.getUint16(at + 30, true);
    const commentLen = dv.getUint16(at + 32, true);
    const local = dv.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    if (dv.getUint32(local, true) !== 0x04034b50) throw new Error('bad local header');
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const body = bytes.subarray(start, start + csize);
    const data =
      method === 0
        ? body
        : method === 8
          ? new Uint8Array(inflateRawSync(body))
          : (() => {
              throw new Error(`method ${method}`);
            })();
    if (data.length !== usize) throw new Error(`${name}: size ${data.length} is not ${usize}`);
    if (crc32(data) !== crc) throw new Error(`${name}: bad CRC`);
    out.push({ name, data: new Uint8Array(data), method, flags, time, date });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
