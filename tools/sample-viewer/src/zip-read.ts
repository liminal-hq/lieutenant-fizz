// Reads the files out of a zip in the page: the central directory, then each file stored or inflated by the browser.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { crc32 } from '@lieutenant-fizz/engine/crc32';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** A file larger than this when unpacked is refused, so a crafted zip cannot fill the page's memory. */
export const MAX_UNPACKED = 512 * 1024 * 1024;

/** Inflates raw deflate data with the browser's own `DecompressionStream`. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Every file in a zip, read from its central directory and checked against the size and CRC-32 it names.
 * Throws a plain message for anything that is not a zip this tool can read (a file that is not a zip,
 * encryption, ZIP64, a method other than stored or deflate, a file too large, a failed check).
 */
export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  if (bytes.length < 22) throw new Error('This is not a zip file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  const floor = Math.max(0, bytes.length - 22 - 0xffff);
  while (end >= floor && dv.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < floor) throw new Error('This is not a zip file');
  const count = dv.getUint16(end + 10, true);
  const cdSize = dv.getUint32(end + 12, true);
  const cdOffset = dv.getUint32(end + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff)
    throw new Error('Zip files over 4 GB are not supported');
  if (cdOffset + cdSize > end) throw new Error('The zip is damaged: its directory is out of place');

  const out: ZipEntry[] = [];
  let at = cdOffset;
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > bytes.length || dv.getUint32(at, true) !== 0x02014b50)
      throw new Error('The zip is damaged: a directory entry is missing');
    const flags = dv.getUint16(at + 8, true);
    const method = dv.getUint16(at + 10, true);
    const crc = dv.getUint32(at + 16, true);
    const csize = dv.getUint32(at + 20, true);
    const usize = dv.getUint32(at + 24, true);
    const nameLen = dv.getUint16(at + 28, true);
    const extraLen = dv.getUint16(at + 30, true);
    const commentLen = dv.getUint16(at + 32, true);
    const local = dv.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;

    if (flags & 1) throw new Error(`${name} is encrypted`);
    if (usize > MAX_UNPACKED) throw new Error(`${name} is too large`);
    if (name.endsWith('/')) continue;
    if (local + 30 > bytes.length || dv.getUint32(local, true) !== 0x04034b50)
      throw new Error(`The zip is damaged: ${name} cannot be found`);
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    if (start + csize > bytes.length) throw new Error(`The zip is damaged: ${name} is cut short`);
    const body = bytes.subarray(start, start + csize);
    let data: Uint8Array;
    if (method === 0) data = body;
    else if (method === 8) data = await inflateRaw(body);
    else throw new Error(`${name} uses a compression method this tool cannot read`);
    if (data.length !== usize) throw new Error(`The zip is damaged: ${name} has the wrong size`);
    if (crc32(data) !== crc) throw new Error(`The zip is damaged: ${name} fails its check`);
    out.push({ name, data });
  }
  return out;
}
