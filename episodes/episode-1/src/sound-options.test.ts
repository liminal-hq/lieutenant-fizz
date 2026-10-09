// Tests for the Sound screen rows, their text, stepping, Reset and previews.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { AUDIO_DEFAULT } from '@lieutenant-fizz/engine/sound-field';
import { NO_LOCKS } from './url-lock';
import { DEFAULT_OPTIONS, parseOptions, type Options } from './options';
import {
  effectiveAudio,
  isSoundStepRow,
  resetSound,
  soundLocked,
  soundItems,
  soundPreview,
  soundRowId,
  soundRowOf,
  soundRows,
  stepSound,
  styleName,
} from './sound-options';

const base = (): Options => ({ ...DEFAULT_OPTIONS });
const rows = soundRows();

describe('soundRows', () => {
  it('lists Style, Music, Effects, Sound lab, Reset and Back', () => {
    expect(rows).toEqual(['style', 'music', 'sfx', 'lab', 'reset', 'back']);
  });

  it('round-trips a row through its menu id and rejects anything else', () => {
    for (const r of rows) expect(soundRowOf(soundRowId(r))).toBe(r);
    expect(soundRowOf('touch:size')).toBeNull();
    expect(soundRowOf('sound:night')).toBeNull();
    expect(soundRowOf('sound')).toBeNull();
    expect(soundRowOf(undefined)).toBeNull();
  });
});

describe('soundItems', () => {
  it('shows what Auto resolves to, and the meters', () => {
    const items = soundItems(base(), NO_LOCKS, rows, false);
    expect(items.map((i) => [i.label, i.value, i.meter])).toEqual([
      ['Style', styleName(AUDIO_DEFAULT), undefined],
      ['Music', undefined, 8],
      ['Effects', undefined, 8],
      ['Sound lab', 'Off', undefined],
      ['Reset', undefined, undefined],
      ['Back', undefined, undefined],
    ]);
    expect(items[0]?.kind).toBe('choice');
    expect(items[1]?.kind).toBe('meter');
  });

  it('shows the Sound lab row as an Off or On choice', () => {
    const lab = (on: boolean) => soundItems({ ...base(), lab: on }, NO_LOCKS, rows, false)[3];
    expect(lab(false)).toMatchObject({ label: 'Sound lab', kind: 'choice', value: 'Off' });
    expect(lab(true)?.value).toBe('On');
  });

  it('shows the saved choice', () => {
    expect(soundItems({ ...base(), audio: 1 }, NO_LOCKS, rows, false)[0]?.value).toBe('Classic');
    expect(soundItems({ ...base(), audio: 2 }, NO_LOCKS, rows, false)[0]?.value).toBe('Enhanced');
  });

  it('shows a mode the link forces, and cannot step it', () => {
    const style = soundItems(
      { ...base(), audio: 2 },
      { ...NO_LOCKS, audio: 'classic' },
      rows,
      false,
    )[0];
    expect(style?.value).toBe('Classic (link)');
    expect(style?.disabled).toBe(true);
  });

  it('asks for a second tap once Reset is armed', () => {
    const reset = (armed: boolean) => soundItems(base(), NO_LOCKS, rows, armed)[4];
    expect(reset(false)?.value).toBeUndefined();
    expect(reset(true)?.value).toBe('Tap again');
  });
});

describe('effectiveAudio', () => {
  it('prefers the link, then the saved choice, then the default', () => {
    expect(effectiveAudio(undefined, { audio: 0 })).toBe(AUDIO_DEFAULT);
    expect(effectiveAudio(undefined, { audio: 1 })).toBe('classic');
    expect(effectiveAudio(undefined, { audio: 2 })).toBe('enhanced');
    expect(effectiveAudio('classic', { audio: 2 })).toBe('classic');
    expect(effectiveAudio('enhanced', { audio: 1 })).toBe('enhanced');
    expect(effectiveAudio('classic', { audio: 0 })).toBe('classic');
  });
});

describe('isSoundStepRow', () => {
  it('steps Style, Music, Effects and the Sound lab only', () => {
    expect(rows.filter((r) => isSoundStepRow(r))).toEqual(['style', 'music', 'sfx', 'lab']);
    expect(isSoundStepRow(null)).toBe(false);
  });
});

