// Tests for turning a stored session into a zip.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { readZip } from '../zip-test-util';
import { countEvents, exportName, sessionFiles, sessionZip, startedDate } from './export';
import type { SessionHeader } from './store';

const header: SessionHeader = {
  v: 1,
  id: 'abc123',
  startedAt: '2026-10-13T14:02:00-04:00',
  specs: { host: 'web', browser: 'Chrome', screen: [1920, 1080] },
};
const chunks = [
  '{"t":0,"ms":0,"e":"screen","to":"title"}\n{"t":1,"ms":16,"e":"key","k":"Enter","down":true}\n',
  '{"t":2,"ms":33,"e":"key","k":"Enter","down":false}\n',
];

describe('sessionFiles', () => {
  it('makes a log of a header line and every event, and the specs, indented', () => {
    const [log, specs] = sessionFiles({ header, chunks });
    expect(log!.name).toBe('session.ndjson');
    const lines = new TextDecoder().decode(log!.data).split('\n');
    expect(JSON.parse(lines[0]!)).toEqual({
      v: 1,
      id: 'abc123',
      startedAt: '2026-10-13T14:02:00-04:00',
    });
    expect(lines).toHaveLength(1 + 3 + 1);
    expect(lines.at(-1)).toBe('');
    expect(JSON.parse(lines[3]!)).toMatchObject({ e: 'key', down: false });
    expect(specs!.name).toBe('specs.json');
    const text = new TextDecoder().decode(specs!.data);
    expect(JSON.parse(text)).toEqual(header.specs);
    expect(text).toContain('\n  "browser"');
  });

  it('does not put the specs in the log twice, or anything else about the device', () => {
    const [log] = sessionFiles({ header, chunks });
    expect(new TextDecoder().decode(log!.data)).not.toContain('Chrome');
  });
});

describe('sessionZip', () => {
  it('holds both files, readable, stamped with the start time', async () => {
    const zip = await sessionZip({ header, chunks });
    const files = readZip(zip);
    expect(files.map((f) => f.name)).toEqual(['session.ndjson', 'specs.json']);
    expect(new TextDecoder().decode(files[0]!.data)).toContain('"e":"screen"');
    expect(files[0]!.time).toBe((14 << 11) | (2 << 5) | 0);
    expect(files[0]!.date).toBe(((2026 - 1980) << 9) | (10 << 5) | 13);
  });

  it('is the same bytes every time for the same session', async () => {
    expect(await sessionZip({ header, chunks })).toEqual(await sessionZip({ header, chunks }));
  });
});

describe('names and dates', () => {
  it('names the zip after the session', () => {
    expect(exportName('fizz', 'abc123')).toBe('fizz-session-abc123.zip');
  });

  it('reads the start as written, and falls back to 1980 for text it cannot read', () => {
    const d = startedDate('2026-10-13T14:02:30-04:00');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 9, 13, 14, 2,
    ]);
    expect(startedDate('nonsense').getFullYear()).toBe(1980);
  });
});

describe('countEvents', () => {
  it('counts events by kind across chunks, skipping blank and broken lines', () => {
    const got = countEvents([...chunks, 'not json\n\n{"x":1}\n{"e":7}\n']);
    expect(got).toEqual({ total: 3, kinds: { screen: 1, key: 2 } });
  });

  it('counts nothing for no chunks', () => {
    expect(countEvents([])).toEqual({ total: 0, kinds: {} });
  });
});
