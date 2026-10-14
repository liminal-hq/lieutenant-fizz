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
  eventsText,
  OPEN_ZIP_ID,
  reviewItems,
  reviewText,
  sampleItems,
  sampleRowId,
  sampleRowOf,
  sessionItems,
  sessionOf,
  sessionRowId,
  sizeText,
  specsText,
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

  it('offers Open a zip before Back where a file can be picked, and not otherwise', () => {
    expect(sessionItems([], '').map((i) => i.label)).toEqual(['Back']);
    expect(sessionItems([], '', true).map((i) => i.label)).toEqual(['Open a zip', 'Back']);
    const rows = sessionItems([info({ id: 'x' })], '', true);
    expect(rows).toHaveLength(3);
    expect(rows.slice(1).map((i) => i.label)).toEqual(['Open a zip', 'Back']);
    expect(rows[1]?.id).toBe(OPEN_ZIP_ID);
    expect(sessionOf(OPEN_ZIP_ID)).toBeNull();
  });

  it('shows only Back while reading, and round-trips ids', () => {
    expect(sessionItems(null, '')).toEqual([{ id: 'back', label: 'Back', value: 'Reading…' }]);
    expect(sessionOf(sessionRowId('x'))).toBe('x');
    expect(sessionOf('back')).toBeNull();
    expect(sessionOf(undefined)).toBeNull();
  });
});

describe('the screen for one sample', () => {
  const state = { armed: false, recording: false, canShare: false, canWatch: false };

  it('offers Save zip, Delete that asks twice, and Back, and Share only where there is a share menu', () => {
    expect(reviewItems(state).map((i) => i.label)).toEqual(['Save zip', 'Delete', 'Back']);
    expect(reviewItems({ ...state, canShare: true }).map((i) => i.label)).toEqual([
      'Save zip',
      'Share',
      'Delete',
      'Back',
    ]);
    expect(
      reviewItems({ ...state, armed: true }).find((i) => i.id === 'review:delete')?.value,
    ).toBe('Tap again');
  });

  it('offers Watch first, only for a sample with a level in it', () => {
    expect(reviewItems({ ...state, canWatch: true }).map((i) => i.label)).toEqual([
      'Watch',
      'Save zip',
      'Delete',
      'Back',
    ]);
    expect(reviewItems(state).some((i) => i.id === 'review:watch')).toBe(false);
  });

  it('cannot watch, save, share or delete the sample being recorded', () => {
    const rows = reviewItems({ ...state, recording: true, canShare: true, canWatch: true });
    for (const id of ['review:watch', 'review:save', 'review:share', 'review:delete'])
      expect(rows.find((i) => i.id === id)?.disabled).toBe(true);
    expect(rows.find((i) => i.id === 'review:back')?.disabled).toBeUndefined();
  });

  const detail = {
    events: 24118,
    kinds: { ptr: 18402, pos: 3920, ev: 700, screen: 1096 },
    specs: {
      browser: 'WebView',
      browserVersion: '141',
      os: 'Android',
      osVersion: '15',
      screen: [2400, 1080],
    },
  };

  it('says when it started, how big it is and how it ended, before the file has been read', () => {
    expect(reviewText(info(), false, null)).toBe(
      'Started Oct 13, 14:02. 3.1 MB. It was stopped normally.',
    );
    expect(reviewText(info({ ended: false }), false, null)).toContain('left open');
    expect(reviewText(info({ ended: false }), true, null)).toContain('being recorded now');
  });

  it('says what the zip holds once the file has been read', () => {
    const text = reviewText(info(), false, detail);
    expect(text).toContain('24,118 events');
    expect(text).toContain('18,402 pointer, 3,920 path, 700 game, 1,096 screen and menu');
    expect(text).toContain('WebView 141 on Android 15, 2400×1080');
  });
});

describe('eventsText and specsText', () => {
  it('leaves out a group with no events, and groups the kinds', () => {
    expect(eventsText({ key: 5, pad: 1, ax: 2, in: 3 })).toBe('5 key, 3 pad, 3 game');
    expect(eventsText({})).toBe('');
  });

  it('writes the specs in one line and copes with missing parts', () => {
    expect(
      specsText({ browser: 'Chrome', browserVersion: '141', os: 'Linux', screen: [1920, 1080] }),
    ).toBe('Chrome 141 on Linux, 1920×1080');
    expect(specsText({ os: 'Android' })).toBe('Android');
    expect(specsText({})).toBe('');
  });
});
