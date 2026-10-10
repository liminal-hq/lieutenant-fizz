// Checks that the player app's three manifest versions agree, and that a release tag names that version.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Usage: bun scripts/check-release-version.ts [--tag vX.Y.Z]
//   --tag  also require the tag to be `v` plus the shared version (used by the release workflow)
//
// Prints the shared version on success and exits 1 with a message naming the file that disagrees, so
// `bun scripts/check-release-version.ts` doubles as a dry run before tagging. The checks are in
// release-version.ts.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkReleaseVersions, readCargoVersion, readJsonVersion } from './release-version';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');

const args = process.argv.slice(2);
let tag: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tag') {
    tag = args[++i];
    if (!tag) {
      console.error('error: --tag needs a value');
      process.exit(2);
    }
  } else {
    console.error(`error: unknown argument ${args[i]}`);
    process.exit(2);
  }
}

try {
  const version = checkReleaseVersions(
    {
      tauriConf: readJsonVersion(read('apps/player/src-tauri/tauri.conf.json'), 'tauri.conf.json'),
      cargo: readCargoVersion(read('apps/player/src-tauri/Cargo.toml'), 'Cargo.toml'),
      packageJson: readJsonVersion(read('apps/player/package.json'), 'package.json'),
    },
    tag,
  );
  console.log(version);
} catch (error) {
  console.error(`error: ${(error as Error).message}`);
  process.exit(1);
}
