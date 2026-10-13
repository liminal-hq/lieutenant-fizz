// Tests for the Play sample screens: rows, the consent pages, and how a saved session is named.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { ACTIVE_KEY } from '@lieutenant-fizz/engine/session/recorder';
import type { SessionInfo } from '@lieutenant-fizz/engine/session/store';
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_SAMPLE_KEY,
  CONSENT_PAGES,
  consentItems,
  reviewItems,
  reviewText,
  sampleItems,
  sampleRowId,
  sampleRowOf,
  sessionItems,
  sessionOf,
  sessionRowId,
  sizeText,
  startedText,
} from './sample-options';

const info = (over: Partial<SessionInfo> = {}): SessionInfo => ({
  id: 'abc123',
  startedAt: '2026-10-13T14:02:00-04:00',
  bytes: 3_250_000,
  chunks: 90,
  ended: true,
  ...over,
});

describe('the pointer key', () => {
  it('is the one the recorder writes', () => {
    expect(ACTIVE_SAMPLE_KEY).toBe(ACTIVE_KEY);
  });
});

describe('sampleItems', () => {
  it('offers Record a sample, the saved samples and Back while nothing is recording', () => {
    const items = sampleItems({ recording: false, stored: 2, leftOpen: 0 });
    expect(items.map((i) => [i.label, i.value])).toEqual([
      ['Record a sample', 'Off'],
      ['Saved samples', '2'],
      ['Back', undefined],
    ]);
    expect(items[0]?.id).toBe(sampleRowId('start'));
  });

  it('offers Stop sample while one is recording, and says how many were left open', () => {
    const items = sampleItems({ recording: true, stored: 3, leftOpen: 1 });
    expect(items[0]).toMatchObject({
      id: sampleRowId('stop'),
      label: 'Stop sample',
      value: 'Recording',
    });
    expect(items[1]?.value).toBe('3, 1 left open');
  });

  it('says it is reading while the saved samples are not known yet', () => {
    expect(sampleItems({ recording: false, stored: null, leftOpen: 0 })[1]?.value).toBe('Reading…');
  });

  it('round-trips a row through its menu id and rejects anything else', () => {
    for (const row of ['start', 'stop', 'list', 'back'] as const)
      expect(sampleRowOf(sampleRowId(row))).toBe(row);
    expect(sampleRowOf('sound:style')).toBeNull();
    expect(sampleRowOf('sample:other')).toBeNull();
    expect(sampleRowOf(undefined)).toBeNull();
  });
});

describe('the consent pages', () => {
  const all = CONSENT_PAGES.map((p) => `${p.title} ${p.text}`).join(' ');

  it('are short enough to fit a phone, one idea each', () => {
    expect(CONSENT_PAGES).toHaveLength(3);
    for (const page of CONSENT_PAGES) expect(page.text.length).toBeLessThan(400);
  });

  it('say everything that is recorded, in plain words', () => {
    for (const phrase of [
      'Every key, button and touch',
      'exactly where and when',
      'touches that miss',
      'menus',
      'screen size, browser and system',
      'date, time and time zone',
    ])
      expect(all, phrase).toContain(phrase);
  });

  it('say what is not recorded, where it is kept, and that nothing is sent', () => {
    expect(all).toContain('device or advertising ID');
    expect(all).toContain('saved on this device');
    expect(all).toContain('Nothing is sent anywhere');
    expect(all).toContain('delete it at any time');
  });

  it('use Canadian spelling and no dashes pretending to be punctuation', () => {
    expect(all).not.toMatch(/\bcolor\b|\bcenter\b|\bbehavior\b/);
    expect(all).not.toContain('--');
  });

  it('lead to Start recording only on the last page', () => {
    expect(consentItems(0)[0]).toMatchObject({ id: 'consent:next', value: '1 of 3' });
    expect(consentItems(1)[0]).toMatchObject({ id: 'consent:next', value: '2 of 3' });
    expect(consentItems(2)[0]).toMatchObject({ id: 'consent:start', label: 'Start recording' });
    expect(consentItems(9)[0]?.id).toBe('consent:start');
    for (const page of [0, 1, 2]) expect(consentItems(page).at(-1)?.id).toBe('consent:back');
  });
});

describe('startedText and sizeText', () => {
  it('names a start as it was written, without moving it to another time zone', () => {
    expect(startedText('2026-10-13T14:02:00-04:00')).toBe('Oct 13, 14:02');
    expect(startedText('2026-01-05T03:04:05+09:00')).toBe('Jan 5, 03:04');
    expect(startedText('not a date')).toBe('not a date');
  });

  it('writes a size in the unit that reads best', () => {
    expect(sizeText(80)).toBe('80 B');
    expect(sizeText(2048)).toBe('2 KB');
    expect(sizeText(3_250_000)).toBe('3.1 MB');
  });
});

describe('sessionItems', () => {
  it('lists the newest first, says which is recording and which were left open, then Back', () => {
    const items = sessionItems(
      [
        info({ id: 'old', startedAt: '2026-10-12T09:00:00-04:00' }),
        info({ id: 'open', startedAt: '2026-10-13T10:00:00-04:00', ended: false, bytes: 1024 }),
        info({ id: 'now', startedAt: '2026-10-13T14:02:00-04:00', ended: false, bytes: 2048 }),
      ],
      'now',
    );
    expect(items.map((i) => [i.label, i.value])).toEqual([
      ['Oct 13, 14:02', 'Recording'],
      ['Oct 13, 10:00', '1 KB, left open'],
      ['Oct 12, 09:00', '3.1 MB'],
      ['Back', undefined],
    ]);
    expect(sessionOf(items[0]?.id)).toBe('now');
  });

  it('shows only Back while reading, and round-trips ids', () => {
    expect(sessionItems(null, '')).toEqual([{ id: 'back', label: 'Back', value: 'Reading…' }]);
    expect(sessionOf(sessionRowId('x'))).toBe('x');
    expect(sessionOf('back')).toBeNull();
    expect(sessionOf(undefined)).toBeNull();
  });
});

describe('the screen for one sample', () => {
  it('asks twice to delete, and cannot delete the one recording', () => {
    expect(reviewItems(false, false)[0]).toMatchObject({ label: 'Delete', disabled: false });
    expect(reviewItems(true, false)[0]?.value).toBe('Tap again');
    expect(reviewItems(false, true)[0]?.disabled).toBe(true);
  });

  it('says when it started, how big it is, and how it ended', () => {
    expect(reviewText(info(), false)).toBe(
      'Started Oct 13, 14:02. 3.1 MB in 90 saved parts. It was stopped normally.',
    );
    expect(reviewText(info({ ended: false }), false)).toContain('left open');
    expect(reviewText(info({ ended: false }), true)).toContain('being recorded now');
  });
});
