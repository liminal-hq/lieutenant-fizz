// Tests for the device-aware hint strings.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { hintText } from '@lieutenant-fizz/engine/font/tokens';
import { describe, expect, it } from 'vitest';
import {
  backHint,
  controlsColumn,
  controlsTable,
  creditsHints,
  jumpHint,
  keyToken,
  menuHint,
  menuHints,
  selectHint,
  stingerHints,
  TOUCH_LABELS,
  type HintContext,
} from './hints';

const keen: HintContext = { device: 'keyboard', layout: 0 };
const modern: HintContext = { device: 'keyboard', layout: 1 };
const pad: HintContext = { device: 'gamepad', layout: 0 };
const touch: HintContext = { device: 'touch', layout: 1 };

/** Anything a touch screen has no key for. */
const KEYS = /Enter|Esc|F5|F9|Ctrl|Alt|Space|Start|\{[ABXY]\}|↑|↓|←|→/;

describe('hint labels', () => {
  it('shows the jump key for the layout, and A on a gamepad', () => {
    expect(jumpHint(keen)).toBe('{Ctrl}');
    expect(jumpHint(modern)).toBe('{[Z]}');
    expect(jumpHint({ device: 'keyboard', layout: 2 })).toBe('{Space}');
    expect(jumpHint({ device: 'keyboard', layout: 5 })).toBe('{[,]}');
    expect(jumpHint(pad)).toBe('{A}');
    expect(jumpHint({ device: 'gamepad', layout: 1 })).toBe('{A}');
  });

  it('names a key as it is printed on the player’s keyboard', () => {
    // On AZERTY the key in the Z position types W.
    const azerty = new Map([['KeyZ', 'w']]);
    expect(jumpHint({ ...modern, keyMap: azerty })).toBe('{[W]}');
    expect(keyToken('ControlLeft', azerty)).toBe('{Ctrl}');
    expect(keyToken('Space', azerty)).toBe('{Space}');
  });

  it('switches select, back and menu labels with the device', () => {
    expect(selectHint(keen)).toBe('{Enter}');
    expect(selectHint(pad)).toBe('{A}');
    expect(backHint(keen)).toBe('{Esc}');
    expect(backHint(pad)).toBe('{B}');
    expect(menuHint(keen)).toBe('{Esc} {[Pause]}');
    expect(menuHint(pad)).toBe('{Start}');
  });
});

describe('menu hints', () => {
  it('shows choose and select on a plain list', () => {
    expect(menuHints('list', keen)).toEqual(['{[↑↓]} Choose', '{Enter} Select']);
    expect(menuHints('list', pad)).toEqual(['{[↑↓]} Choose', '{A} Select']);
  });

  it('adds change and back on Options', () => {
    expect(menuHints('options', keen)).toEqual(['{[↑↓]} Choose', '{[←→]} Change', '{Esc} Back']);
    expect(menuHints('options', pad).at(-1)).toBe('{B} Back');
  });

  it('shows back on the saves screen and resume on pause', () => {
    expect(menuHints('saves', keen).at(-1)).toBe('{Esc} Back');
    expect(menuHints('pause', keen).at(-1)).toBe('{Esc} {[Pause]} Resume');
    expect(menuHints('pause', pad).at(-1)).toBe('{Start} Resume');
  });
});

