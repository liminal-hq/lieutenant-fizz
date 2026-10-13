// Reads a play sample's log into a session: its header, its specs and its events.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ZipEntry } from '../zip-read';
import type { SessionHeader } from './store';

/** One event of the log: when (the simulation tick and the milliseconds since the start), what kind, and its fields. */
export type SessionEvent = { t: number; ms: number; e: string } & Record<string, unknown>;

export interface Session {
  /** The file the session was read from. */
  name: string;
  id: string;
  startedAt: string;
  specs: Record<string, unknown>;
  events: SessionEvent[];
  /** Lines that were not events (a cut-short last line after a crash, for one). */
  skipped: number;
}

const decoder = new TextDecoder();

/** A number field of an event, or `fallback` when it is missing or not a number. */
export function num(e: SessionEvent, field: string, fallback = 0): number {
  const v = e[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * The events in lines of NDJSON. A line that is not an event (a cut-short last line after a crash, a line from a
 * newer format) is counted and skipped, so a damaged file still reads as far as it goes.
 */
export function parseEvents(lines: readonly string[]): { events: SessionEvent[]; skipped: number } {
  const events: SessionEvent[] = [];
  let skipped = 0;
  for (const line of lines) {
    if (!line) continue;
    try {
      const e = JSON.parse(line) as Partial<SessionEvent>;
      if (typeof e.e === 'string' && typeof e.t === 'number' && typeof e.ms === 'number') {
        events.push(e as SessionEvent);
      } else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { events, skipped };
}

/** Reads a session from the files of its zip. Throws a plain message when a file is missing or the version is not known. */
export function parseSession(name: string, files: readonly ZipEntry[]): Session {
  const log = files.find((f) => f.name === 'session.ndjson');
  const specsFile = files.find((f) => f.name === 'specs.json');
  if (!log || !specsFile)
    throw new Error(`${name} is not a play sample: it has no session.ndjson and specs.json`);

  const lines = decoder.decode(log.data).split('\n');
  let head: { v?: unknown; id?: unknown; startedAt?: unknown };
  try {
    head = JSON.parse(lines[0] ?? '') as typeof head;
  } catch {
    throw new Error(`${name} has no header line`);
  }
  if (head.v !== 1)
    throw new Error(
      `${name} was written by a version this reader does not know (v${String(head.v)})`,
    );

  let specs: Record<string, unknown>;
  try {
    specs = JSON.parse(decoder.decode(specsFile.data)) as Record<string, unknown>;
  } catch {
    throw new Error(`${name} has specs that cannot be read`);
  }

  const { events, skipped } = parseEvents(lines.slice(1));
  return {
    name,
    id: typeof head.id === 'string' ? head.id : name,
    startedAt: typeof head.startedAt === 'string' ? head.startedAt : '',
    specs,
    events,
    skipped,
  };
}

/** A session from what a `SampleStore` holds for it: the header and the chunks of events. */
export function sessionFromStore(
  name: string,
  read: { header: SessionHeader; chunks: readonly string[] },
): Session {
  const { events, skipped } = parseEvents(read.chunks.join('').split('\n'));
  return {
    name,
    id: read.header.id,
    startedAt: read.header.startedAt,
    specs: read.header.specs,
    events,
    skipped,
  };
}
