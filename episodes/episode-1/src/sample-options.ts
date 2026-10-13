// The Play sample screens: their rows, the plain-words consent pages, and how a stored session is named.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { SessionInfo } from '@lieutenant-fizz/engine/session/store';
import type { MenuItem } from './ui';

/**
 * The key in the game's storage that points at the session being recorded. It is the engine's `ACTIVE_KEY`,
 * written here so the game can check for a session left open without loading the recorder.
 */
export const ACTIVE_SAMPLE_KEY = 'lf-sample-active';

/** The rows of the Play sample screen. */
export type SampleRow = 'start' | 'stop' | 'list' | 'back';

/** What the main screen needs to know. */
export interface SampleState {
  /** Whether a session is being recorded now. */
  recording: boolean;
  /** Sessions kept on this device, or null while they are still being read. */
  stored: number | null;
  /** Sessions a crash or a closed app left open (not counting the one recording). */
  leftOpen: number;
}

/** The menu id of a row on the main screen. */
export const sampleRowId = (row: SampleRow): string => `sample:${row}`;

/** The row a menu id names, or null when it is not a Play sample row. */
export function sampleRowOf(id: string | undefined): SampleRow | null {
  if (!id?.startsWith('sample:')) return null;
  const row = id.slice(7);
  return row === 'start' || row === 'stop' || row === 'list' || row === 'back' ? row : null;
}

/** The main screen: record (or stop), the stored sessions, and Back. */
export function sampleItems(s: SampleState): MenuItem[] {
  const stored = s.stored === null ? 'Reading…' : `${s.stored}`;
  const note = s.leftOpen > 0 ? `${stored}, ${s.leftOpen} left open` : stored;
  return [
    s.recording
      ? { id: sampleRowId('stop'), label: 'Stop sample', value: 'Recording' }
      : { id: sampleRowId('start'), label: 'Record a sample', value: 'Off' },
    { id: sampleRowId('list'), label: 'Saved samples', value: note },
    { id: sampleRowId('back'), label: 'Back' },
  ];
}

/** One page of the consent, read before a recording can start. */
export interface ConsentPage {
  title: string;
  text: string;
}

/**
 * What the player is told before a sample starts, in three short pages so each fits a phone screen. It says
 * everything that is recorded and what is not, and where it is kept; nothing is hidden behind a link.
 */
export const CONSENT_PAGES: readonly ConsentPage[] = [
  {
    title: 'What is recorded',
    text: 'Every key, button and touch, with exactly where and when, on every screen, including touches that miss and touches in the menus. Where Ben is as you play, the screens you visit, and what happens in the game. Your screen size, browser and system, and the date, time and time zone you start.',
  },
  {
    title: 'What is not recorded',
    text: 'Your name, account, device or advertising ID, location, contacts or files, or anything outside the game window. Nothing you type, because the game has nowhere to type.',
  },
  {
    title: 'Where it goes',
    text: 'It is saved on this device as you play, so a crash loses almost nothing. Nothing is sent anywhere. You choose later whether to save it as a file and send it to the developer, and you can delete it at any time.',
  },
];

/** The menu id of a row on a consent page. */
export const consentRowId = (row: 'next' | 'start' | 'back'): string => `consent:${row}`;

/** The rows of a consent page: Next, or Start recording on the last, and Back. */
export function consentItems(page: number): MenuItem[] {
  const last = page >= CONSENT_PAGES.length - 1;
  return [
    last
      ? { id: consentRowId('start'), label: 'Start recording' }
      : {
          id: consentRowId('next'),
          label: 'Next',
          value: `${page + 1} of ${CONSENT_PAGES.length}`,
        },
    { id: consentRowId('back'), label: 'Back' },
  ];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** When a session started in words, as it was written: "Oct 13, 14:02". The time zone it was in is kept, not converted. */
export function startedText(startedAt: string): string {
  const m = /^\d{4}-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(startedAt);
  if (!m) return startedAt;
  return `${MONTHS[Number(m[1]) - 1] ?? m[1]} ${Number(m[2])}, ${m[3]}:${m[4]}`;
}

/** A size in characters (close to bytes for this JSON text) as "3.1 MB", "412 KB" or "80 B". */
export function sizeText(chars: number): string {
  if (chars >= 1024 * 1024) return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
  if (chars >= 1024) return `${Math.round(chars / 1024)} KB`;
  return `${chars} B`;
}

/** The menu id of a stored session's row. */
export const sessionRowId = (id: string): string => `session:${id}`;

/** The session a menu id names, or null. */
export function sessionOf(id: string | undefined): string | null {
  return id?.startsWith('session:') ? id.slice(8) : null;
}

/** The saved sessions, newest first, then Back. A session still open says whether it is the one recording. */
export function sessionItems(list: readonly SessionInfo[] | null, recordingId: string): MenuItem[] {
  if (list === null) return [{ id: 'back', label: 'Back', value: 'Reading…' }];
  const rows = [...list].reverse().map((s): MenuItem => ({
    id: sessionRowId(s.id),
    label: startedText(s.startedAt),
    value:
      s.id === recordingId
        ? 'Recording'
        : s.ended
          ? sizeText(s.bytes)
          : `${sizeText(s.bytes)}, left open`,
  }));
  return [...rows, { id: 'back', label: 'Back' }];
}

/** The rows of one session's screen: Delete asks twice, then Back. */
export function reviewItems(armed: boolean, recording: boolean): MenuItem[] {
  return [
    {
      id: 'review:delete',
      label: 'Delete',
      disabled: recording,
      ...(armed ? { value: 'Tap again' } : {}),
    },
    { id: 'review:back', label: 'Back' },
  ];
}

/** What the screen for one session says: when it started, its size, and whether it was cut short. */
export function reviewText(info: SessionInfo, recording: boolean): string {
  const state = recording
    ? 'It is being recorded now.'
    : info.ended
      ? 'It was stopped normally.'
      : 'It was left open, by a crash or a closed app; what was written is kept.';
  return `Started ${startedText(info.startedAt)}. ${sizeText(info.bytes)} in ${info.chunks} saved parts. ${state}`;
}
