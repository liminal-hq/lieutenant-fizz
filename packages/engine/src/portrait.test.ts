// Tests for the portrait check.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { isPortrait } from './portrait';

describe('isPortrait', () => {
  it('is true only when taller than wide', () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
    expect(isPortrait(600, 600)).toBe(false);
  });
});
