// Tests for the sound lab's pure logic: the item lists, the slider specs and the tuned-versus-default diff.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { applyAudioTune } from '@lieutenant-fizz/engine/audio-tune';
import { PART_PAN } from '@lieutenant-fizz/engine/sound-field';
import {
  LAB_DEFAULTS,
  MASTER_SLIDERS,
  allSliders,
  auditionAt,
  captureState,
  countChanges,
  formatValue,
  fromPosition,
  inputAttrs,
  labItems,
  mixSliders,
  patchFor,
  readPath,
  roomSliders,
  snap,
  toPosition,
  tuneDiff,
  tuneJson,
  type LabState,
} from './lab';
import { MIX } from './mix';
import { MUSIC, SFX } from './patterns';
import { ROOMS } from './rooms';

const fresh = (): LabState => captureState(LAB_DEFAULTS);

describe('labItems', () => {
  it('has one button for every sound effect and every track, in table order', () => {
    expect(labItems(Object.keys(SFX)).map((i) => i.id)).toEqual(Object.keys(SFX));
    expect(labItems(Object.keys(MUSIC)).map((i) => i.id)).toEqual(Object.keys(MUSIC));
    expect(Object.keys(SFX).length).toBeGreaterThan(20);
  });
  it('has one button for every room and every mix state', () => {
    expect(labItems(Object.keys(ROOMS)).length).toBe(9);
    expect(labItems(Object.keys(MIX)).map((i) => i.id)).toContain('pauseCoarse');
  });
});

describe('sliders', () => {
  const sliders = allSliders('cave', 'pause');
  it('have unique ids, sane ranges and a default inside the range', () => {
    expect(new Set(sliders.map((s) => s.id)).size).toBe(sliders.length);
    for (const s of sliders) {
      expect(s.min).toBeLessThan(s.max);
      expect(s.step).toBeGreaterThan(0);
      const v = readPath(LAB_DEFAULTS, s.path);
      expect(v, s.id).toBeTypeOf('number');
      expect(v!, s.id).toBeGreaterThanOrEqual(s.min);
      expect(v!, s.id).toBeLessThanOrEqual(s.max);
    }
  });
  it('cover the controls the lab promises', () => {
    const ids = sliders.map((s) => s.id);
    for (const id of [
      'master.trim',
      'master.comp.threshold',
      'master.comp.ratio',
      'master.lowShelf.gain',
      'master.highShelf.gain',
      'field.width',
      'field.floor',
      'partPan.bell',
      'partPan.arp.0',
      'rooms.cave.sfxSend',
      'rooms.cave.musicSend',
      'mix.pause.lpf',
    ]) {
      expect(ids).toContain(id);
    }
  });
  it('are accepted by applyAudioTune at both ends of their range', () => {
    const saved = captureState();
    try {
      for (const s of sliders) {
        for (const v of [s.min, s.max]) {
          const r = applyAudioTune(patchFor(s, v, fresh()), { mix: MIX, rooms: ROOMS });
          expect(r.ignored, `${s.id} at ${v}`).toEqual([]);
        }
      }
    } finally {
      applyAudioTune(tuneDiff(captureState(), saved), { mix: MIX, rooms: ROOMS });
    }
  });
  it('apply on release when they restart the music or rebuild a room', () => {
    expect(
      allSliders('cave', 'pause')
        .filter((s) => s.onRelease)
        .map((s) => s.path[0])
        .sort(),
    ).toEqual(expect.arrayContaining(['partPan', 'rooms']));
    expect(MASTER_SLIDERS.some((s) => s.onRelease)).toBe(false);
    expect(mixSliders('pause').some((s) => s.onRelease)).toBe(false);
    expect(roomSliders('cave').every((s) => s.onRelease)).toBe(true);
  });
});

describe('snap and positions', () => {
  const trim = MASTER_SLIDERS[0]!;
  it('snap removes float noise and keeps the range', () => {
    expect(snap(trim, 0.1 + 0.2)).toBe(0.3);
    expect(snap(trim, 9)).toBe(1.2);
    expect(snap(trim, -1)).toBe(0);
  });
  it('log sliders cover their range over 0 to 1 and round-trip', () => {
    const cutoff = mixSliders('pause')[0]!;
    expect(inputAttrs(cutoff)).toEqual({ min: 0, max: 1, step: 0.001 });
    expect(fromPosition(cutoff, 0)).toBe(100);
    expect(fromPosition(cutoff, 1)).toBe(20000);
    expect(toPosition(cutoff, 900)).toBeGreaterThan(0.3);
    expect(toPosition(cutoff, 900)).toBeLessThan(0.5);
    expect(fromPosition(cutoff, toPosition(cutoff, 900))).toBe(900);
  });
  it('linear sliders use their own range', () => {
    expect(inputAttrs(trim)).toEqual({ min: 0, max: 1.2, step: 0.01 });
    expect(toPosition(trim, 0.55)).toBe(0.55);
  });
  it('labels carry the unit', () => {
    expect(formatValue(MASTER_SLIDERS[1]!, -16)).toBe('-16 dB');
    expect(formatValue(mixSliders('pause')[0]!, 900)).toBe('900 Hz');
    expect(formatValue(mixSliders('pause')[0]!, 20000)).toBe('20.0 k Hz');
    expect(formatValue(trim, 0.55)).toBe('0.55');
  });
});

