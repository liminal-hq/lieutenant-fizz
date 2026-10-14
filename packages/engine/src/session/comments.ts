// Comments on a play sample: notes anchored to a moment of a replay, kept in a file beside the sample's own two.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The file the comments are kept in, inside the zip. */
export const COMMENTS_FILE = 'comments.json';

/** One note on a moment of a replay. */
export interface Comment {
  id: string;
  /** The recorded tick it is about: the same clock as the log's `t`. */
  tick: number;
  /** The level it is about (the level id), when it is about one. */
  level?: number;
  /** The attempt it is about, by its place among the session's attempts, from 0. */
  attempt?: number;
  /** A place in the level, in tiles (y up), when the note points at one. */
  at?: { x: number; y: number };
  text: string;
  /** Who wrote it, as they gave it. */
  author?: string;
  /** When it was written, as ISO text. */
  created: string;
  edited?: string;
  tags?: string[];
  /** Fields a newer version wrote that this one does not know, kept as they were. */
  extra?: Record<string, unknown>;
}

/** The comments of one session. */
export interface CommentsFile {
  v: 1;
  /** The session they are about, as the log's header names it. */
  session: { id: string; startedAt: string };
  comments: Comment[];
  extra?: Record<string, unknown>;
}

const KNOWN_COMMENT = new Set([
  'id',
  'tick',
  'level',
  'attempt',
  'at',
  'text',
  'author',
  'created',
  'edited',
  'tags',
]);
const KNOWN_FILE = new Set(['v', 'session', 'comments']);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function rest(o: Record<string, unknown>, known: Set<string>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!known.has(k)) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

/** A comment from one entry of the file, or null when it is not one (no id, tick or text). */
function readComment(value: unknown): Comment | null {
  if (!isObject(value)) return null;
  const { id, tick, text } = value;
  if (typeof id !== 'string' || !id || !finite(tick) || typeof text !== 'string') return null;
  const c: Comment = {
    id,
    tick,
    text,
    created: typeof value['created'] === 'string' ? value['created'] : '',
  };
  if (finite(value['level'])) c.level = value['level'];
  if (finite(value['attempt'])) c.attempt = value['attempt'];
  const at = value['at'];
  if (isObject(at) && finite(at['x']) && finite(at['y'])) c.at = { x: at['x'], y: at['y'] };
  if (typeof value['author'] === 'string' && value['author']) c.author = value['author'];
  if (typeof value['edited'] === 'string') c.edited = value['edited'];
  if (Array.isArray(value['tags'])) {
    const tags = value['tags'].filter((t): t is string => typeof t === 'string');
    if (tags.length) c.tags = tags;
  }
  const extra = rest(value, KNOWN_COMMENT);
  if (extra) c.extra = extra;
  return c;
}

/** Comments in the order they are shown: by tick, then by when they were written. */
const byTick = (a: Comment, b: Comment): number =>
  a.tick - b.tick || a.created.localeCompare(b.created) || a.id.localeCompare(b.id);

/** An empty set of comments for a session. */
export function emptyComments(session: { id: string; startedAt: string }): CommentsFile {
  return { v: 1, session: { id: session.id, startedAt: session.startedAt }, comments: [] };
}

/**
 * The comments in a file's text, or null when it is not a comments file of a version this knows. An entry that is
 * not a comment is dropped (and counted), and fields this does not know are kept so they survive being saved again.
 */
export function parseComments(text: string): { file: CommentsFile; dropped: number } | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(value) || value['v'] !== 1 || !isObject(value['session'])) return null;
  const session = value['session'];
  const list = Array.isArray(value['comments']) ? (value['comments'] as unknown[]) : [];
  const comments = list.map(readComment);
  const file: CommentsFile = {
    v: 1,
    session: {
      id: typeof session['id'] === 'string' ? session['id'] : '',
      startedAt: typeof session['startedAt'] === 'string' ? session['startedAt'] : '',
    },
    comments: comments.filter((c): c is Comment => c !== null).sort(byTick),
  };
  const extra = rest(value, KNOWN_FILE);
  if (extra) file.extra = extra;
  return { file, dropped: comments.filter((c) => c === null).length };
}

/** The file's text: indented so a person can read it, keys in a fixed order, unknown fields kept. */
export function serialiseComments(file: CommentsFile): string {
  const out = {
    ...file.extra,
    v: 1,
    session: file.session,
    comments: [...file.comments].sort(byTick).map((c) => ({
      id: c.id,
      tick: c.tick,
      ...(c.level !== undefined ? { level: c.level } : {}),
      ...(c.attempt !== undefined ? { attempt: c.attempt } : {}),
      ...(c.at ? { at: c.at } : {}),
      text: c.text,
      ...(c.author ? { author: c.author } : {}),
      created: c.created,
      ...(c.edited ? { edited: c.edited } : {}),
      ...(c.tags?.length ? { tags: c.tags } : {}),
      ...c.extra,
    })),
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** What a new comment is made from. */
export type NewComment = Pick<Comment, 'tick' | 'text'> &
  Partial<Pick<Comment, 'level' | 'attempt' | 'at' | 'author' | 'tags'>>;

/** The file with a comment added. `id` makes the comment's id, and `now` is when it is written. */
export function addComment(
  file: CommentsFile,
  input: NewComment,
  now: Date,
  id: () => string,
): CommentsFile {
  const taken = new Set(file.comments.map((c) => c.id));
  let made = id();
  while (taken.has(made)) made = id();
  const c: Comment = { id: made, tick: input.tick, text: input.text, created: now.toISOString() };
  if (input.level !== undefined) c.level = input.level;
  if (input.attempt !== undefined) c.attempt = input.attempt;
  if (input.at) c.at = { x: input.at.x, y: input.at.y };
  if (input.author) c.author = input.author;
  if (input.tags?.length) c.tags = [...input.tags];
  return { ...file, comments: [...file.comments, c].sort(byTick) };
}

/** The file with a comment's words, place or tags changed, and when. Anything else about it is left alone. */
export function editComment(
  file: CommentsFile,
  id: string,
  patch: Partial<Pick<Comment, 'text' | 'at' | 'tick' | 'tags'>>,
  now: Date,
): CommentsFile {
  return {
    ...file,
    comments: file.comments
      .map((c) => (c.id === id ? { ...c, ...patch, edited: now.toISOString() } : c))
      .sort(byTick),
  };
}

/** The file without a comment. */
export function removeComment(file: CommentsFile, id: string): CommentsFile {
  return { ...file, comments: file.comments.filter((c) => c.id !== id) };
}

/** Whether two sets of comments are the same notes (used to know whether there is anything new to save). */
export function sameComments(a: CommentsFile, b: CommentsFile): boolean {
  return serialiseComments(a) === serialiseComments(b);
}
