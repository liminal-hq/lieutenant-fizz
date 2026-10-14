// The CRC-32 that PNG chunks and zip files carry, with no dependency, so it runs in a browser as well as in Bun.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    t[n] = c >>> 0;
  }
  return t;
})();

/** The CRC-32 of the bytes (the checksum of '123456789' is 0xcbf43926). */
export function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ TABLE[(c ^ buf[i]!) & 0xff]!;
  return ~c >>> 0;
}
