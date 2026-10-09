// Tests for the two-tap Reset window.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { RESET_ARM_MS, resetArmed } from './two-tap';

describe('resetArmed', () => {
  it('is armed for 3 seconds after the first tap', () => {
    expect(RESET_ARM_MS).toBe(3000);
    expect(resetArmed(null, 5000)).toBe(false);
    expect(resetArmed(1000, 1000)).toBe(true);
    expect(resetArmed(1000, 3999)).toBe(true);
    expect(resetArmed(1000, 4000)).toBe(false);
  });
});
