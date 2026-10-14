// Tests for the sample viewer's data layer: reading zips, sessions, attempts and the combined numbers.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { sessionZip } from '@lieutenant-fizz/engine/session/export';
import { buildZip } from '@lieutenant-fizz/engine/zip';
import { describe, expect, it } from 'vitest';
import { attemptsOf, dwells, type Attempt } from './attempts';
import { pressCounts, summarise } from './aggregate';
import { causeText, KIND_NAMES } from './names';
import { parseSession, type Session } from './session';
import { readZip } from './zip-read';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

/** A session from event objects, as the viewer would read it from a zip. */
function session(name: string, events: object[], specs: object = { host: 'web' }): Session {
  const lines = events.map((e, i) => JSON.stringify({ ms: i * 10, ...e }));
  return parseSession(name, [
    {
      name: 'session.ndjson',
      data: text(
        `${JSON.stringify({ v: 1, id: name, startedAt: '2026-10-13T14:02:00-04:00' })}\n${lines.join('\n')}\n`,
      ),
    },
    { name: 'specs.json', data: text(JSON.stringify(specs)) },
  ]);
}

describe('readZip', () => {
  it('reads a zip the engine wrote, stored and deflated', async () => {
    const big = text('{"e":"pos"}\n'.repeat(500));
    const zip = await buildZip([
      { name: 'a.txt', data: text('hello') },
      { name: 'big.txt', data: big },
    ]);
    const files = await readZip(zip);
    expect(files.map((f) => f.name)).toEqual(['a.txt', 'big.txt']);
    expect(new TextDecoder().decode(files[0]!.data)).toBe('hello');
    expect(files[1]!.data).toEqual(big);
  });

  it('reads a zip made by a different writer', async () => {
    // Hand-built with Node's deflate, so it shares nothing with the engine's writer.
    const data = text('the quick brown fox '.repeat(100));
    const body = new Uint8Array(deflateRawSync(data));
    const { crc32 } = await import('node:zlib');
    const name = text('fox.txt');
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(14, crc32(data), true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(16, crc32(data), true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    central.set(name, 46);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true);
    ev.setUint32(16, local.length + body.length, true);
    const zip = new Uint8Array([...local, ...body, ...central, ...end]);
    const [file] = await readZip(zip);
    expect(file!.name).toBe('fox.txt');
    expect(file!.data).toEqual(data);
  });

  it('refuses what is not a zip, a damaged zip and a failed check, with a plain message', async () => {
    await expect(readZip(text('not a zip'))).rejects.toThrow('not a zip');
    await expect(readZip(new Uint8Array(100))).rejects.toThrow('not a zip');
    const zip = await buildZip([{ name: 'a.txt', data: text('hello') }]);
    const broken = new Uint8Array(zip);
    broken[35] = broken[35]! ^ 0xff; // the first byte of the stored file, after the 30 byte header and the name
    await expect(readZip(broken)).rejects.toThrow('fails its check');
    await expect(readZip(zip.subarray(0, zip.length - 30))).rejects.toThrow();
  });
});

describe('parseSession', () => {
  it('reads the header, the specs and the events, and counts a broken line', () => {
    const s = parseSession('s.zip', [
      {
        name: 'session.ndjson',
        data: text(
          '{"v":1,"id":"abc","startedAt":"2026-10-13T14:02:00-04:00"}\n{"t":1,"ms":16,"e":"key"}\n{"t":2,"ms":3\n{"nope":1}\n',
        ),
      },
      { name: 'specs.json', data: text('{"host":"web"}') },
    ]);
    expect(s).toMatchObject({
      id: 'abc',
      startedAt: '2026-10-13T14:02:00-04:00',
      specs: { host: 'web' },
      skipped: 2,
    });
    expect(s.events).toHaveLength(1);
  });

  it('says what is wrong with a zip that is not a sample, or is from another version', () => {
    expect(() => parseSession('x.zip', [])).toThrow('is not a play sample');
    const files = (head: string) => [
      { name: 'session.ndjson', data: text(head) },
      { name: 'specs.json', data: text('{}') },
    ];
    expect(() => parseSession('x.zip', files('nope\n'))).toThrow('no header');
    expect(() => parseSession('x.zip', files('{"v":2}\n'))).toThrow('does not know (v2)');
  });

  it('reads a zip the game itself would save', async () => {
    const zip = await sessionZip({
      header: {
        v: 1,
        id: 'abc123',
        startedAt: '2026-10-13T14:02:00-04:00',
        specs: { host: 'web' },
      },
      chunks: ['{"t":0,"ms":0,"e":"screen","to":"title"}\n'],
    });
    const s = parseSession('fizz.zip', await readZip(zip));
    expect(s.id).toBe('abc123');
    expect(s.events).toEqual([{ t: 0, ms: 0, e: 'screen', to: 'title' }]);
  });
});

/** A level attempt's events, from a start to an end event. */
const play = (id: number, name: string, attempt: number, from: number, end: object[]): object[] => [
  { t: from, e: 'level', id, name, attempt },
  { t: from + 4, e: 'pos', x: 2, y: 3 },
  { t: from + 8, e: 'pos', x: 6, y: 3 },
  ...end,
];

describe('attemptsOf', () => {
  it('ends an attempt at a clear, at a death, at the next level and at the end of the log', () => {
    const s = session('s', [
      ...play(0, 'Crater Fields', 1, 100, [
        { t: 120, e: 'death', cause: 3, detail: 5, x: 6.4, y: 2.1 },
        { t: 200, e: 'ev', k: 'died', a: 2, b: 0, c: 0 },
      ]),
      ...play(0, 'Crater Fields', 2, 300, [
        { t: 900, e: 'ev', k: 'level_complete', a: 0, b: 0, c: 0 },
      ]),
      ...play(1, 'Crystal Caves', 1, 1000, []),
      ...play(2, 'Mildred’s Citadel', 1, 1100, []),
    ]);
    const attempts = attemptsOf(s);
    expect(attempts.map((a) => [a.level, a.attempt, a.outcome])).toEqual([
      ['Crater Fields', 1, 'died'],
      ['Crater Fields', 2, 'clear'],
      ['Crystal Caves', 1, 'left'],
      ['Mildred’s Citadel', 1, 'open'],
    ]);
    expect(attempts[0]).toMatchObject({
      ticks: 100,
      death: { cause: 3, detail: 5, x: 6.4, y: 2.1 },
    });
    expect(attempts[1]!.ticks).toBe(600);
    // Leaving or being cut short ends at the last place Ben was seen.
    expect(attempts[2]).toMatchObject({ endTick: 1008, ticks: 8 });
    expect(attempts[3]!.path).toHaveLength(2);
  });

  it('counts pauses, and treats going back to the title as leaving', () => {
    const s = session('s', [
      ...play(0, 'Crater Fields', 1, 0, [
        { t: 20, e: 'screen', to: 'pause' },
        { t: 30, e: 'screen', to: 'play' },
        { t: 40, e: 'screen', to: 'pause' },
        { t: 50, e: 'screen', to: 'title' },
      ]),
    ]);
    const [a] = attemptsOf(s);
    expect(a).toMatchObject({ pauses: 2, outcome: 'left' });
  });

  it('ignores events before the first level', () => {
    expect(
      attemptsOf(
        session('s', [
          { t: 0, e: 'pos', x: 1, y: 1 },
          { t: 1, e: 'screen', to: 'title' },
        ]),
      ),
    ).toEqual([]);
  });
});

describe('pressCounts', () => {
  it('counts a button each time its bit goes on, not while it is held', () => {
    const s = session('s', [
      { t: 0, e: 'in', b: 2 },
      { t: 1, e: 'in', b: 2 | 16 },
      { t: 2, e: 'in', b: 2 },
      { t: 3, e: 'in', b: 2 | 16 },
      { t: 4, e: 'in', b: 0 },
    ]);
    // Order: Left, Right, Up, Down, Jump, Pogo, Fizz.
    expect(pressCounts(s)).toEqual([0, 1, 0, 0, 2, 0, 0]);
  });
});

describe('summarise', () => {
  const a = session('a', [
    ...play(0, 'Crater Fields', 1, 0, [
      { t: 50, e: 'death', cause: 3, detail: 5, x: 30.2, y: 2.4 },
      { t: 60, e: 'ev', k: 'died', a: 2, b: 0, c: 0 },
    ]),
    ...play(0, 'Crater Fields', 2, 100, [
      { t: 700, e: 'ev', k: 'level_complete', a: 0, b: 0, c: 0 },
    ]),
    { t: 710, e: 'in', b: 16 },
  ]);
  const b = session('b', [
    ...play(0, 'Crater Fields', 1, 0, [
      { t: 80, e: 'death', cause: 5, detail: 0, x: 30.9, y: 2.9 },
      { t: 90, e: 'ev', k: 'died', a: 2, b: 0, c: 0 },
    ]),
    ...play(1, 'Crystal Caves', 1, 200, [
      { t: 500, e: 'ev', k: 'level_complete', a: 1, b: 0, c: 0 },
    ]),
  ]);

  it('gives each level its attempts, clears, deaths, rate and medians', () => {
    const { levels, sessions } = summarise([a, b]);
    expect(sessions).toBe(2);
    expect(levels.map((l) => [l.name, l.plays, l.clears, l.deaths, l.clearRate])).toEqual([
      ['Crater Fields', 3, 1, 2, 1 / 3],
      ['Crystal Caves', 1, 1, 0, 1],
    ]);
    expect(levels[0]).toMatchObject({ medianClearTicks: 600, medianTicks: 90 });
  });

  it('counts lives lost by cause, with the enemy’s kind, and groups deaths by tile', () => {
    const { causes, spots } = summarise([a, b]);
    expect(causes).toEqual([
      { name: 'Chocolate', count: 1 },
      { name: 'An enemy (Gloop)', count: 1 },
    ]);
    expect(spots).toHaveLength(1);
    expect(spots[0]).toMatchObject({ level: 'Crater Fields', x: 30, y: 2, count: 2 });
  });

  it('counts the buttons pressed across sessions', () => {
    expect(summarise([a, b]).buttons.find((x) => x.name === 'Jump')!.count).toBe(1);
  });

  it('copes with no sessions', () => {
    expect(summarise([])).toMatchObject({ sessions: 0, levels: [], causes: [], spots: [] });
  });
});

describe('the enemy names', () => {
  it('are the variants of the Rust `Kind` enum, in its order', () => {
    const src = readFileSync(
      new URL('../../../episodes/episode-1/game/src/ents.rs', import.meta.url),
      'utf8',
    );
    const body = /pub enum Kind \{([\s\S]*?)\n\}/.exec(src)![1]!;
    const variants = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[A-Z][A-Za-z]*,$/.test(l))
      .map((l) => l.slice(0, -1));
    expect([...KIND_NAMES]).toEqual(variants);
  });

  it('name a death in words', () => {
    expect(causeText(2, 4)).toBe('Spikes');
    expect(causeText(5, 0)).toBe('An enemy (Gloop)');
    expect(causeText(6, 5)).toBe('A pod’s puff (Pod)');
    expect(causeText(99, 0)).toBe('Cause 99');
  });
});

