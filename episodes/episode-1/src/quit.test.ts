// Tests for the Quit game row.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { QUIT_ARMED_VALUE, QUIT_GAME_ID, withQuitRow } from './quit';
import { RESET_ARM_MS, resetArmed } from './two-tap';

const ROWS = [
  { id: 'new', label: 'New Game' },
  { id: 'options', label: 'Options' },
];

describe('withQuitRow', () => {
  it('leaves the menu alone when the host cannot quit', () => {
    expect(withQuitRow(ROWS, false, false, false)).toBe(ROWS);
    expect(withQuitRow(ROWS, false, true, true)).toBe(ROWS);
  });

  it('adds Quit game as the last row', () => {
    const rows = withQuitRow(ROWS, true, false, false);
    expect(rows.map((r) => r.label)).toEqual(['New Game', 'Options', 'Quit game']);
    expect(rows.at(-1)?.id).toBe(QUIT_GAME_ID);
    expect(rows.at(-1)).not.toHaveProperty('value');
  });

  it('shows the armed state only where a second tap is asked for', () => {
    expect(withQuitRow(ROWS, true, true, false).at(-1)).not.toHaveProperty('value');
    expect(withQuitRow(ROWS, true, true, true).at(-1)?.value).toBe(QUIT_ARMED_VALUE);
    expect(withQuitRow(ROWS, true, false, true).at(-1)).not.toHaveProperty('value');
  });
});

describe('the confirm window', () => {
  it('stays armed until the Reset window ends', () => {
    expect(resetArmed(1000, 1000 + RESET_ARM_MS - 1)).toBe(true);
    expect(resetArmed(1000, 1000 + RESET_ARM_MS)).toBe(false);
    expect(resetArmed(null, 1000)).toBe(false);
  });
});
