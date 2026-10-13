// A small zip writer that runs in a browser: the files deflated by the browser's own CompressionStream where it has one, else stored.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { crc32 } from './crc32';

/** One file to put in a zip. */
export interface ZipFile {
  /** A relative path with forward slashes, such as `session.ndjson`. */
  name: string;
  data: Uint8Array;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
/** General purpose flag bit 11: the name is UTF-8. */
const UTF8 = 0x0800;
const STORED = 0;
const DEFLATED = 8;

/** The zip format without ZIP64 holds up to 65,535 files and 4 GiB; a session is far below both. */
const MAX_SIZE = 0xffffffff;

/** The date and time as an MS-DOS pair, which cannot go before 1980 or past 2107. */
export function dosDateTime(when: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, when.getFullYear()));
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/** Throws for a name a zip reader could take outside its folder, or that is empty or repeated. */
function checkName(name: string, seen: Set<string>): void {
  if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0'))
    throw new Error(`bad zip name ${JSON.stringify(name)}`);
  if (name.split('/').some((part) => part === '..' || part === '.' || part === ''))
    throw new Error(`bad zip name ${JSON.stringify(name)}`);
  if (seen.has(name)) throw new Error(`duplicate zip name ${JSON.stringify(name)}`);
  seen.add(name);
}

/**
 * The bytes deflated (no zlib header, as a zip wants), or null where the browser has no `CompressionStream`
 * or it fails, so the file is stored as it is.
 */
export async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([data as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * A zip of the files. Each is deflated when that makes it smaller and stored otherwise. The same files and
 * `when` always give the same bytes (the time stored is `when`, not the clock, and defaults to 1980).
 */
export async function buildZip(
  files: readonly ZipFile[],
  when: Date = new Date(1980, 0, 1, 0, 0, 0),
): Promise<Uint8Array> {
  if (files.length > 0xffff) throw new Error('too many files for a zip');
  const { time, date } = dosDateTime(when);
  const seen = new Set<string>();
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    checkName(file.name, seen);
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const deflated = file.data.length ? await deflateRaw(file.data) : null;
    const useDeflate = deflated !== null && deflated.length < file.data.length;
    const body = useDeflate ? deflated : file.data;
    const method = useDeflate ? DEFLATED : STORED;
    if (body.length > MAX_SIZE || file.data.length > MAX_SIZE || offset > MAX_SIZE)
      throw new Error('a zip file is too large');

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, UTF8, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, body);

    const entry = new Uint8Array(46 + name.length);
    const ev = new DataView(entry.buffer);
    ev.setUint32(0, CENTRAL, true);
    ev.setUint16(4, 20, true);
    ev.setUint16(6, 20, true);
    ev.setUint16(8, UTF8, true);
    ev.setUint16(10, method, true);
    ev.setUint16(12, time, true);
    ev.setUint16(14, date, true);
    ev.setUint32(16, crc, true);
    ev.setUint32(20, body.length, true);
    ev.setUint32(24, file.data.length, true);
    ev.setUint16(28, name.length, true);
    ev.setUint32(42, offset, true);
    entry.set(name, 46);
    central.push(entry);

    offset += local.length + body.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const dv = new DataView(end.buffer);
  dv.setUint32(0, END, true);
  dv.setUint16(8, files.length, true);
  dv.setUint16(10, files.length, true);
  dv.setUint32(12, centralSize, true);
  dv.setUint32(16, offset, true);

  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
