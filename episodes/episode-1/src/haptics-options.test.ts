// Tests for the Haptics screen rows, their text, stepping, Reset and what the address fixes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  effectiveLevel,
  effectiveScale,
  hapticsFeel,
  hapticsItems,
  hapticsLinkValue,
  hapticsLocked,
  hapticsRowId,
  hapticsRowOf,
  hapticsRows,
  hapticsSettings,
  isHapticsStepRow,
  resetHaptics,
  stepHaptics,
  type HapticsSettings,
} from './haptics-options';
import { DEFAULT_OPTIONS } from './options';
import { NO_LOCKS } from './url-lock';

const base = (): HapticsSettings => ({ strength: 3, rumble: 3, lab: false });
const withPad = hapticsRows({ pad: true });
const noPad = hapticsRows({ pad: false });

describe('hapticsRows', () => {
  it('lists Strength, Rumble, Haptics lab, Reset and Back once a pad has been seen', () => {
    expect(withPad).toEqual(['strength', 'rumble', 'lab', 'reset', 'back']);
  });

  it('leaves Rumble out until a pad that can rumble has been seen', () => {
    expect(noPad).toEqual(['strength', 'lab', 'reset', 'back']);
  });

  it('round-trips a row through its menu id and rejects anything else', () => {
    for (const r of withPad) expect(hapticsRowOf(hapticsRowId(r))).toBe(r);
    expect(hapticsRowOf('sound:style')).toBeNull();
    expect(hapticsRowOf('haptics:nope')).toBeNull();
    expect(hapticsRowOf('haptics')).toBeNull();
    expect(hapticsRowOf(undefined)).toBeNull();
  });
});

describe('hapticsSettings', () => {
  it('takes the strength from the touch settings and the rest from the options', () => {
    expect(
      hapticsSettings({ hapticStrength: 1 }, { ...DEFAULT_OPTIONS, rumble: 2, hapticsLab: true }),
    ).toEqual({ strength: 1, rumble: 2, lab: true });
  });
});

describe('hapticsItems', () => {
  it('shows Strong, Strong and Off by default', () => {
    const items = hapticsItems(base(), NO_LOCKS, withPad, false);
    expect(items.map((i) => [i.label, i.value, i.kind, i.disabled])).toEqual([
      ['Strength', 'Strong', 'choice', undefined],
      ['Rumble', 'Strong', 'choice', undefined],
      ['Haptics lab', 'Off', 'choice', undefined],
      ['Reset', undefined, undefined, undefined],
      ['Back', undefined, undefined, undefined],
    ]);
  });

  it('names every level, an old Off save included', () => {
    const names = [0, 1, 2, 3].map(
      (strength) => hapticsItems({ ...base(), strength }, NO_LOCKS, noPad, false)[0]?.value,
    );
    expect(names).toEqual(['Off', 'Light', 'Medium', 'Strong']);
  });

  it('asks for a second tap once Reset is armed', () => {
    const reset = (armed: boolean) =>
      hapticsItems(base(), NO_LOCKS, noPad, armed).find((i) => i.label === 'Reset');
    expect(reset(false)?.value).toBeUndefined();
    expect(reset(true)?.value).toBe('Tap again');
  });

  it('gives every row an id that names it back', () => {
    expect(hapticsItems(base(), NO_LOCKS, withPad, false).map((i) => hapticsRowOf(i.id))).toEqual(
      withPad,
    );
  });
});

