// Tests for the room table: every screen and level has a room, and the levels and the table agree.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { MASTER_DEFAULTS, ROOM_SEND_SCALE } from '@lieutenant-fizz/engine/master';
import { describe, expect, it } from 'vitest';
import { Mode } from '../sim/protocol';
import { LEVELS } from '../story';
import { COARSE_SEND, ROOMS, roomFor, roomProfile, type RoomName } from './rooms';

const NAMES = Object.keys(ROOMS) as RoomName[];
const SCREENS = [
  'loading',
  'title',
  'cine',
  'play',
  'pause',
  'card',
  'dialogue',
  'ending',
  'credits',
  'stinger',
];

/** The screens that are always in the neutral room. */
const neutral = { loading: 1, title: 1, cine: 1, ending: 1, credits: 1 } as Record<string, 1>;

describe('rooms', () => {
  it('keeps the neutral room equal to the 8b.3 reverb', () => {
    const { damping, seed, ring, ...rest } = ROOMS.neutral;
    expect(rest).toEqual(MASTER_DEFAULTS.reverb);
    expect([damping, seed, ring]).toEqual([0, 0, undefined]);
  });

  it('gives every room sane values and its own seed', () => {
    const seeds = new Set<number>();
    for (const name of NAMES) {
      const r = ROOMS[name];
      expect(r.coarseSeconds, name).toBeLessThanOrEqual(r.seconds);
      expect(r.seconds, name).toBeLessThanOrEqual(2);
      expect(r.sfxSend, name).toBeGreaterThan(0);
      expect(r.sfxSend, name).toBeLessThanOrEqual(0.5);
      expect(r.musicSend, name).toBeLessThanOrEqual(0.25);
      expect(r.damping, name).toBeGreaterThanOrEqual(0);
      expect(r.damping, name).toBeLessThan(1);
      expect(r.predelay, name).toBeLessThan(0.05);
      if (r.ring) expect(r.ring.amount, name).toBeLessThan(0.5);
      seeds.add(r.seed);
    }
    expect(seeds.size).toBe(NAMES.length);
  });

  it('names a room that exists for every level, and uses every room outside the neutral one', () => {
    expect(LEVELS.length).toBe(16);
    for (const [id, level] of LEVELS.entries()) {
      expect(NAMES, `${id} ${level.name}`).toContain(level.room);
      expect(level.room, level.name).not.toBe('neutral');
    }
    const used = new Set(LEVELS.map((l) => l.room));
    for (const name of NAMES.filter((n) => n !== 'neutral' && n !== 'map')) {
      expect(used.has(name), name).toBe(true);
    }
  });

  it('maps the levels as designed', () => {
    const byName = (n: string): RoomName => LEVELS.find((l) => l.name === n)!.room;
    expect(byName('Crystal Caves')).toBe('cave');
    expect(byName('Whisper Hollow')).toBe('cave');
    expect(byName('Mirror Shafts')).toBe('shaft');
    expect(byName("Mildred's Citadel")).toBe('citadel');
    expect(byName('Cocoa Foundry')).toBe('foundry');
    expect(byName('Crater Fields')).toBe('outdoor');
    expect(byName('Zarg Lookout')).toBe('tower');
    expect(byName('Bonbon Playhouse')).toBe('theatre');
  });

  it('puts the title, cinematics, ending and credits in the neutral room whatever the sim says', () => {
    for (const screen of ['loading', 'title', 'cine', 'ending', 'credits']) {
      for (const mode of [Mode.NONE, Mode.ATTRACT, Mode.MAP, Mode.LEVEL]) {
        expect(roomFor(screen, mode, 1), `${screen} ${mode}`).toBe('neutral');
      }
    }
  });

  it('covers every screen and every level id', () => {
    for (const screen of SCREENS) {
      expect(roomFor(screen, Mode.MAP, 0), screen).toBe(screen in neutral ? 'neutral' : 'map');
      for (const [id, level] of LEVELS.entries()) {
        const want = screen in neutral ? 'neutral' : level.room;
        expect(roomFor(screen, Mode.LEVEL, id), `${screen} ${id}`).toBe(want);
      }
      expect(roomFor(screen, Mode.NONE, 0), screen).toBe('neutral');
    }
    // An id the table does not have falls back rather than throwing.
    expect(roomFor('play', Mode.LEVEL, 99)).toBe('neutral');
  });

  it('lowers the sends on a phone and leaves the table alone', () => {
    const cave = roomProfile('cave', true);
    expect(cave.sfxSend).toBeCloseTo(ROOMS.cave.sfxSend * COARSE_SEND, 12);
    expect(cave.musicSend).toBeCloseTo(ROOMS.cave.musicSend * COARSE_SEND, 12);
    expect(cave.coarseSeconds).toBe(ROOMS.cave.coarseSeconds);
    expect(ROOMS.cave.sfxSend).toBe(0.36);
    expect(roomProfile('cave', false)).toEqual(ROOMS.cave);
    expect(roomProfile('cave', false)).not.toBe(ROOMS.cave);
  });
});

