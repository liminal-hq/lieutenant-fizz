// Type declarations for the wawoff2 WOFF2 encoder, which ships none.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

declare module 'wawoff2' {
  export function compress(data: Uint8Array): Promise<Uint8Array>;
  export function decompress(data: Uint8Array): Promise<Uint8Array>;
  const wawoff2: { compress: typeof compress; decompress: typeof decompress };
  export default wawoff2;
}
