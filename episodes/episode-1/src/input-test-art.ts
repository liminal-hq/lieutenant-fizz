// The shapes of the Input test page's pictures: the controller, the keyboard and the mouse, as plain data in grid units.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Pure data, so the layout can be checked without a DOM. The page draws each part as a box (one grid unit is a whole
// number of CSS pixels, so every edge is crisp) and lights it from the device's state.

/** A box on the controller picture, in grid units. */
export interface PadPart {
  /** What lights it: a standard-mapping button index. */
  button: number;
  kind: 'button' | 'pill' | 'shoulder' | 'trigger' | 'dpad' | 'face' | 'click';
  x: number;
  y: number;
  w: number;
  h: number;
  /** The glyph token for its face, where the Fizz font has one for the Xbox names ("{A}"); empty for none. */
  label: string;
}

/** The controller picture's size in grid units. */
export const PAD_UNITS = { w: 100, h: 62 } as const;

/** A stick on the picture: its base, the buttons its click is, and the axes that move it. */
export interface PadStick {
  name: string;
  cx: number;
  cy: number;
  r: number;
  axisX: number;
  axisY: number;
  click: number;
}

export const PAD_STICKS: readonly PadStick[] = [
  { name: 'Left stick', cx: 22, cy: 30, r: 9, axisX: 0, axisY: 1, click: 10 },
  { name: 'Right stick', cx: 62, cy: 47, r: 9, axisX: 2, axisY: 3, click: 11 },
];

/** The standard-mapping controller: every button but the stick clicks, which are the sticks themselves. */
export const PAD_PARTS: readonly PadPart[] = [
  { button: 6, kind: 'trigger', x: 6, y: 0, w: 16, h: 9, label: '' },
  { button: 7, kind: 'trigger', x: 78, y: 0, w: 16, h: 9, label: '' },
  { button: 4, kind: 'shoulder', x: 6, y: 11, w: 16, h: 5, label: '' },
  { button: 5, kind: 'shoulder', x: 78, y: 11, w: 16, h: 5, label: '' },
  { button: 8, kind: 'pill', x: 40, y: 24, w: 8, h: 4, label: '' },
  { button: 9, kind: 'pill', x: 52, y: 24, w: 8, h: 4, label: '' },
  { button: 16, kind: 'pill', x: 46, y: 17, w: 8, h: 5, label: '' },
  { button: 12, kind: 'dpad', x: 33, y: 38, w: 6, h: 7, label: '' },
  { button: 13, kind: 'dpad', x: 33, y: 51, w: 6, h: 7, label: '' },
  { button: 14, kind: 'dpad', x: 26, y: 45, w: 7, h: 6, label: '' },
  { button: 15, kind: 'dpad', x: 39, y: 45, w: 7, h: 6, label: '' },
  { button: 3, kind: 'face', x: 74, y: 17, w: 8, h: 8, label: '{Y}' },
  { button: 2, kind: 'face', x: 66, y: 25, w: 8, h: 8, label: '{X}' },
  { button: 1, kind: 'face', x: 82, y: 25, w: 8, h: 8, label: '{B}' },
  { button: 0, kind: 'face', x: 74, y: 33, w: 8, h: 8, label: '{A}' },
];

/** The shoulders, triggers and Start and Select have glyphs too; these are used when a part is big enough for its label. */
export const PAD_LABELS: Readonly<Record<number, string>> = {
  4: '{LB}',
  5: '{RB}',
  6: '{LT}',
  7: '{RT}',
  8: '{Select}',
  9: '{Start}',
};

/** One key of the keyboard picture, in key units. A null code is a gap. */
export interface KeyPart {
  code: string;
  label: string;
  x: number;
  y: number;
  w: number;
}

type Spec = readonly [code: string | null, label: string, width: number];

