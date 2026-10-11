// Tests for the Quit to launcher and Quit game rows.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { QUIT_ARMED_VALUE, QUIT_GAME_ID, QUIT_LAUNCHER_ID, closeApp, withQuitRows } from './quit';
import { RESET_ARM_MS, resetArmed } from './two-tap';

const ROWS = [
  { id: 'new', label: 'New Game' },
  { id: 'options', label: 'Options' },
];

const NONE = { game: false, launcher: false };
const DESKTOP = { game: true, launcher: true };
const ANDROID = { game: false, launcher: true };

describe('withQuitRows', () => {
  it('leaves the menu alone when the host cannot quit', () => {
    expect(withQuitRows(ROWS, NONE, false, null)).toBe(ROWS);
    expect(withQuitRows(ROWS, NONE, true, QUIT_GAME_ID)).toBe(ROWS);
  });

  it('adds Quit to launcher and then Quit game on the desktop', () => {
    const rows = withQuitRows(ROWS, DESKTOP, false, null);
    expect(rows.map((r) => r.label)).toEqual([
      'New Game',
      'Options',
      'Quit to launcher',
      'Quit game',
    ]);
    expect(rows.at(-2)?.id).toBe(QUIT_LAUNCHER_ID);
    expect(rows.at(-1)?.id).toBe(QUIT_GAME_ID);
    expect(rows.at(-1)).not.toHaveProperty('value');
  });

  it('gives Android Quit to launcher and no Quit game', () => {
    const rows = withQuitRows(ROWS, ANDROID, false, null);
    expect(rows.map((r) => r.label)).toEqual(['New Game', 'Options', 'Quit to launcher']);
  });

  it('shows the armed state on the armed row only, and only where a second tap is asked for', () => {
    const armed = withQuitRows(ROWS, DESKTOP, true, QUIT_LAUNCHER_ID);
    expect(armed.at(-2)?.value).toBe(QUIT_ARMED_VALUE);
    expect(armed.at(-1)).not.toHaveProperty('value');
    const game = withQuitRows(ROWS, DESKTOP, true, QUIT_GAME_ID);
    expect(game.at(-2)).not.toHaveProperty('value');
    expect(game.at(-1)?.value).toBe(QUIT_ARMED_VALUE);
    expect(withQuitRows(ROWS, DESKTOP, true, null).at(-1)).not.toHaveProperty('value');
    expect(withQuitRows(ROWS, DESKTOP, false, QUIT_GAME_ID).at(-1)).not.toHaveProperty('value');
  });
});

describe('the confirm window', () => {
  it('stays armed until the Reset window ends', () => {
    expect(resetArmed(1000, 1000 + RESET_ARM_MS - 1)).toBe(true);
    expect(resetArmed(1000, 1000 + RESET_ARM_MS)).toBe(false);
    expect(resetArmed(null, 1000)).toBe(false);
  });
});

describe('closeApp', () => {
  it('leaves fullscreen, flushes the store, then quits', async () => {
    const calls: string[] = [];
    const done = await closeApp({
      exitFullscreen: async () => void calls.push('fs'),
      flush: async () => (calls.push('flush'), true),
      quit: async () => void calls.push('quit'),
    });
    expect(done).toBe(true);
    expect(calls).toEqual(['fs', 'flush', 'quit']);
  });

  it('quits when the store has no flush', async () => {
    const quit = vi.fn(async () => {});
    expect(await closeApp({ exitFullscreen: async () => {}, quit })).toBe(true);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('stays open when the flush fails, so the unsaved changes are not lost', async () => {
    const quit = vi.fn(async () => {});
    const done = await closeApp({
      exitFullscreen: async () => {},
      flush: async () => false,
      quit,
    });
    expect(done).toBe(false);
    expect(quit).not.toHaveBeenCalled();
  });
});
