// Reads a play sample's NDJSON log into typed events for the replayer.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** One line of the log: the sim tick, wall milliseconds, the kind, and the kind's own fields. */
export interface LogEvent {
  t: number;
  ms: number;
  e: string;
  [field: string]: unknown;
}

/**
 * The events in a log's text, in file order. The header line and any line that is not an event (a cut-off last
 * line after a crash, a line from a newer format) are skipped, so a damaged file still reads as far as it goes.
 */
export function parseLog(text: string): LogEvent[] {
  const events: LogEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof value !== 'object' || value === null) continue;
    const o = value as Record<string, unknown>;
    if (typeof o['e'] === 'string' && typeof o['t'] === 'number' && typeof o['ms'] === 'number') {
      events.push(o as LogEvent);
    }
  }
  return events;
}

/** A number field of an event, or `fallback` when it is missing or not a number. */
export function num(e: LogEvent, field: string, fallback = 0): number {
  const v = e[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
