// Reads the player app's version from its three manifests and checks it against a release tag.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// The pure half of scripts/check-release-version.ts: no file or process access, so the tests can feed it
// text. The app's version lives in three places that must move together, and the release tag is `v` plus it.

export type ManifestVersions = {
  /** `version` in apps/player/src-tauri/tauri.conf.json (the version the bundles carry). */
  tauriConf: string;
  /** `version` under `[package]` in apps/player/src-tauri/Cargo.toml. */
  cargo: string;
  /** `version` in apps/player/package.json. */
  packageJson: string;
};

/** vX.Y.Z, with an optional pre-release suffix such as -beta.1 (the org's release tag shape). */
const TAG = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export function readJsonVersion(text: string, label: string): string {
  const version = (JSON.parse(text) as { version?: unknown }).version;
  if (typeof version !== 'string' || version === '') throw new Error(`${label} has no "version"`);
  return version;
}

/** The `version` key of the `[package]` table; a `version` in `[dependencies]` or elsewhere is ignored. */
export function readCargoVersion(text: string, label: string): string {
  let inPackage = false;
  for (const line of text.split(/\r?\n/)) {
    const table = /^\s*\[([^\]]*)\]\s*(?:#.*)?$/.exec(line);
    if (table) {
      inPackage = table[1]?.trim() === 'package';
      continue;
    }
    const version = inPackage ? /^\s*version\s*=\s*"([^"]+)"/.exec(line) : null;
    if (version) return version[1] as string;
  }
  throw new Error(`${label} has no version under [package]`);
}

/** The version a tag stands for, or an error when the tag is not `vX.Y.Z`. */
export function versionOfTag(tag: string): string {
  const match = TAG.exec(tag);
  if (!match) throw new Error(`"${tag}" is not a release tag: expected vX.Y.Z or vX.Y.Z-beta.N`);
  return match[1] as string;
}

/**
 * Returns the one version the three manifests share (and, when a tag is given, that the tag names).
 * Throws an Error whose message says which file disagrees.
 */
export function checkReleaseVersions(versions: ManifestVersions, tag?: string): string {
  const rows: [string, string][] = [
    ['apps/player/src-tauri/tauri.conf.json', versions.tauriConf],
    ['apps/player/src-tauri/Cargo.toml', versions.cargo],
    ['apps/player/package.json', versions.packageJson],
  ];
  const problems: string[] = [];
  if (new Set(rows.map(([, v]) => v)).size > 1) {
    problems.push(
      'The app versions are not in step:',
      ...rows.map(([file, v]) => `  ${file}: ${v}`),
    );
  }
  if (tag !== undefined) {
    const wanted = versionOfTag(tag);
    const off = rows.filter(([, v]) => v !== wanted);
    if (off.length > 0) {
      problems.push(
        `The release tag ${tag} needs version ${wanted}, but:`,
        ...off.map(([file, v]) => `  ${file} is ${v}`),
      );
    }
  }
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return versions.tauriConf;
}
