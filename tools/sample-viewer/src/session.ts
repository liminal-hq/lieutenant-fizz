// Reads a play sample's two files into a session: its header, its specs and its events.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ZipEntry } from './zip-read';

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
      `${name} was written by a version this viewer does not know (v${String(head.v)})`,
    );

  let specs: Record<string, unknown>;
  try {
    specs = JSON.parse(decoder.decode(specsFile.data)) as Record<string, unknown>;
  } catch {
    throw new Error(`${name} has specs that cannot be read`);
  }

  const events: SessionEvent[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
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
  return {
    name,
    id: typeof head.id === 'string' ? head.id : name,
    startedAt: typeof head.startedAt === 'string' ? head.startedAt : '',
    specs,
    events,
    skipped,
  };
}
