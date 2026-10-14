// Tests for the session specs: browser and system parsing, and that nothing identifying is carried.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { parseBrowser, parseOs, readSpecs, specsEnvOf } from './specs';

const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro Build/AP4A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.40 Mobile Safari/537.36';
const CHROME_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const FIREFOX_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0';
const EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

describe('parseBrowser', () => {
  it('names the browser and its major version', () => {
    expect(parseBrowser(ANDROID_WEBVIEW)).toEqual({ name: 'WebView', version: '141' });
    expect(parseBrowser(CHROME_LINUX)).toEqual({ name: 'Chrome', version: '141' });
    expect(parseBrowser(FIREFOX_WIN)).toEqual({ name: 'Firefox', version: '143' });
    expect(parseBrowser(EDGE)).toEqual({ name: 'Edge', version: '141' });
    expect(parseBrowser(SAFARI_MAC)).toEqual({ name: 'Safari', version: '18' });
    expect(parseBrowser(SAFARI_IOS)).toEqual({ name: 'Safari', version: '18' });
    expect(parseBrowser('')).toEqual({ name: 'unknown', version: '' });
  });
});

describe('parseOs', () => {
  it('names the system and its version', () => {
    expect(parseOs(ANDROID_WEBVIEW)).toEqual({ name: 'Android', version: '15' });
    expect(parseOs(CHROME_LINUX)).toEqual({ name: 'Linux', version: '' });
    expect(parseOs(FIREFOX_WIN)).toEqual({ name: 'Windows', version: '10.0' });
    expect(parseOs(SAFARI_MAC)).toEqual({ name: 'macOS', version: '10' });
    expect(parseOs(SAFARI_IOS)).toEqual({ name: 'iOS', version: '18' });
    expect(parseOs('')).toEqual({ name: 'unknown', version: '' });
  });
});

describe('readSpecs', () => {
  it('reports the screen, the window, the browser and the system, then the game’s own', () => {
    const specs = readSpecs(
      {
        host: 'tauri-android',
        screen: { width: 2400, height: 1080 },
        devicePixelRatio: 2.625,
        innerWidth: 844,
        innerHeight: 390,
        userAgent: ANDROID_WEBVIEW,
        maxTouchPoints: 5,
      },
      { game: '0.2.0', size: 'M', input: ['touch'] },
    );
    expect(specs).toEqual({
      host: 'tauri-android',
      screen: [2400, 1080],
      dpr: 2.625,
      window: [844, 390],
      browser: 'WebView',
      browserVersion: '141',
      os: 'Android',
      osVersion: '15',
      mobile: true,
      touchPoints: 5,
      game: '0.2.0',
      size: 'M',
      input: ['touch'],
    });
  });

  it('copes with a page that reports nothing', () => {
    const specs = readSpecs({ host: 'web' }, {});
    expect(specs).toMatchObject({
      screen: null,
      window: null,
      dpr: null,
      browser: 'unknown',
      os: 'unknown',
    });
  });

  it('prefers the platform the browser reports', () => {
    const specs = readSpecs(
      { host: 'web', userAgent: CHROME_LINUX, userAgentData: { platform: 'Linux', mobile: false } },
      {},
    );
    expect(specs).toMatchObject({ os: 'Linux', mobile: false });
  });

  it('never carries the user agent string, a language or an id', () => {
    const specs = JSON.stringify(readSpecs({ host: 'web', userAgent: ANDROID_WEBVIEW }, {}));
    expect(specs).not.toContain('Pixel');
    expect(specs).not.toContain('Mozilla');
    expect(specs).not.toMatch(/language|locale|deviceId|serial|uuid/i);
  });
});

describe('specsEnvOf', () => {
  it('reads the window and navigator it is given, ignoring what they lack', () => {
    const env = specsEnvOf(
      'web',
      {
        screen: { width: 1920, height: 1080 } as Screen,
        devicePixelRatio: 2,
        innerWidth: 1200,
        innerHeight: 700,
      },
      { userAgent: CHROME_LINUX, maxTouchPoints: 0 },
    );
    expect(env).toEqual({
      host: 'web',
      screen: { width: 1920, height: 1080 },
      devicePixelRatio: 2,
      innerWidth: 1200,
      innerHeight: 700,
      userAgent: CHROME_LINUX,
      maxTouchPoints: 0,
    });
    expect(specsEnvOf('web', {}, {})).toEqual({ host: 'web' });
  });
});
