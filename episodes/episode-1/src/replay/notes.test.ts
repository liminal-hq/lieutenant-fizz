// Tests for the plain-text notes of a sample with comments, and for the verdicts that go in them.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  addComment,
  emptyComments,
  type CommentsFile,
} from '@lieutenant-fizz/engine/session/comments';
import { parseSession, type Session } from '@lieutenant-fizz/engine/session/log';
import { beforeAll, describe, expect, it } from 'vitest';
import { Sim, type SpriteRect } from '../sim/sim';
import { notesMarkdown } from './notes';
import { sessionOf } from './session-test-util';
import { verdictsFor } from './verdicts';

const when = new Date('2026-10-14T09:30:00Z');
let n = 0;
const id = (): string => `c-${(n += 1)}`;

/** A small session: one attempt that ends in a death, with a caption and the counts on the way. */
function session(): Session {
  return sessionOf(
    'fizz.zip',
    [
      { t: 100, e: 'level', id: 7, name: 'Fudge Bog', attempt: 1 },
      { t: 104, e: 'st', lives: 2, ammo: 14, score: 513, pogo: 0 },
      { t: 150, e: 'in', b: 2 | 16 },
      { t: 190, e: 'ev', k: 'caption', a: 1, b: 2, c: 3, n: 'pfff' },
      { t: 220, e: 'death', cause: 6, detail: 5, x: 15.24, y: 4 },
      { t: 300, e: 'ev', k: 'died', a: 0, b: 0, c: 0 },
    ],
    {
      host: 'tauri-android',
      browser: 'WebView',
      browserVersion: '154',
      os: 'Android',
      osVersion: '17',
      screen: [1174, 528],
      game: '0.2.0',
      rec: 2,
      sim: 'abcd1234',
      size: 'M',
    },
  );
}

function comments(s: Session): CommentsFile {
  n = 0;
  let file = emptyComments({ id: s.id, startedAt: s.startedAt });
  file = addComment(
    file,
    {
      tick: 200,
      text: 'The pod’s puff is hard to see.\nIt blends with the wall.',
      level: 7,
      attempt: 0,
      at: { x: 15.2, y: 4 },
      author: 'Scott',
    },
    when,
    id,
  );
  return addComment(file, { tick: 130, text: 'Starts too fast.' }, when, id);
}

describe('notesMarkdown', () => {
  it('says what the files are and how to read the ticks and tiles', () => {
    const text = notesMarkdown({ session: session(), comments: comments(session()) });
    expect(text).toContain('# Play sample notes: fizz.zip');
    expect(text).toContain('`comments.json`');
    expect(text).toContain('60 to the second');
    expect(text).toContain('y goes up');
  });

  it('describes the session and its device', () => {
    const text = notesMarkdown({ session: session(), comments: comments(session()) });
    expect(text).toContain('- Device: WebView 154 on Android 17, 1174×528');
    expect(text).toContain('- Game: 0.2.0 (recording revision 2), simulation build abcd1234');
    expect(text).toContain('- 1 attempts at 1 level');
  });

  it('lists the attempts, with how each ended and the replay’s verdict, and where lives were lost', () => {
    const text = notesMarkdown({
      session: session(),
      comments: comments(session()),
      verdicts: new Map([[0, 'matches the recording']]),
    });
    expect(text).toContain(
      '| 1 | Fudge Bog | 1 | died | 0:03.3 | A pod’s puff (Pod) | (15.2, 4.0) | matches the recording |',
    );
    expect(text).toContain('- Fudge Bog, tile 15, 4: 1 (A pod’s puff (Pod))');
  });

  it('puts each comment in tick order with its moment, its words, who wrote it and what was happening', () => {
    const text = notesMarkdown({ session: session(), comments: comments(session()) });
    const first = text.indexOf('### 1. Fudge Bog, try 1, 0:00.5 (tick 130)');
    const second = text.indexOf('### 2. Fudge Bog, try 1, 0:01.7 (tick 200) at (15.2, 4.0)');
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(text).toContain('> The pod’s puff is hard to see.\n> It blends with the wall.');
    expect(text).toContain('By Scott, 2026-10-14.');
    // The second comment is at tick 200: the counts and the held buttons then, and what was within two seconds.
    expect(text).toContain('- Lives 2, ammo 14, score 513.');
    expect(text).toContain('- Holding: Right, Jump.');
    expect(text).toContain(
      '- Within two seconds: “pfff” at 0:01.5; A pod’s puff (Pod) at (15.2, 4.0), 0:02.0.',
    );
  });

  it('says so when there are no comments, and is the same each time', () => {
    const empty = emptyComments({ id: 'x', startedAt: '' });
    const a = notesMarkdown({ session: session(), comments: empty });
    expect(a).toContain('No comments yet.');
    expect(notesMarkdown({ session: session(), comments: empty })).toBe(a);
    expect(a.endsWith('\n')).toBe(true);
  });
});

const wasmPath = fileURLToPath(new URL('../wasm/sim.wasm', import.meta.url));

describe.skipIf(!existsSync(wasmPath))('verdictsFor, on the real recording', () => {
  let sim: Sim;
  let fixture: Session;
  const rects = (names: string[]): Record<string, SpriteRect> =>
    Object.fromEntries(
      names.map((name, i) => [name, { u: i / 512, v: 0, uw: 1 / 512, vh: 1 / 512, w: 16, h: 16 }]),
    );

  beforeAll(async () => {
    sim = await Sim.load(readFileSync(wasmPath));
    sim.setSprites(rects(sim.spriteNames()));
    const file = (name: string): Uint8Array =>
      new Uint8Array(readFileSync(new URL(`./fixtures/fudge-bog/${name}`, import.meta.url)));
    fixture = parseSession('fixture', [
      { name: 'session.ndjson', data: file('session.ndjson') },
      { name: 'specs.json', data: file('specs.json') },
    ]);
  });

  it('says whether each attempt matches the recording, and where one stops', () => {
    const verdicts = verdictsFor(sim, fixture);
    expect([...verdicts.keys()]).toEqual([0, 1, 2, 3, 4, 5]);
    // Fudge Bog may have been edited since the fixture was recorded; then these say where they stop.
    for (const v of verdicts.values()) {
      expect(v).toMatch(/^(matches the recording|stops matching at \d+:\d\d\.\d \(.+\))$/);
    }
    const doctored: Session = {
      ...fixture,
      events: fixture.events.map((e) =>
        e.e === 'pos' && e.t === 4121 ? { ...e, x: (e['x'] as number) + 3 } : e,
      ),
    };
    expect(verdictsFor(sim, doctored).get(0)).toMatch(/^stops matching at 0:01\.\d \(position\)$/);
  });

  it('puts the verdicts in the notes', () => {
    const verdicts = verdictsFor(sim, fixture);
    const text = notesMarkdown({
      session: fixture,
      comments: emptyComments({ id: fixture.id, startedAt: fixture.startedAt }),
      verdicts,
    });
    expect(text).toContain('| Replay |');
    expect(text.match(/\| (matches the recording|stops matching[^|]*) \|/g)).toHaveLength(6);
  });
});
