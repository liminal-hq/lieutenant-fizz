// A guard: the session module never refers to a way of sending anything off the device.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('.', import.meta.url));

/** Words that would mean the log can leave the device: the page's network calls, and the ways a page sends in the background. */
const NETWORK = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bsendBeacon\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bnew\s+Image\s*\(/,
  /\bimportScripts\b/,
  /\bnavigator\.share\b/,
  /\bRTCPeerConnection\b/,
  /https?:\/\//,
];

describe('the session module', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  it('has source files to check', () => {
    expect(files).toEqual(
      expect.arrayContaining(['recorder.ts', 'store.ts', 'indexeddb-store.ts', 'specs.ts']),
    );
  });

  it.each(files)('%s makes no network call and names no network address', (file) => {
    // Comments are skipped: they may explain what the module does not do.
    const code = readFileSync(dir + file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const pattern of NETWORK) expect(code, `${file} matches ${pattern}`).not.toMatch(pattern);
  });
});
