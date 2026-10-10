// Tests the release version checks: reading each manifest and comparing it with the tag.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  checkNoExplicitVersionCode,
  checkReleaseVersions,
  readCargoVersion,
  readJsonVersion,
  versionOfTag,
} from './release-version';

const same = { tauriConf: '0.1.0', cargo: '0.1.0', packageJson: '0.1.0' };

describe('readCargoVersion', () => {
  it('reads the [package] version, not a dependency version before or after it', () => {
    const toml = [
      '[build-dependencies]',
      'tauri-build = { version = "2" }',
      'version = "9.9.9"',
      '',
      '[package]',
      'name = "x"',
      'version = "0.1.0" # the app',
      '',
      '[dependencies]',
      'version = "7.7.7"',
    ].join('\n');
    expect(readCargoVersion(toml, 'Cargo.toml')).toBe('0.1.0');
  });

  it('throws when [package] has no version', () => {
    expect(() => readCargoVersion('[package]\nname = "x"\n', 'Cargo.toml')).toThrow(/no version/);
  });
});

describe('readJsonVersion', () => {
  it('reads the version', () => expect(readJsonVersion('{"version":"1.2.3"}', 'a')).toBe('1.2.3'));
  it('throws when it is missing', () =>
    expect(() => readJsonVersion('{}', 'a.json')).toThrow(/a.json has no "version"/));
});

describe('versionOfTag', () => {
  it('strips the v', () => {
    expect(versionOfTag('v0.1.0')).toBe('0.1.0');
    expect(versionOfTag('v1.2.3-beta.1')).toBe('1.2.3-beta.1');
  });
  it.each(['0.1.0', 'v0.1', 'android-debug-3-1', 'v1.2.3 '])('rejects %s', (tag) =>
    expect(() => versionOfTag(tag)).toThrow(/not a release tag/),
  );
});

describe('checkReleaseVersions', () => {
  it('returns the shared version, with or without a matching tag', () => {
    expect(checkReleaseVersions(same)).toBe('0.1.0');
    expect(checkReleaseVersions(same, 'v0.1.0')).toBe('0.1.0');
  });

  it('names the file that is out of step', () => {
    expect(() => checkReleaseVersions({ ...same, cargo: '0.1.1' })).toThrow(
      /not in step[\s\S]*Cargo\.toml: 0\.1\.1/,
    );
  });

  it('fails a tag that does not match, naming each file that differs', () => {
    expect(() => checkReleaseVersions(same, 'v0.2.0')).toThrow(
      /tag v0\.2\.0 needs version 0\.2\.0[\s\S]*tauri\.conf\.json is 0\.1\.0[\s\S]*package\.json is 0\.1\.0/,
    );
  });

  it('fails a tag that is not a version tag', () => {
    expect(() => checkReleaseVersions(same, 'android-debug-1-1')).toThrow(/not a release tag/);
  });
});

describe('checkNoExplicitVersionCode', () => {
  it('accepts a config that leaves the versionCode to Tauri', () => {
    const conf = JSON.stringify({ version: '0.1.0', bundle: { android: { minSdkVersion: 26 } } });
    expect(() => checkNoExplicitVersionCode(conf, 'tauri.conf.json')).not.toThrow();
    expect(() =>
      checkNoExplicitVersionCode('{"version":"0.1.0"}', 'tauri.conf.json'),
    ).not.toThrow();
  });

  it('rejects an explicit bundle.android.versionCode', () => {
    const conf = JSON.stringify({ bundle: { android: { versionCode: 7 } } });
    expect(() => checkNoExplicitVersionCode(conf, 'tauri.conf.json')).toThrow(
      /tauri\.conf\.json sets bundle\.android\.versionCode/,
    );
  });
});