describe('stepSound', () => {
  it('steps Style off Auto to the other style and saves an explicit choice', () => {
    // Auto shows Enhanced today, so a step toward Classic saves Classic.
    expect(AUDIO_DEFAULT).toBe('enhanced');
    expect(stepSound(base(), 'style', -1, false).audio).toBe(1);
    expect(stepSound(base(), 'style', 1, true).audio).toBe(1);
  });

  it('leaves Auto alone when a step has nowhere to go', () => {
    const o = base();
    expect(stepSound(o, 'style', 1, false)).toBe(o);
    expect(stepSound(base(), 'style', 1, false).audio).toBe(0);
  });

  it('stops at the ends without wrap and goes round with it', () => {
    const classic = { ...base(), audio: 1 };
    const enhanced = { ...base(), audio: 2 };
    expect(stepSound(classic, 'style', -1, false).audio).toBe(1);
    expect(stepSound(classic, 'style', 1, false).audio).toBe(2);
    expect(stepSound(enhanced, 'style', 1, false).audio).toBe(2);
    expect(stepSound(enhanced, 'style', -1, false).audio).toBe(1);
    expect(stepSound(enhanced, 'style', 1, true).audio).toBe(1);
    expect(stepSound(classic, 'style', -1, true).audio).toBe(2);
  });

  it('steps the meters like Options did, clamped or wrapping', () => {
    expect(stepSound(base(), 'music', 1, false).music).toBe(8);
    expect(stepSound(base(), 'music', -1, false).music).toBe(7);
    expect(stepSound(base(), 'music', 1, true).music).toBe(0);
    expect(stepSound({ ...base(), sfx: 0 }, 'sfx', -1, false).sfx).toBe(0);
    expect(stepSound({ ...base(), sfx: 0 }, 'sfx', -1, true).sfx).toBe(8);
  });

  it('changes only the row it steps', () => {
    const o = { ...base(), music: 3, sfx: 4, audio: 2, captions: false, layout: 1 };
    expect(stepSound(o, 'music', 1, false)).toEqual({ ...o, music: 4 });
    expect(stepSound(o, 'sfx', -1, false)).toEqual({ ...o, sfx: 3 });
    expect(stepSound(o, 'style', -1, false)).toEqual({ ...o, audio: 1 });
  });

  it('toggles the Sound lab with a step either way or with Enter, and changes nothing else', () => {
    const o = { ...base(), music: 3, audio: 2 };
    for (const [d, wrap] of [
      [1, false],
      [-1, false],
      [1, true],
    ] as const) {
      expect(stepSound(o, 'lab', d, wrap)).toEqual({ ...o, lab: true });
    }
    expect(stepSound({ ...o, lab: true }, 'lab', 1, true)).toEqual(o);
  });

  it('returns the same options for a row that does not step', () => {
    const o = base();
    expect(stepSound(o, 'reset', 1, true)).toBe(o);
    expect(stepSound(o, 'back', 1, true)).toBe(o);
  });
});

describe('resetSound', () => {
  it('puts Style, Music, Effects and the Sound lab back and leaves every other option alone', () => {
    const o: Options = {
      music: 2,
      sfx: 5,
      audio: 1,
      captions: false,
      layout: 1,
      text: 1,
      motion: 2,
      lab: true,
      rumble: 1,
      hapticsLab: true,
    };
    expect(resetSound(o)).toEqual({ ...o, audio: 0, music: 8, sfx: 8, lab: false });
  });

  it('does not change options already at their defaults', () => {
    expect(resetSound(base())).toEqual(base());
  });

  it('survives a save and a load', () => {
    const got = parseOptions(JSON.stringify({ v: 1, ...resetSound({ ...base(), audio: 2 }) }));
    expect(got.audio).toBe(0);
  });
});

describe('soundPreview', () => {
  it('plays a boing on the left, then a plink on the right, for Style', () => {
    const p = soundPreview('style', base());
    expect(p.map((s) => s.name)).toEqual(['boing', 'plink']);
    expect(p.map((s) => s.at?.pan)).toEqual([-0.5, 0.5]);
    expect(p.map((s) => s.delayMs)).toEqual([0, 160]);
  });

  it('plays a centred crunch for Effects, and nothing when they are silent', () => {
    expect(soundPreview('sfx', base())).toEqual([{ name: 'crunch', delayMs: 0 }]);
    expect(soundPreview('sfx', { sfx: 0 })).toEqual([]);
  });

  it('has none for Music (it changes live), the Sound lab, Reset or Back', () => {
    for (const r of ['music', 'lab', 'reset', 'back'] as const)
      expect(soundPreview(r, base())).toEqual([]);
  });

  it('names sounds the game has', async () => {
    const { PATTERNS } = await import('./audio/patterns');
    for (const r of rows) {
      for (const s of soundPreview(r, base())) expect(PATTERNS.sfx[s.name]).toBeDefined();
    }
  });
});

describe('the address', () => {
  it('shows the Sound lab as On (link), disabled, under ?debug', () => {
    const lab = soundItems(base(), { ...NO_LOCKS, debug: true }, rows, false)[3];
    expect(lab).toMatchObject({ label: 'Sound lab', value: 'On (link)', disabled: true });
  });

  it('shows ?audio= on Style and ?debug on the Sound lab as (link), disabled, and writes nothing', () => {
    const url = { ...NO_LOCKS, audio: 'classic' as const, debug: true };
    const items = soundItems(base(), url, rows, false);
    expect(items.filter((i) => i.disabled).map((i) => [i.label, i.value])).toEqual([
      ['Style', 'Classic (link)'],
      ['Sound lab', 'On (link)'],
    ]);
    const o = { ...base(), audio: 2 };
    for (const row of ['style', 'lab'] as const) {
      expect(soundLocked(row, url)).toBe(true);
      for (const d of [-1, 1])
        for (const wrap of [false, true]) expect(stepSound(o, row, d, wrap, url)).toBe(o);
    }
    // Music, Effects, Reset and Back are still the player's.
    for (const row of ['music', 'sfx', 'reset', 'back'] as const)
      expect(soundLocked(row, url)).toBe(false);
    expect(stepSound(o, 'music', -1, false, url).music).toBe(7);
  });
});