/**
 * What a send does to the sound, measured. A click through each room in Chromium (an
 * OfflineAudioContext at 48 kHz, the real master chain, sends at 0 against sends at 0.05) gave the
 * energy of the reverb against the energy of the dry sound as `20 log10(send * ROOM_SEND_SCALE) + C`,
 * where C depends on the room's impulse response (its length, damping, ring and send filters). C on
 * a desktop and on a coarse pointer (the shorter response), in dB:
 */
const C: Record<RoomName, [number, number]> = {
  neutral: [-18.03, -19.31],
  map: [-20.15, -21.11],
  outdoor: [-21.65, -22.23],
  cave: [-13.25, -15.02],
  shaft: [-13.85, -15.3],
  citadel: [-15.93, -17.03],
  tower: [-17.45, -18.86],
  theatre: [-16.29, -17.67],
  foundry: [-16.63, -17.62],
};
const wetDb = (name: RoomName, bus: 'sfxSend' | 'musicSend', coarse: boolean): number => {
  const p = roomProfile(name, coarse);
  return 20 * Math.log10(p[bus] * ROOM_SEND_SCALE) + C[name][coarse ? 1 : 0];
};

describe('how wet the rooms are (measured offline; how it sounds is for ears)', () => {
  it('has the reverb of the cave clearly audible, about 4 dB under the dry effects', () => {
    // Before the send scale a cave at 0.22 was 26 dB under the dry sound, and its tail 38 dB under.
    expect(wetDb('cave', 'sfxSend', false)).toBeGreaterThan(-6);
    expect(wetDb('cave', 'sfxSend', false)).toBeLessThan(-2);
    expect(wetDb('cave', 'musicSend', false)).toBeGreaterThan(-13);
  });

  it('orders the rooms from the wettest to the driest', () => {
    const order: RoomName[] = ['cave', 'shaft', 'citadel', 'theatre', 'foundry', 'tower'];
    const wet = order.map((n) => wetDb(n, 'sfxSend', false));
    for (let i = 1; i < wet.length; i++) expect(wet[i]!, order[i]).toBeLessThanOrEqual(wet[i - 1]!);
    for (const n of order) expect(wetDb(n, 'sfxSend', false), n).toBeGreaterThan(-12);
    expect(wetDb('tower', 'sfxSend', false)).toBeGreaterThan(
      wetDb('neutral', 'sfxSend', false) + 6,
    );
  });

  it('keeps the map, the outdoors and the neutral room dry, at least 18 dB under', () => {
    for (const n of ['neutral', 'map', 'outdoor'] as const) {
      expect(wetDb(n, 'sfxSend', false), n).toBeLessThan(-18);
    }
    expect(wetDb('outdoor', 'sfxSend', false)).toBeLessThan(wetDb('map', 'sfxSend', false));
    expect(wetDb('outdoor', 'musicSend', false)).toBeLessThan(-30);
  });

  it('keeps every wet room audible on a phone, within 5 dB of the desktop', () => {
    for (const n of ['cave', 'shaft', 'citadel', 'tower', 'theatre', 'foundry'] as const) {
      const drop = wetDb(n, 'sfxSend', false) - wetDb(n, 'sfxSend', true);
      expect(drop, n).toBeGreaterThan(0);
      expect(drop, n).toBeLessThan(5);
      expect(wetDb(n, 'sfxSend', true), n).toBeGreaterThan(-15);
    }
  });

  it('keeps the music’s reverb under the effects’ in every room', () => {
    for (const n of NAMES) {
      expect(wetDb(n, 'musicSend', false), n).toBeLessThan(wetDb(n, 'sfxSend', false));
    }
  });
});
