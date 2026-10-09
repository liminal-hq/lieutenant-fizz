// Tests for the Display screen rows, their text, stepping and what the address fixes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { NO_LOCKS, parseHapticsParam } from './url-lock';
import { DEFAULT_OPTIONS, type Options } from './options';
import {
  displayItems,
  displayLinkValue,
  displayLocked,
  displayRowId,
  displayRowOf,
  displayRows,
  displayShown,
  effectiveFullscreen,
  effectiveWake,
  fullscreenChoice,
  isDisplayStepRow,
  stepDisplay,
} from './display-options';

const base = (): Options => ({ ...DEFAULT_OPTIONS });
const BOTH = { fullscreen: true, keepAwake: true };
const rows = displayRows(BOTH);

describe('displayRows', () => {
  it('lists Fullscreen, Keep screen on and Back where the page can do both', () => {
    expect(rows).toEqual(['fullscreen', 'awake', 'back']);
  });

  it('leaves out a row the page cannot do, and keeps Back', () => {
    expect(displayRows({ fullscreen: false, keepAwake: true })).toEqual(['awake', 'back']);
    expect(displayRows({ fullscreen: true, keepAwake: false })).toEqual(['fullscreen', 'back']);
    expect(displayRows({ fullscreen: false, keepAwake: false })).toEqual(['back']);
  });

  it('is offered from Options only when there is a row besides Back', () => {
    expect(displayShown(BOTH)).toBe(true);
    expect(displayShown({ fullscreen: true, keepAwake: false })).toBe(true);
    expect(displayShown({ fullscreen: false, keepAwake: false })).toBe(false);
  });

  it('round-trips a row through its menu id and rejects anything else', () => {
    for (const r of rows) expect(displayRowOf(displayRowId(r))).toBe(r);
    expect(displayRowOf('sound:style')).toBeNull();
    expect(displayRowOf('display:pixels')).toBeNull();
    expect(displayRowOf('display')).toBeNull();
    expect(displayRowOf(undefined)).toBeNull();
  });
});

describe('displayItems', () => {
  it('shows Auto and On by default, as choices, then Back', () => {
    const items = displayItems(base(), NO_LOCKS, rows);
    expect(items.map((i) => [i.label, i.value])).toEqual([
      ['Fullscreen', 'Auto'],
      ['Keep screen on', 'On'],
      ['Back', undefined],
    ]);
    expect(items[0]?.kind).toBe('choice');
    expect(items[1]?.kind).toBe('choice');
    expect(items.some((i) => i.disabled)).toBe(false);
  });

  it('shows the saved choices', () => {
    const items = displayItems({ ...base(), fullscreen: 2, awake: false }, NO_LOCKS, rows);
    expect(items.map((i) => i.value)).toEqual(['Off', 'Off', undefined]);
    expect(displayItems({ ...base(), fullscreen: 1 }, NO_LOCKS, rows)[0]?.value).toBe('On');
  });

  it('shows only the rows it is given', () => {
    const items = displayItems(
      base(),
      NO_LOCKS,
      displayRows({ fullscreen: false, keepAwake: true }),
    );
    expect(items.map((i) => i.label)).toEqual(['Keep screen on', 'Back']);
  });

  it('shows a value the link fixes with (link) and cannot be chosen', () => {
    const items = displayItems(
      { ...base(), fullscreen: 2, awake: true },
      { ...NO_LOCKS, fullscreen: 'on', wake: 'off' },
      rows,
    );
    expect(items[0]).toMatchObject({ value: 'On (link)', disabled: true });
    expect(items[1]).toMatchObject({ value: 'Off (link)', disabled: true });
    expect(items[2]?.disabled).toBeUndefined();
  });

  it('locks one row without the other', () => {
    const items = displayItems(base(), { ...NO_LOCKS, wake: 'on' }, rows);
    expect(items[0]?.disabled).toBeUndefined();
    expect(items[1]).toMatchObject({ value: 'On (link)', disabled: true });
  });
});

