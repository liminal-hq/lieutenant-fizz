// Writes the plain-text notes of a play sample with its comments, for a person or an AI agent to read in one go.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Comment, CommentsFile } from '@lieutenant-fizz/engine/session/comments';
import { num, type Session, type SessionEvent } from '@lieutenant-fizz/engine/session/log';
import { specsText } from '../sample-options';
import { attemptsOf, type Attempt } from './attempts';
import { causeText } from './names';
import { clockText, inputText, TICKS_PER_SECOND } from './navigation';

/** What the notes are made from. */
export interface NotesInput {
  session: Session;
  comments: CommentsFile;
  /** For each attempt, by its place in the session, whether the replay matches the recording (worked out by running it). */
  verdicts?: ReadonlyMap<number, string>;
}

/** How far either side of a comment's moment the events listed with it reach: two seconds. */
export const CONTEXT_TICKS = 2 * TICKS_PER_SECOND;

const tile = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);
const place = (x: number, y: number): string => `(${tile(x)}, ${tile(y)})`;

/** The attempt a comment is about: the one it names, else the one whose ticks hold it. */
function attemptOf(attempts: readonly Attempt[], c: Comment): Attempt | null {
  if (c.attempt !== undefined) return attempts.find((a) => a.order === c.attempt) ?? null;
  return attempts.find((a) => c.tick >= a.startTick && c.tick <= a.endTick) ?? null;
}

/** What was happening at a tick of an attempt: the counts, the buttons held, and the events close by. */
function contextOf(events: readonly SessionEvent[], a: Attempt, tick: number): string[] {
  let st: SessionEvent | null = null;
  let held = 0;
  const nearby: string[] = [];
  for (const e of events) {
    if (e.t > tick + CONTEXT_TICKS) break;
    if (e.t < a.startTick) continue;
    if (e.e === 'st' && e.t <= tick) st = e;
    else if (e.e === 'in' && e.t <= tick) held = num(e, 'b');
    if (e.t < tick - CONTEXT_TICKS) continue;
    const when = clockText(e.t - a.startTick);
    if (e.e === 'death') {
      nearby.push(
        `${causeText(num(e, 'cause'), num(e, 'detail'))} at ${place(num(e, 'x'), num(e, 'y'))}, ${when}`,
      );
    } else if (e.e === 'ev' && e['k'] === 'caption' && typeof e['n'] === 'string') {
      nearby.push(`“${e['n']}” at ${when}`);
    } else if (e.e === 'ev' && (e['k'] === 'level_complete' || e['k'] === 'died')) {
      nearby.push(`${String(e['k']).replace('_', ' ')} at ${when}`);
    }
  }
  const lines: string[] = [];
  if (st) {
    lines.push(`Lives ${num(st, 'lives')}, ammo ${num(st, 'ammo')}, score ${num(st, 'score')}.`);
  }
  lines.push(held ? `Holding: ${inputText(held)}.` : 'Holding no button.');
  if (nearby.length) lines.push(`Within two seconds: ${nearby.join('; ')}.`);
  return lines;
}

/** One line of the attempts table. */
function row(a: Attempt, verdict: string): string {
  const lost = a.death ? causeText(a.death.cause, a.death.detail) : '';
  const where = a.death ? place(a.death.x, a.death.y) : '';
  return `| ${a.order + 1} | ${a.level} | ${a.attempt} | ${a.outcome} | ${clockText(a.ticks)} | ${lost} | ${where} | ${verdict} |`;
}

/** The tiles where lives were lost, most first: where, how many, and what from. */
function spotLines(attempts: readonly Attempt[]): string[] {
  const spots = new Map<string, { level: string; x: number; y: number; causes: string[] }>();
  for (const a of attempts) {
    if (!a.death) continue;
    const x = Math.floor(a.death.x);
    const y = Math.floor(a.death.y);
    const key = `${a.levelId}:${x}:${y}`;
    const s = spots.get(key) ?? { level: a.level, x, y, causes: [] };
    s.causes.push(causeText(a.death.cause, a.death.detail));
    spots.set(key, s);
  }
  return [...spots.values()]
    .sort((p, q) => q.causes.length - p.causes.length || p.level.localeCompare(q.level))
    .map(
      (s) =>
        `- ${s.level}, tile ${s.x}, ${s.y}: ${s.causes.length} (${[...new Set(s.causes)].join(', ')})`,
    );
}

