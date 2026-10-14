// Tests for putting a sample's files and added files into one zip.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { crc32 } from '../crc32';
import { readZip } from '../zip-read';
import { bundleZip, NOTES_FILE, notesZipName } from './bundle';
import { COMMENTS_FILE } from './comments';
import { sessionFiles } from './export';
import { parseSession } from './log';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);
const when = new Date(2026, 9, 14, 9, 0, 0);

const original = sessionFiles({
  header: { v: 1, id: 'abc', startedAt: '2026-10-13T14:02:00-04:00', specs: { host: 'web' } },
  chunks: ['{"t":1,"ms":10,"e":"in","b":2}\n'.repeat(50)],
});

describe('bundleZip', () => {
  it('keeps the sample’s own files byte for byte and adds the new ones', async () => {
    const zip = await bundleZip(
      original,
      [
        { name: COMMENTS_FILE, data: text('{"v":1}') },
        { name: NOTES_FILE, data: text('# notes') },
      ],
      when,
    );
    const files = await readZip(zip);
    expect(files.map((f) => f.name)).toEqual([
      'session.ndjson',
      'specs.json',
      COMMENTS_FILE,
      NOTES_FILE,
    ]);
    for (const o of original) {
      const got = files.find((f) => f.name === o.name)!;
      expect(crc32(got.data)).toBe(crc32(o.data));
      expect(got.data).toEqual(o.data);
    }
  });

  it('replaces a file of the same name, so a second export replaces the first one’s comments', async () => {
    const first = await readZip(
      await bundleZip(original, [{ name: COMMENTS_FILE, data: text('one') }], when),
    );
    const second = await readZip(
      await bundleZip(first, [{ name: COMMENTS_FILE, data: text('two') }], when),
    );
    expect(second.filter((f) => f.name === COMMENTS_FILE)).toHaveLength(1);
    expect(new TextDecoder().decode(second.find((f) => f.name === COMMENTS_FILE)!.data)).toBe(
      'two',
    );
  });

  it('still reads as a sample, extra files and all', async () => {
    const zip = await bundleZip(original, [{ name: NOTES_FILE, data: text('# notes') }], when);
    const session = parseSession('x.zip', await readZip(zip));
    expect(session.id).toBe('abc');
    expect(session.events).toHaveLength(50);
  });

  it('names the zip for the session', () => {
    expect(notesZipName('c89653a1')).toBe('fizz-c89653a1-notes.zip');
  });
});