describe('the settings in effect', () => {
  it('prefers the link, then the saved choice', () => {
    expect(effectiveFullscreen(undefined, { fullscreen: 0 })).toBe('auto');
    expect(effectiveFullscreen(undefined, { fullscreen: 1 })).toBe('on');
    expect(effectiveFullscreen(undefined, { fullscreen: 2 })).toBe('off');
    expect(effectiveFullscreen('on', { fullscreen: 2 })).toBe('on');
    expect(effectiveFullscreen('off', { fullscreen: 1 })).toBe('off');
    expect(effectiveWake(undefined, { awake: true })).toBe('on');
    expect(effectiveWake(undefined, { awake: false })).toBe('off');
    expect(effectiveWake('on', { awake: false })).toBe('on');
    expect(effectiveWake('off', { awake: true })).toBe('off');
  });

  it('falls back to Auto for a stored number out of range', () => {
    expect(fullscreenChoice({ fullscreen: 9 })).toBe('auto');
  });
});

describe('displayLinkValue', () => {
  it('shows the saved Fullscreen choice, or what the link fixed', () => {
    expect(displayLinkValue(NO_LOCKS, { fullscreen: 0 })).toBe('Auto');
    expect(displayLinkValue(NO_LOCKS, { fullscreen: 2 })).toBe('Off');
    expect(displayLinkValue({ ...NO_LOCKS, fullscreen: 'on' }, { fullscreen: 2 })).toBe(
      'On (link)',
    );
    expect(displayLinkValue({ ...NO_LOCKS, wake: 'off' }, { fullscreen: 1 })).toBe('On');
  });
});

describe('displayLocked and isDisplayStepRow', () => {
  it('locks Fullscreen for ?fullscreen and Keep screen on for ?wake only', () => {
    const l = { ...NO_LOCKS, fullscreen: 'off' as const };
    expect(displayLocked('fullscreen', l)).toBe(true);
    expect(displayLocked('awake', l)).toBe(false);
    expect(displayLocked('awake', { ...NO_LOCKS, wake: 'on' })).toBe(true);
    expect(displayLocked('back', { ...NO_LOCKS, wake: 'on', fullscreen: 'on' })).toBe(false);
    expect(displayLocked('fullscreen', { ...NO_LOCKS, haptics: parseHapticsParam('') })).toBe(
      false,
    );
  });

  it('steps Fullscreen and Keep screen on only', () => {
    expect(rows.filter((r) => isDisplayStepRow(r))).toEqual(['fullscreen', 'awake']);
    expect(isDisplayStepRow(null)).toBe(false);
  });
});

describe('stepDisplay', () => {
  it('goes round Auto, On, Off and back, either way', () => {
    let o = base();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      o = stepDisplay(o, 'fullscreen', 1);
      seen.push(o.fullscreen);
    }
    expect(seen).toEqual([1, 2, 0, 1]);
    expect(stepDisplay(base(), 'fullscreen', -1).fullscreen).toBe(2);
  });

  it('toggles Keep screen on', () => {
    expect(stepDisplay(base(), 'awake', 1).awake).toBe(false);
    expect(stepDisplay({ ...base(), awake: false }, 'awake', -1).awake).toBe(true);
  });

  it('changes nothing else', () => {
    const o = { ...base(), music: 3, lab: true, captions: false };
    expect(stepDisplay(o, 'fullscreen', 1)).toEqual({ ...o, fullscreen: 1 });
    expect(stepDisplay(o, 'awake', 1)).toEqual({ ...o, awake: false });
  });

  it('returns the same options for a row that does not step or that the link fixes', () => {
    const o = base();
    expect(stepDisplay(o, 'back', 1)).toBe(o);
    expect(stepDisplay(o, 'fullscreen', 1, { ...NO_LOCKS, fullscreen: 'on' })).toBe(o);
    expect(stepDisplay(o, 'awake', 1, { ...NO_LOCKS, wake: 'off' })).toBe(o);
    expect(stepDisplay(o, 'awake', 1, { ...NO_LOCKS, fullscreen: 'on' })).not.toBe(o);
  });
});
