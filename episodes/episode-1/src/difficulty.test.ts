// Tests for the Normal and Expert mode names and the choice menu.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { MODE_BACK_ID, modeItems, modeName, modeOf, modePicked } from './difficulty';

describe('difficulty modes', () => {
  it('names and maps the two modes', () => {
    expect(modeName(true)).toBe('Normal');
    expect(modeName(false)).toBe('Expert');
    expect(modeOf(true)).toBe('normal');
    expect(modeOf(false)).toBe('expert');
  });

  it('offers Normal first, then Expert, then Back', () => {
    const items = modeItems();
    expect(items.map((i) => i.label)).toEqual(['Normal', 'Expert', 'Back']);
    expect(modePicked(items[0]?.id)).toBe(true);
    expect(modePicked(items[1]?.id)).toBe(false);
    expect(modePicked(MODE_BACK_ID)).toBeNull();
    expect(modePicked(undefined)).toBeNull();
  });
});
