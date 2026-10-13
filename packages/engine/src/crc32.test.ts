// Tests for the CRC-32.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { crc32 as zlibCrc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32 } from './crc32';

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for nothing and unsigned', () => {
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(Uint8Array.from([0xff, 0xff, 0xff, 0xff]))).toBeGreaterThanOrEqual(0);
  });

  it('matches the zlib in Node on some bytes', () => {
    const bytes = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31 + (i >> 3)) & 0xff);
    expect(crc32(bytes)).toBe(zlibCrc32(bytes));
  });
});