describe('hints while fullscreen with Esc locked', () => {
  const fs: HintContext = { ...keen, fullscreen: true };
  const locked: HintContext = { ...fs, escExitsFullscreen: true };

  it('is as before with no lock, fullscreen or not', () => {
    expect(menuHints('pause', fs).at(-1)).toBe('{[F]} Fullscreen');
    expect(menuHints('pause', fs).at(-2)).toBe('{Esc} {[Pause]} Resume');
    expect(menuHints('list', fs)).toEqual(['{[↑↓]} Choose', '{Enter} Select', '{[F]} Fullscreen']);
  });

  it('reads Exit fullscreen for Esc on the pause menu and the title, in place of the F hint', () => {
    expect(menuHints('pause', locked)).toEqual([
      '{[↑↓]} Choose',
      '{Enter} Select',
      '{[P]} {[Pause]} Resume',
      '{Esc} Exit fullscreen',
    ]);
    expect(menuHints('list', locked)).toEqual([
      '{[↑↓]} Choose',
      '{Enter} Select',
      '{Esc} Exit fullscreen',
    ]);
  });

  it('keeps Esc as Back on the screens over a menu, and the Controls hints as they are', () => {
    expect(menuHints('options', locked).at(-1)).toBe('{[F]} Fullscreen');
    expect(menuHints('options', locked).at(-2)).toBe('{Esc} Back');
    expect(menuHints('controls', locked)).toEqual(menuHints('controls', keen));
  });

  it('never changes a gamepad or touch hint', () => {
    for (const c of [pad, touch])
      expect(menuHints('pause', { ...c, fullscreen: true, escExitsFullscreen: true })).toEqual(
        menuHints('pause', c),
      );
  });
});

describe('credits and stinger hints', () => {
  it('maps {Jump} to the active device', () => {
    expect(creditsHints(keen, 'Speed up')).toEqual([
      '{Esc} {[Pause]} Skip credits',
      '{Ctrl} Speed up',
    ]);
    expect(creditsHints(modern, 'Continue')).toEqual([
      '{Esc} {[Pause]} Skip credits',
      '{[Z]} Continue',
    ]);
    expect(creditsHints(pad, 'Speed up')).toEqual(['{Start} Skip credits', '{A} Speed up']);
    expect(stingerHints(pad)).toEqual(['{Start} Skip', '{A} Continue']);
  });
});

describe('touch hints', () => {
  it('names the on-screen controls instead of keys', () => {
    expect(jumpHint(touch)).toBe('{[Select]}');
    expect(selectHint(touch)).toBe('{[Select]}');
    expect(backHint(touch)).toBe('{[Back]}');
    expect(menuHint(touch)).toBe('{[Pause]}');
  });

  it('reads D-pad Choose, Select, Back on the menus', () => {
    expect(menuHints('list', touch)).toEqual(['{[D-pad]} Choose', '{[Select]}']);
    expect(menuHints('saves', touch)).toEqual(['{[D-pad]} Choose', '{[Select]}', '{[Back]}']);
    expect(menuHints('options', touch)).toEqual(['{[D-pad]} Change', '{[Back]}']);
    expect(menuHints('controls', touch)).toEqual(['{[Back]}']);
    expect(menuHints('pause', touch)).toEqual([
      '{[D-pad]} Choose',
      '{[Select]}',
      '{[Pause]} Resume',
    ]);
  });

  it('shows no keyboard or gamepad label anywhere', () => {
    const all = [
      ...(['list', 'pause', 'options', 'saves', 'controls'] as const).flatMap((s) =>
        menuHints(s, touch),
      ),
      ...creditsHints(touch, 'Speed up'),
      ...stingerHints(touch),
    ];
    for (const h of all) expect(h).not.toMatch(KEYS);
    // The Pause key and P are keyboard keys; the touch Pause control is a name, not a keycap for P.
    for (const h of [...all, ...controlsTable(touch, true).rows.flat()])
      expect(h).not.toMatch(/\{\[P\]\}/);
    expect(creditsHints(touch, 'Speed up')).toEqual([
      '{[Pause]} Skip credits',
      '{[Select]} Speed up',
    ]);
  });

  it('leaves the keyboard and gamepad hints as they were', () => {
    expect(menuHints('pause', keen)).toEqual([
      '{[↑↓]} Choose',
      '{Enter} Select',
      '{Esc} {[Pause]} Resume',
    ]);
    expect(menuHints('list', keen)).toEqual(['{[↑↓]} Choose', '{Enter} Select']);
    expect(menuHints('options', keen).at(-1)).toBe('{Esc} Back');
    expect(menuHints('pause', pad)).toEqual(['{[↑↓]} Choose', '{A} Select', '{Start} Resume']);
  });
});