const ROWS: readonly (readonly Spec[])[] = [
  [
    ['Escape', 'Esc', 1.5],
    [null, '', 0.5],
    ...['F1', 'F2', 'F3', 'F4'].map((c): Spec => [c, c, 1]),
    [null, '', 0.5],
    ...['F5', 'F6', 'F7', 'F8'].map((c): Spec => [c, c, 1]),
    [null, '', 0.5],
    ...['F9', 'F10', 'F11', 'F12'].map((c): Spec => [c, c.length > 2 ? c.slice(1) : c, 1]),
  ],
  [
    ['Backquote', '`', 1],
    ...'1234567890'.split('').map((d): Spec => [`Digit${d}`, d, 1]),
    ['Minus', '-', 1],
    ['Equal', '=', 1],
    ['Backspace', 'Bk', 2],
  ],
  [
    ['Tab', 'Tab', 1.5],
    ...'QWERTYUIOP'.split('').map((c): Spec => [`Key${c}`, c, 1]),
    ['BracketLeft', '[', 1],
    ['BracketRight', ']', 1],
    ['Backslash', '\\', 1.5],
  ],
  [
    ['CapsLock', 'Cap', 1.75],
    ...'ASDFGHJKL'.split('').map((c): Spec => [`Key${c}`, c, 1]),
    ['Semicolon', ';', 1],
    ['Quote', "'", 1],
    ['Enter', 'Ent', 2.25],
  ],
  [
    ['ShiftLeft', 'Sft', 2.25],
    ...'ZXCVBNM'.split('').map((c): Spec => [`Key${c}`, c, 1]),
    ['Comma', ',', 1],
    ['Period', '.', 1],
    ['Slash', '/', 1],
    ['ShiftRight', 'Sft', 2.75],
  ],
  [
    ['ControlLeft', 'Ctl', 1.25],
    ['MetaLeft', 'Win', 1.25],
    ['AltLeft', 'Alt', 1.25],
    ['Space', 'Space', 6.25],
    ['AltRight', 'Alt', 1.25],
    ['MetaRight', 'Win', 1.25],
    ['ContextMenu', 'Mnu', 1.25],
    ['ControlRight', 'Ctl', 1.25],
  ],
];

/** The width of the main block in key units, and the gap before the arrow keys. */
const MAIN_W = 15;
const ARROW_GAP = 0.5;

/** The arrow keys, in the last two rows to the right of the main block. */
const ARROWS: readonly KeyPart[] = [
  { code: 'ArrowUp', label: 'Up', x: MAIN_W + ARROW_GAP + 1, y: 4, w: 1 },
  { code: 'ArrowLeft', label: 'Lf', x: MAIN_W + ARROW_GAP, y: 5, w: 1 },
  { code: 'ArrowDown', label: 'Dn', x: MAIN_W + ARROW_GAP + 1, y: 5, w: 1 },
  { code: 'ArrowRight', label: 'Rt', x: MAIN_W + ARROW_GAP + 2, y: 5, w: 1 },
];

/** Every key of the picture with its place, and the picture's size in key units. */
export function keyboardParts(): { keys: KeyPart[]; w: number; h: number } {
  const keys: KeyPart[] = [];
  ROWS.forEach((row, y) => {
    let x = 0;
    for (const [code, label, w] of row) {
      if (code) keys.push({ code, label, x, y, w });
      x += w;
    }
  });
  return { keys: [...keys, ...ARROWS], w: MAIN_W + ARROW_GAP + 3, h: ROWS.length };
}

/** The mouse's buttons on the picture, by `MouseEvent.button`, in mouse units (the picture is 12 by 18). */
export const MOUSE_PARTS: readonly {
  button: number;
  x: number;
  y: number;
  w: number;
  h: number;
}[] = [
  { button: 0, x: 1, y: 0, w: 4, h: 7 },
  { button: 1, x: 5, y: 1, w: 2, h: 5 },
  { button: 2, x: 7, y: 0, w: 4, h: 7 },
  { button: 3, x: 0, y: 9, w: 1, h: 3 },
  { button: 4, x: 0, y: 5, w: 1, h: 3 },
];

export const MOUSE_UNITS = { w: 12, h: 18 } as const;