describe('dwells', () => {
  const attempt = (path: [number, number, number][]): Attempt => ({
    session: 's',
    levelId: 0,
    level: 'L',
    attempt: 1,
    startTick: 0,
    endTick: 0,
    ticks: 0,
    outcome: 'clear',
    path: path.map(([x, y, t]) => ({ x, y, t })),
    pauses: 0,
  });

  it('finds a place Ben stayed for at least a second and a half', () => {
    const got = dwells(
      attempt([
        [0, 0, 0],
        [4, 0, 4],
        [4.1, 0, 60],
        [4.2, 0.1, 120],
        [4.1, 0, 160],
        [9, 0, 164],
      ]),
    );
    expect(got).toEqual([{ x: 4, y: 0, ticks: 156 }]);
  });

  it('finds none when he keeps moving, and none for a short stop', () => {
    const moving = Array.from({ length: 50 }, (_, i): [number, number, number] => [i, 0, i * 4]);
    expect(dwells(attempt(moving))).toEqual([]);
    expect(
      dwells(
        attempt([
          [1, 1, 0],
          [1, 1, 40],
          [5, 5, 44],
        ]),
      ),
    ).toEqual([]);
    expect(dwells(attempt([]))).toEqual([]);
  });

  it('finds a dwell at the very end of a path', () => {
    expect(
      dwells(
        attempt([
          [0, 0, 0],
          [0.1, 0, 100],
        ]),
      ),
    ).toEqual([{ x: 0, y: 0, ticks: 100 }]);
  });
});