describe('touch hints as drawn', () => {
  it('draw as the controls own names, with no button glyph and no whole keyboard cap', () => {
    const tokens = ['{[D-pad]}', '{[Select]}', '{[Back]}', '{[Pause]}'];
    const drawn = [
      ...tokens,
      ...(['list', 'pause', 'options', 'saves', 'controls'] as const).flatMap((s) =>
        menuHints(s, touch),
      ),
      ...controlsTable(touch, true).rows.flat(),
    ].map(hintText);
    for (const text of drawn) {
      expect(text.length, text).toBeGreaterThan(0);
      for (const ch of text) {
        const cp = ch.codePointAt(0) ?? 0;
        // Button glyphs (A, B, Start…) and whole keycaps (Esc, Enter, F5, F9…).
        expect(cp >= 0xe000 && cp <= 0xe015, `${text} has a button glyph`).toBe(false);
        expect(cp >= 0xe200 && cp <= 0xe2ff, `${text} has a keycap`).toBe(false);
      }
    }
  });
});

describe('controlsColumn', () => {
  it('highlights the keyboard column, or the gamepad column while a pad is in use', () => {
    expect(controlsColumn(keen)).toBe(1);
    expect(controlsColumn(modern)).toBe(1);
    expect(controlsColumn(pad)).toBe(2);
    expect(controlsColumn({ device: 'gamepad', layout: 1 })).toBe(2);
  });
});

describe('controlsTable on a keyboard or gamepad', () => {
  it('has a column for the chosen scheme and one for the gamepad, with the device in use picked out', () => {
    const t = controlsTable(modern, false);
    expect(t.head).toEqual(['Action', 'Modern', 'Gamepad']);
    expect(t.rows).toEqual([
      ['Move', '{[←]} {[→]}', 'D-pad / stick'],
      ['Jump', '{[Z]}', '{A}'],
      ['Pogo (toggle)', '{[X]}', '{B} {Y}'],
      ['Fizz', '{[C]} {Space}', '{X} {RT}'],
      ['Menu', '{Esc} {[P]} {[Pause]}', '{Start}'],
      ['Save / Load', '{F5} {F9}', 'Pause menu'],
    ]);
    expect(t.note).toBe(
      'Hold jump while pogoing for a high bounce. Aim fizz up with {[↑]}, or down with {[↓]} in the air.',
    );
    expect([modern, pad].map((c) => controlsTable(c, false).on)).toEqual([1, 2]);
  });

  it('lists each scheme’s own keys', () => {
    const row = (layout: number, action: string): string | undefined =>
      controlsTable({ device: 'keyboard', layout }, false).rows.find((r) => r[0] === action)?.[1];
    expect(['Jump', 'Pogo (toggle)', 'Fizz'].map((a) => row(0, a))).toEqual([
      '{Ctrl}',
      '{Alt}',
      '{Space}',
    ]);
    // WASD also takes the mouse buttons.
    expect(['Jump', 'Pogo (toggle)', 'Fizz'].map((a) => row(2, a))).toEqual([
      '{Space}',
      '{[K]} {[Right click]}',
      '{[J]} {[Left click]}',
    ]);
    // A saved Mouse choice from before the mouse joined WASD reads as WASD.
    expect(['Jump', 'Pogo (toggle)', 'Fizz'].map((a) => row(3, a))).toEqual(
      ['Jump', 'Pogo (toggle)', 'Fizz'].map((a) => row(2, a)),
    );
    expect(['Jump', 'Pogo (toggle)', 'Fizz'].map((a) => row(4, a))).toEqual([
      '{Space}',
      '{[Q]}',
      '{[E]}',
    ]);
    expect(['Jump', 'Pogo (toggle)', 'Fizz'].map((a) => row(5, a))).toEqual([
      '{[,]}',
      '{[.]}',
      '{[/]}',
    ]);
  });

  it('shows WASD where the scheme moves with it, and the arrows where it does not', () => {
    const move = (layout: number): string | undefined =>
      controlsTable({ device: 'keyboard', layout }, false).rows[0]?.[1];
    expect(move(1)).toBe('{[←]} {[→]}');
    expect(move(2)).toBe('{[A]} {[D]}');
    expect(move(4)).toBe('{[A]} {[D]}');
    expect(move(5)).toBe('{[←]} {[→]}');
    expect(controlsTable({ device: 'keyboard', layout: 4 }, false).note).toContain('{[W]}');
  });

  it('names the keys as the player’s keyboard prints them', () => {
    // AZERTY: the keys in the W, A, Z positions type Z, Q, W.
    const keyMap = new Map([
      ['KeyW', 'z'],
      ['KeyA', 'q'],
      ['KeyZ', 'w'],
    ]);
    const wasd = controlsTable({ device: 'keyboard', layout: 2, keyMap }, false);
    expect(wasd.rows[0]?.[1]).toBe('{[Q]} {[D]}');
    expect(wasd.note).toContain('{[Z]}');
    expect(controlsTable({ ...modern, keyMap }, false).rows[1]?.[1]).toBe('{[W]}');
  });
});

