// Tests for comments on a play sample: the file's shape, adding, editing, removing and what an unknown field does.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  addComment,
  editComment,
  emptyComments,
  parseComments,
  removeComment,
  sameComments,
  serialiseComments,
} from './comments';

const session = { id: 'c89653a1', startedAt: '2026-10-13T16:18:07-04:00' };
const at = new Date('2026-10-14T09:00:00Z');
let n = 0;
const nextId = (): string => `c-${(n += 1)}`;

describe('adding, editing and removing', () => {
  it('adds a comment, in tick order, with who and when', () => {
    n = 0;
    let file = emptyComments(session);
    file = addComment(
      file,
      { tick: 4600, text: 'the gap reads as jumpable', author: 'Scott' },
      at,
      nextId,
    );
    file = addComment(
      file,
      { tick: 4400, text: 'first pod', level: 7, attempt: 0, at: { x: 15.2, y: 4 } },
      at,
      nextId,
    );
    expect(file.comments.map((c) => [c.id, c.tick])).toEqual([
      ['c-2', 4400],
      ['c-1', 4600],
    ]);
    expect(file.comments[0]).toMatchObject({ level: 7, attempt: 0, at: { x: 15.2, y: 4 } });
    expect(file.comments[1]).toMatchObject({ author: 'Scott', created: at.toISOString() });
  });

  it('never gives two comments the same id', () => {
    const ids = ['a', 'a', 'b'];
    let file = emptyComments(session);
    file = addComment(file, { tick: 1, text: 'x' }, at, () => ids.shift()!);
    file = addComment(file, { tick: 2, text: 'y' }, at, () => ids.shift()!);
    expect(file.comments.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('edits the words, place or tick, marks when, and leaves the rest', () => {
    n = 0;
    let file = addComment(
      emptyComments(session),
      { tick: 10, text: 'old', author: 'Scott' },
      at,
      nextId,
    );
    const later = new Date('2026-10-14T10:00:00Z');
    file = editComment(file, 'c-1', { text: 'new', at: { x: 1, y: 2 } }, later);
    expect(file.comments[0]).toMatchObject({
      text: 'new',
      at: { x: 1, y: 2 },
      author: 'Scott',
      created: at.toISOString(),
      edited: later.toISOString(),
    });
  });

  it('removes one and leaves the others, and compares two files by their notes', () => {
    n = 0;
    let file = addComment(emptyComments(session), { tick: 1, text: 'a' }, at, nextId);
    file = addComment(file, { tick: 2, text: 'b' }, at, nextId);
    const fewer = removeComment(file, 'c-1');
    expect(fewer.comments.map((c) => c.text)).toEqual(['b']);
    expect(sameComments(file, fewer)).toBe(false);
    expect(sameComments(file, { ...file, comments: [...file.comments] })).toBe(true);
  });
});

describe('the file', () => {
  it('is read back as it was written', () => {
    n = 0;
    let file = addComment(
      emptyComments(session),
      {
        tick: 4600,
        text: 'a line\nand another',
        level: 7,
        attempt: 2,
        at: { x: 41.2, y: 9 },
        author: 'Scott',
        tags: ['jump'],
      },
      at,
      nextId,
    );
    file = editComment(file, 'c-1', { text: 'a line\nand more' }, at);
    const text = serialiseComments(file);
    const back = parseComments(text)!;
    expect(back.dropped).toBe(0);
    expect(back.file).toEqual(file);
    expect(serialiseComments(back.file)).toBe(text);
  });

  it('keeps fields it does not know, in a comment and in the file', () => {
    const text = JSON.stringify({
      v: 1,
      session,
      reviewer: 'agent',
      comments: [{ id: 'x', tick: 5, text: 'hi', created: '', severity: 'high' }],
    });
    const { file } = parseComments(text)!;
    expect(file.extra).toEqual({ reviewer: 'agent' });
    expect(file.comments[0]!.extra).toEqual({ severity: 'high' });
    const again = JSON.parse(serialiseComments(file));
    expect(again.reviewer).toBe('agent');
    expect(again.comments[0].severity).toBe('high');
  });

  it('drops an entry that is not a comment, counts it, and sorts the rest by tick', () => {
    const text = JSON.stringify({
      v: 1,
      session,
      comments: [
        { id: 'b', tick: 20, text: 'later', created: '2026-10-14T00:00:00Z' },
        { id: '', tick: 1, text: 'no id' },
        { id: 'c', tick: 'soon', text: 'no tick' },
        { id: 'd', tick: 3 },
        'nope',
        { id: 'a', tick: 10, text: 'sooner', at: { x: 'left', y: 1 }, tags: ['x', 4] },
      ],
    });
    const { file, dropped } = parseComments(text)!;
    expect(dropped).toBe(4);
    expect(file.comments.map((c) => c.id)).toEqual(['a', 'b']);
    expect(file.comments[0]!.at).toBeUndefined();
    expect(file.comments[0]!.tags).toEqual(['x']);
  });

  it('refuses what is not a comments file, or is from a version it does not know', () => {
    expect(parseComments('nope')).toBeNull();
    expect(parseComments('[]')).toBeNull();
    expect(parseComments(JSON.stringify({ v: 2, session, comments: [] }))).toBeNull();
    expect(parseComments(JSON.stringify({ v: 1, comments: [] }))).toBeNull();
  });
});
