// Builds sessions from event objects for tests, through the same reader a zip goes through.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { parseSession, type Session } from '@lieutenant-fizz/engine/session/log';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

/** A session from event objects (each given `ms` if it has none), as the viewer would read it from a zip. */
export function sessionOf(
  name: string,
  events: object[],
  specs: object = { host: 'web' },
): Session {
  const lines = events.map((e, i) => JSON.stringify({ ms: i * 10, ...e }));
  return parseSession(name, [
    {
      name: 'session.ndjson',
      data: text(
        `${JSON.stringify({ v: 1, id: name, startedAt: '2026-10-13T14:02:00-04:00' })}\n${lines.join('\n')}\n`,
      ),
    },
    { name: 'specs.json', data: text(JSON.stringify(specs)) },
  ]);
}
