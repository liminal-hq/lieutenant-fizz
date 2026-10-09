// Tests for the room table: every screen and level has a room, and the levels and the table agree.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { MASTER_DEFAULTS } from '@lieutenant-fizz/engine/master';
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
      expect(r.sfxSend, name).toBeLessThanOrEqual(0.3);
      expect(r.musicSend, name).toBeLessThanOrEqual(0.1);
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
    expect(ROOMS.cave.sfxSend).toBe(0.22);
    expect(roomProfile('cave', false)).toEqual(ROOMS.cave);
    expect(roomProfile('cave', false)).not.toBe(ROOMS.cave);
  });
});