/** The comment's moment in words: "Fudge Bog, try 3, 0:12.4". */
function momentOf(a: Attempt | null, c: Comment): string {
  if (!a) return `tick ${c.tick}`;
  return `${a.level}, try ${a.attempt}, ${clockText(c.tick - a.startTick)}`;
}

const quote = (text: string): string =>
  text
    .trimEnd()
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');

/**
 * The notes: what the files in the zip are and how to read them, the session and the device, every attempt,
 * where lives were lost, and each comment in tick order with what was happening at that moment. It is the same
 * for the same input, so it can be compared and kept.
 */
export function notesMarkdown(i: NotesInput): string {
  const { session, comments } = i;
  const attempts = attemptsOf(session);
  const specs = session.specs;
  const out: string[] = [];

  out.push(`# Play sample notes: ${session.id}`, '');
  out.push(
    'This zip holds a recording of one play session of Lieutenant Fizz and the notes written on it.',
    '',
    '- `session.ndjson`: every key, button and touch, the player’s path and the game’s events, one JSON event per line, each with `t` (the game’s tick, 60 to the second) and `ms` (wall milliseconds since the start).',
    '- `specs.json`: the device and the game’s settings.',
    '- `comments.json`: the notes below, by tick, so a tool can read them.',
    '- `notes.md`: this file.',
    '',
    'Positions are in tiles: x goes right and y goes up from the bottom of the level. A time like 0:12.4 is measured from the start of the attempt it is in. The replay in the sample viewer re-runs the real game on the recorded presses, so a moment can be watched by its tick.',
    '',
  );

  out.push('## The session', '');
  out.push(`- Started: ${session.startedAt || 'unknown'}`);
  const device = specsText(specs);
  if (device) out.push(`- Device: ${device}`);
  const game = typeof specs['game'] === 'string' ? specs['game'] : '';
  const rec = typeof specs['rec'] === 'number' ? ` (recording revision ${specs['rec']})` : '';
  const sim = typeof specs['sim'] === 'string' ? `, simulation build ${specs['sim']}` : '';
  if (game) out.push(`- Game: ${game}${rec}${sim}`);
  const setting = ['size', 'leftHanded', 'input', 'touchMode']
    .filter((k) => specs[k] !== undefined)
    .map((k) => `${k} ${JSON.stringify(specs[k])}`);
  if (setting.length) out.push(`- Settings: ${setting.join(', ')}`);
  const levels = new Set(attempts.map((a) => a.levelId)).size;
  out.push(`- ${attempts.length} attempts at ${levels} ${levels === 1 ? 'level' : 'levels'}`, '');

  if (attempts.length) {
    out.push('## Attempts', '');
    out.push('| # | Level | Try | Ended | Time | Lost to | Where | Replay |');
    out.push('|---|---|---|---|---|---|---|---|');
    for (const a of attempts) out.push(row(a, i.verdicts?.get(a.order) ?? ''));
    out.push('');
    const spots = spotLines(attempts);
    if (spots.length) out.push('## Where lives were lost', '', ...spots, '');
  }

  out.push('## Comments', '');
  if (!comments.comments.length) out.push('No comments yet.', '');
  const sorted = [...comments.comments].sort((a, b) => a.tick - b.tick);
  sorted.forEach((c, n) => {
    const a = attemptOf(attempts, c);
    out.push(
      `### ${n + 1}. ${momentOf(a, c)} (tick ${c.tick})${c.at ? ` at ${place(c.at.x, c.at.y)}` : ''}`,
      '',
    );
    out.push(quote(c.text), '');
    const by = [c.author, c.created.slice(0, 10)].filter(Boolean).join(', ');
    if (by) out.push(`By ${by}.`, '');
    if (a) out.push(...contextOf(session.events, a, c.tick).map((l) => `- ${l}`), '');
  });
  return `${out.join('\n').trimEnd()}\n`;
}
