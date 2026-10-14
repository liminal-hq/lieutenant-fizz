// The real phone recording of Fudge Bog as a sample zip, for the browser specs that replay one.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { sessionZip } from '../packages/engine/src/session/export';

const FIXTURE = new URL('../episodes/episode-1/src/replay/fixtures/fudge-bog/', import.meta.url);

/** The recording as the zip the game would save, with its events or specs changed by `edit` first. */
export async function fixtureZip(
  edit: (events: Record<string, unknown>[], specs: Record<string, unknown>) => void = () => {},
): Promise<Buffer> {
  const lines = readFileSync(new URL('session.ndjson', FIXTURE), 'utf8').trim().split('\n');
  const header = JSON.parse(lines[0]!) as { id: string; startedAt: string };
  const events = lines.slice(1).map((l) => JSON.parse(l) as Record<string, unknown>);
  const specs = JSON.parse(readFileSync(new URL('specs.json', FIXTURE), 'utf8')) as Record<
    string,
    unknown
  >;
  edit(events, specs);
  const zip = await sessionZip({
    header: { v: 1, id: header.id, startedAt: header.startedAt, specs },
    chunks: [events.map((e) => JSON.stringify(e)).join('\n') + '\n'],
  });
  return Buffer.from(zip);
}
