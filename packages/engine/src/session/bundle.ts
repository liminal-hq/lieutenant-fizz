// Puts a sample's own files and the files added to it (comments, notes) into one zip.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { buildZip, type ZipFile } from '../zip';
import type { ZipEntry } from '../zip-read';

/** The name of the plain-text notes added to an export. */
export const NOTES_FILE = 'notes.md';

/** The name of the zip a sample is exported to with its comments: `fizz-<id>-notes.zip`. */
export const notesZipName = (id: string): string => `fizz-${id}-notes.zip`;

/**
 * The zip of a sample with files added. Every file it came with is kept byte for byte, except one the added files
 * have the name of, which is replaced (so a second export replaces the first one's comments and notes).
 */
export function bundleZip(
  entries: readonly ZipEntry[],
  added: readonly ZipFile[],
  when: Date,
): Promise<Uint8Array> {
  const names = new Set(added.map((f) => f.name));
  const kept = entries.filter((e) => !names.has(e.name));
  return buildZip([...kept, ...added], when);
}
