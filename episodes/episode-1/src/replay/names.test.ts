// Tests for the names of enemies and deaths, which must follow the Rust source.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { causeText, KIND_NAMES } from './names';

describe('the enemy names', () => {
  it('are the variants of the Rust `Kind` enum, in its order', () => {
    const src = readFileSync(new URL('../../game/src/ents.rs', import.meta.url), 'utf8');
    const body = /pub enum Kind \{([\s\S]*?)\n\}/.exec(src)![1]!;
    const variants = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[A-Z][A-Za-z]*,$/.test(l))
      .map((l) => l.slice(0, -1));
    expect([...KIND_NAMES]).toEqual(variants);
  });

  it('name a death in words', () => {
    expect(causeText(2, 4)).toBe('Spikes');
    expect(causeText(5, 0)).toBe('An enemy (Gloop)');
    expect(causeText(6, 5)).toBe('A pod’s puff (Pod)');
    expect(causeText(99, 0)).toBe('Cause 99');
  });
});