describe('patchFor', () => {
  it('nests a master value and a room value', () => {
    const s = fresh();
    expect(patchFor(MASTER_SLIDERS[1]!, -20, s)).toEqual({ master: { comp: { threshold: -20 } } });
    expect(patchFor(roomSliders('cave')[0]!, 0.15, s)).toEqual({
      rooms: { cave: { sfxSend: 0.15 } },
    });
  });
  it('sends the whole pair for one side of the arpeggio pan', () => {
    const s = fresh();
    s.partPan.arp = [-0.3, 0.3];
    const right = allSliders('cave', 'pause').find((x) => x.id === 'partPan.arp.1')!;
    expect(patchFor(right, 0.5, s)).toEqual({ partPan: { arp: [-0.3, 0.5] } });
  });
});

describe('tuneDiff', () => {
  it('is empty when nothing moved', () => {
    expect(tuneDiff(LAB_DEFAULTS, fresh())).toEqual({});
    expect(tuneJson(tuneDiff(LAB_DEFAULTS, fresh()))).toBe('{}');
    expect(countChanges({})).toBe(0);
  });
  it('lists only the values that moved, in the shape debugAudioTune takes', () => {
    const s = fresh();
    s.master.trim = 0.6;
    s.master.comp.ratio = 3;
    s.field.floor = 0.5;
    s.partPan.bell = 0.2;
    s.partPan.arp = [-0.4, 0.4];
    s.rooms.cave!.sfxSend = 0.15;
    s.mix.pause!.lpf = 700;
    const d = tuneDiff(LAB_DEFAULTS, s);
    expect(d).toEqual({
      master: { trim: 0.6, comp: { ratio: 3 } },
      field: { floor: 0.5 },
      partPan: { bell: 0.2, arp: [-0.4, 0.4] },
      rooms: { cave: { sfxSend: 0.15 } },
      mix: { pause: { lpf: 700 } },
    });
    expect(countChanges(d)).toBe(7);
    expect(JSON.parse(tuneJson(d))).toEqual(d);
  });
  it('round-trips: applying the diff reproduces the state and the reverse diff restores the defaults', () => {
    const saved = captureState();
    try {
      const s = fresh();
      s.master.limiter.threshold = -4;
      s.partPan.hats = -0.1;
      s.rooms.foundry!.ring!.amount = 0.2;
      s.mix.dialogue!.gain = 0.6;
      const report = applyAudioTune(tuneDiff(LAB_DEFAULTS, s), { mix: MIX, rooms: ROOMS });
      expect(report.ignored).toEqual([]);
      expect(PART_PAN.hats).toBe(-0.1);
      expect(ROOMS.foundry.ring!.amount).toBe(0.2);
      expect(tuneDiff(LAB_DEFAULTS, captureState())).toEqual(tuneDiff(LAB_DEFAULTS, s));
      const back = applyAudioTune(tuneDiff(captureState(), LAB_DEFAULTS), {
        mix: MIX,
        rooms: ROOMS,
      });
      expect(back.ignored).toEqual([]);
      expect(tuneDiff(LAB_DEFAULTS, captureState())).toEqual({});
    } finally {
      applyAudioTune(tuneDiff(captureState(), saved), { mix: MIX, rooms: ROOMS });
    }
  });
});

describe('auditionAt', () => {
  it('keeps the pan as set, within -1 to 1', () => {
    expect(auditionAt(0.5, 0).pan).toBe(0.5);
    expect(auditionAt(-3, 0).pan).toBe(-1);
  });
  it('is at full level within the near distance and fades to the floor', () => {
    const f = { width: 0.6, near: 1, slope: 0.5, floor: 0.4 };
    expect(auditionAt(0, 0, f).gain).toBe(1);
    expect(auditionAt(0, 1, f).gain).toBe(1);
    expect(auditionAt(0, 2, f).gain).toBe(0.5);
    expect(auditionAt(0, 4, f).gain).toBe(0.4);
    expect(auditionAt(0, 99, f).gain).toBe(0.4);
  });
  it('follows the live FIELD', () => {
    expect(auditionAt(0, 4).gain).toBeGreaterThan(0);
  });
});