describe('controlsTable on touch', () => {
  const t = controlsTable(touch, true);

  it('has an Action column and a Touch column, with Touch picked out', () => {
    expect(t.head).toEqual(['Action', 'Touch']);
    expect(t.on).toBe(1);
    for (const r of t.rows) expect(r).toHaveLength(2);
    expect(t.rows.map((r) => r[0])).toEqual([
      'Move and aim',
      'Jump',
      'Pogo (toggle)',
      'Fizz',
      'Pause',
      'Menus',
      'Save / Load',
    ]);
  });

  it('names the controls by TOUCH_LABELS and shows no keyboard or gamepad glyph', () => {
    const cells = [...t.head, ...t.rows.flat(), t.note];
    for (const c of cells) expect(c, c).not.toMatch(KEYS);
    const text = cells.join(' ');
    for (const label of Object.values(TOUCH_LABELS)) expect(text).toContain(`{[${label}]}`);
    expect(t.rows.find((r) => r[0] === 'Menus')?.[1]).toBe('{[D-pad]} {[Select]} {[Back]}');
    expect(t.rows.at(-1)).toEqual(['Save / Load', 'Pause menu']);
  });
});

describe('the fullscreen shortcut in the hints', () => {
  const can = (c: HintContext): HintContext => ({ ...c, fullscreen: true });

  it('adds F to a keyboard hint bar where the page can go fullscreen, and nothing else changes', () => {
    for (const screen of ['list', 'pause', 'options', 'saves'] as const) {
      expect(menuHints(screen, can(keen))).toEqual([
        ...menuHints(screen, keen),
        '{[F]} Fullscreen',
      ]);
      expect(menuHints(screen, can(modern))).toEqual([
        ...menuHints(screen, modern),
        '{[F]} Fullscreen',
      ]);
    }
  });

  it('leaves the Controls screen hint bar alone, since its table lists the key', () => {
    expect(menuHints('controls', can(keen))).toEqual(menuHints('controls', keen));
  });

  it('leaves the gamepad and touch hints alone, since neither has the key', () => {
    for (const screen of ['list', 'pause', 'options', 'saves', 'controls'] as const) {
      expect(menuHints(screen, can(pad))).toEqual(menuHints(screen, pad));
      expect(menuHints(screen, can(touch))).toEqual(menuHints(screen, touch));
    }
  });

  it('adds a Fullscreen row to the keyboard Controls table only where it applies', () => {
    expect(controlsTable(can(keen), false).rows.at(-1)).toEqual(['Fullscreen', '{[F]}', '—']);
    expect(controlsTable(can(keen), false).rows.slice(0, -1)).toEqual(
      controlsTable(keen, false).rows,
    );
  });

  it('names the button on touch, with no key glyph', () => {
    const t = controlsTable({ ...can(touch), fullscreenButton: true }, true);
    expect(t.rows.at(-1)).toEqual(['Fullscreen', 'Fullscreen button']);
    for (const c of [...t.head, ...t.rows.flat(), t.note]) expect(c, c).not.toMatch(KEYS);
    expect(controlsTable(touch, true).rows.map((r) => r[0])).not.toContain('Fullscreen');
  });

  it('leaves the touch table without the row where only the keys can go fullscreen', () => {
    expect(controlsTable(can(touch), true).rows.map((r) => r[0])).not.toContain('Fullscreen');
  });
});
