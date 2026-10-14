// Tests for reading a play sample's log from a zip or from the store.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { readZip } from '../zip-read';
import { sessionZip } from './export';
import { num, parseEvents, parseSession, sessionFromStore } from './log';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

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

  it('reads extra files in the zip without minding them', async () => {
    const files = await readZip(
      await sessionZip({
        header: { v: 1, id: 'x', startedAt: '2026-10-13T14:02:00-04:00', specs: {} },
        chunks: ['{"t":0,"ms":0,"e":"vis","v":"hidden"}\n'],
      }),
    );
    const s = parseSession('x.zip', [...files, { name: 'comments.json', data: text('{}') }]);
    expect(s.events).toHaveLength(1);
  });
});

describe('sessionFromStore', () => {
  it('reads what a store holds: the header and chunks of events, with a cut-off last line skipped', () => {
    const s = sessionFromStore('saved', {
      header: { v: 1, id: 'abc', startedAt: '2026-10-13T14:02:00-04:00', specs: { host: 'app' } },
      chunks: ['{"t":1,"ms":10,"e":"in","b":2}\n{"t":2,"ms":20,"e":"in","b":0}\n', '{"t":3,"ms'],
    });
    expect(s).toMatchObject({
      name: 'saved',
      id: 'abc',
      startedAt: '2026-10-13T14:02:00-04:00',
      specs: { host: 'app' },
      skipped: 1,
    });
    expect(s.events.map((e) => e.t)).toEqual([1, 2]);
  });
});

describe('parseEvents and num', () => {
  it('keeps events, skips lines that are not, and counts them', () => {
    const { events, skipped } = parseEvents(['', '{"t":1,"ms":2,"e":"in"}', 'nope', '{"t":"x"}']);
    expect(events).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it('reads a number field, or the fallback for anything else', () => {
    const [e] = parseEvents(['{"t":1,"ms":2,"e":"pos","x":3.5,"y":"up"}']).events;
    expect(num(e!, 'x')).toBe(3.5);
    expect(num(e!, 'y', -1)).toBe(-1);
    expect(num(e!, 'missing')).toBe(0);
  });
});