describe('stepHaptics', () => {
  it('steps Strength down and up, stopping at the ends', () => {
    expect(stepHaptics(base(), 'strength', 1, false).strength).toBe(3);
    expect(stepHaptics(base(), 'strength', -1, false).strength).toBe(2);
    expect(stepHaptics({ ...base(), strength: 0 }, 'strength', -1, false).strength).toBe(0);
  });

  it('goes round when the row is chosen', () => {
    expect(stepHaptics(base(), 'strength', 1, true).strength).toBe(0);
    expect(stepHaptics({ ...base(), rumble: 0 }, 'rumble', -1, true).rumble).toBe(3);
    expect(stepHaptics({ ...base(), rumble: 1 }, 'rumble', 1, true).rumble).toBe(2);
  });

  it('toggles the haptics lab either way', () => {
    expect(stepHaptics(base(), 'lab', 1, false).lab).toBe(true);
    expect(stepHaptics({ ...base(), lab: true }, 'lab', -1, false).lab).toBe(false);
  });

  it('changes only the row it is given', () => {
    expect(stepHaptics(base(), 'rumble', -1, false)).toEqual({ ...base(), rumble: 2 });
    expect(stepHaptics(base(), 'strength', -1, false)).toEqual({ ...base(), strength: 2 });
  });

  it('leaves the rows that do not step alone', () => {
    const h = base();
    expect(stepHaptics(h, 'reset', 1, true)).toBe(h);
    expect(stepHaptics(h, 'back', 1, true)).toBe(h);
    expect(['strength', 'rumble', 'lab'].every((r) => isHapticsStepRow(r as never))).toBe(true);
    expect([isHapticsStepRow('reset'), isHapticsStepRow('back'), isHapticsStepRow(null)]).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe('resetHaptics', () => {
  it('puts Strength and Rumble on Strong and the haptics lab Off', () => {
    expect(resetHaptics()).toEqual({ strength: 3, rumble: 3, lab: false });
  });
});

describe('hapticsFeel', () => {
  it('buzzes the phone for Strength, rumbles the pad for Rumble and toggles for the lab', () => {
    const b = base();
    expect(hapticsFeel(b, { ...b, strength: 2 }, 'strength')).toEqual({ kind: 'phone' });
    expect(hapticsFeel(b, { ...b, rumble: 2 }, 'rumble')).toEqual({ kind: 'pad' });
    expect(hapticsFeel(b, { ...b, lab: true }, 'lab')).toEqual({ kind: 'toggle', on: true });
  });

  it('feels nothing when nothing changed', () => {
    expect(hapticsFeel(base(), base(), 'strength')).toBeNull();
    expect(hapticsFeel(base(), base(), 'lab')).toBeNull();
    expect(hapticsFeel(base(), { ...base(), rumble: 1 }, 'strength')).toBeNull();
  });
});

describe('the address', () => {
  it('?haptics=off is Off whatever is saved, and ?haptics keeps the saved level, or Strong when that is Off', () => {
    expect(effectiveLevel('off', 3)).toBe(0);
    expect(effectiveLevel('on', 1)).toBe(1);
    expect(effectiveLevel('on', 0)).toBe(3);
    expect(effectiveLevel(undefined, 0)).toBe(0);
    expect(effectiveLevel(undefined, 2)).toBe(2);
    expect(effectiveScale('on', 2)).toBe(0.75);
    expect(effectiveScale('off', 3)).toBe(0);
    expect(effectiveScale(undefined, 1)).toBe(0.5);
  });

  it('shows ?haptics as On (link) and ?haptics=off as Off (link) on Strength and Rumble, disabled', () => {
    for (const [url, text] of [
      ['on', 'On (link)'],
      ['off', 'Off (link)'],
    ] as const) {
      const items = hapticsItems(base(), { ...NO_LOCKS, haptics: url }, withPad, false);
      for (const label of ['Strength', 'Rumble']) {
        const row = items.find((i) => i.label === label);
        expect(row, label).toMatchObject({ kind: 'choice', value: text, disabled: true });
      }
      // The other rows are still the player's.
      expect(items.find((i) => i.label === 'Haptics lab')?.disabled).toBeUndefined();
      expect(items.find((i) => i.label === 'Reset')?.disabled).toBeUndefined();
    }
  });

  it('shows the Haptics lab as On (link), disabled, under ?debug', () => {
    const lab = hapticsItems(base(), { ...NO_LOCKS, debug: true }, withPad, false)[2];
    expect(lab).toMatchObject({ label: 'Haptics lab', value: 'On (link)', disabled: true });
  });

  it('writes nothing: every row the address fixes steps to the same settings', () => {
    const h = { strength: 2, rumble: 1, lab: false };
    const url = { ...NO_LOCKS, haptics: 'off' as const, debug: true };
    for (const row of ['strength', 'rumble', 'lab'] as const) {
      expect(hapticsLocked(row, url), row).toBe(true);
      for (const d of [-1, 1])
        for (const wrap of [false, true]) expect(stepHaptics(h, row, d, wrap, url)).toBe(h);
    }
    expect(hapticsLocked('reset', url)).toBe(false);
    expect(hapticsLocked('back', url)).toBe(false);
  });

  it('shows the phone strength on the Options link row, or what the address fixed', () => {
    expect(hapticsLinkValue(NO_LOCKS, 2)).toBe('Medium');
    expect(hapticsLinkValue(NO_LOCKS, 0)).toBe('Off');
    expect(hapticsLinkValue({ ...NO_LOCKS, haptics: 'on' }, 1)).toBe('On (link)');
    expect(hapticsLinkValue({ ...NO_LOCKS, haptics: 'off' }, 3)).toBe('Off (link)');
  });
});
