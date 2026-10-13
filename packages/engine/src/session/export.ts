// Turns a stored play session into the files of a zip, and says what is in it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { buildZip, type ZipFile } from '../zip';
import type { SessionHeader } from './store';

/** A session as the store gives it back. */
export interface StoredSession {
  header: SessionHeader;
  chunks: string[];
}

const encoder = new TextEncoder();

/** The name of the zip for a session: `<prefix>-session-<id>.zip`. */
export const exportName = (prefix: string, id: string): string => `${prefix}-session-${id}.zip`;

/** The local date and time a session started, read from its ISO text without moving it to another zone. */
export function startedDate(startedAt: string): Date {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/.exec(startedAt);
  if (!m) return new Date(1980, 0, 1);
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
}

/**
 * The two files of a session's zip. `session.ndjson` is a header line (the format version, the id and the
 * start time) and then every event, one per line, exactly as recorded. `specs.json` is the device and game
 * specs, indented so a person can read it before sending it.
 */
export function sessionFiles(session: StoredSession): ZipFile[] {
  const { header } = session;
  const head = JSON.stringify({ v: header.v, id: header.id, startedAt: header.startedAt });
  return [
    { name: 'session.ndjson', data: encoder.encode(`${head}\n${session.chunks.join('')}`) },
    { name: 'specs.json', data: encoder.encode(`${JSON.stringify(header.specs, null, 2)}\n`) },
  ];
}

/** The zip of a session, stamped with the time it started. */
export function sessionZip(session: StoredSession): Promise<Uint8Array> {
  return buildZip(sessionFiles(session), startedDate(session.header.startedAt));
}

/** How many events of each kind a session holds, and the total. */
export interface EventCounts {
  total: number;
  kinds: Record<string, number>;
}

/** Counts the events in a session by kind, from the text as stored. A line that is not an event is not counted. */
export function countEvents(chunks: readonly string[]): EventCounts {
  const kinds: Record<string, number> = {};
  let total = 0;
  for (const chunk of chunks) {
    for (const line of chunk.split('\n')) {
      if (!line) continue;
      let kind: unknown;
      try {
        kind = (JSON.parse(line) as { e?: unknown }).e;
      } catch {
        continue;
      }
      if (typeof kind !== 'string') continue;
      kinds[kind] = (kinds[kind] ?? 0) + 1;
      total += 1;
    }
  }
  return { total, kinds };
}
