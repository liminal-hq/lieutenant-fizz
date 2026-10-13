// What a session needs to be recreated: the screen, the browser and the system, read without anything that identifies a person.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { HostKind } from '../host';

/** What is read from the page. Every field may be missing (a worker, a test, an old browser). */
export interface SpecsEnv {
  host: HostKind;
  screen?: { width: number; height: number };
  devicePixelRatio?: number;
  innerWidth?: number;
  innerHeight?: number;
  userAgent?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string; mobile?: boolean };
}

export interface Named {
  name: string;
  version: string;
}

/** The browser or web view in a user agent string, newest rule first (Edge and Opera also say Chrome). */
export function parseBrowser(ua: string): Named {
  const rules: [RegExp, string][] = [
    [/\bEdg(?:e|A|iOS)?\/([\d.]+)/, 'Edge'],
    [/\bOPR\/([\d.]+)/, 'Opera'],
    [/\bFirefox\/([\d.]+)/, 'Firefox'],
    [/\bFxiOS\/([\d.]+)/, 'Firefox'],
    [/\bCriOS\/([\d.]+)/, 'Chrome'],
  ];
  for (const [re, name] of rules) {
    const m = re.exec(ua);
    if (m) return { name, version: major(m[1]!) };
  }
  // A Chromium web view says so with `wv` (Android) and a Version/ token.
  const chrome = /\bChrome\/([\d.]+)/.exec(ua);
  if (chrome) {
    return { name: /;\s*wv\)/.test(ua) ? 'WebView' : 'Chrome', version: major(chrome[1]!) };
  }
  const safari = /\bVersion\/([\d.]+).*\bSafari\//.exec(ua);
  if (safari) return { name: 'Safari', version: major(safari[1]!) };
  return { name: 'unknown', version: '' };
}

/** The operating system in a user agent string. Chrome freezes its Android and desktop versions, so they may be rounded. */
export function parseOs(ua: string): Named {
  let m = /\bAndroid ([\d.]+)/.exec(ua);
  if (m) return { name: 'Android', version: major(m[1]!) };
  m = /\b(?:iPhone|CPU) OS ([\d_]+)/.exec(ua) ?? /\biPad.*OS ([\d_]+)/.exec(ua);
  if (m) return { name: 'iOS', version: major(m[1]!.replace(/_/g, '.')) };
  m = /\bMac OS X ([\d_.]+)/.exec(ua);
  if (m) return { name: 'macOS', version: major(m[1]!.replace(/_/g, '.')) };
  m = /\bWindows NT ([\d.]+)/.exec(ua);
  if (m) return { name: 'Windows', version: m[1]! };
  if (/\bCrOS\b/.test(ua)) return { name: 'ChromeOS', version: '' };
  if (/\bLinux\b/.test(ua)) return { name: 'Linux', version: '' };
  return { name: 'unknown', version: '' };
}

const major = (v: string): string => v.split('.')[0] ?? v;

/** `navigator` and `window` as `SpecsEnv`, for a page; every read is guarded. */
export function specsEnvOf(
  host: HostKind,
  win: Partial<Window> | undefined = typeof window === 'undefined' ? undefined : window,
  nav: Partial<Navigator> | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): SpecsEnv {
  const env: SpecsEnv = { host };
  if (win?.screen) env.screen = { width: win.screen.width, height: win.screen.height };
  if (win?.devicePixelRatio !== undefined) env.devicePixelRatio = win.devicePixelRatio;
  if (win?.innerWidth !== undefined) env.innerWidth = win.innerWidth;
  if (win?.innerHeight !== undefined) env.innerHeight = win.innerHeight;
  if (nav?.userAgent) env.userAgent = nav.userAgent;
  if (nav?.maxTouchPoints !== undefined) env.maxTouchPoints = nav.maxTouchPoints;
  const uad = (nav as { userAgentData?: SpecsEnv['userAgentData'] } | undefined)?.userAgentData;
  if (uad) env.userAgentData = uad;
  return env;
}

/**
 * The specs of a session: what the page reports, then the game's own (its version, Size, left-handed mode, moved
 * controls, input devices, sound and pixel modes), which the caller supplies. Nothing here names a person or a
 * device: no language, no user agent string, no hardware id.
 */
export function readSpecs(env: SpecsEnv, game: Record<string, unknown>): Record<string, unknown> {
  const ua = env.userAgent ?? '';
  const browser = parseBrowser(ua);
  const os = parseOs(ua);
  return {
    host: env.host,
    screen: env.screen ? [env.screen.width, env.screen.height] : null,
    dpr: env.devicePixelRatio ?? null,
    window:
      env.innerWidth !== undefined && env.innerHeight !== undefined
        ? [env.innerWidth, env.innerHeight]
        : null,
    browser: browser.name,
    browserVersion: browser.version,
    os: env.userAgentData?.platform || os.name,
    osVersion: os.version,
    mobile: env.userAgentData?.mobile ?? /\b(Android|iPhone|iPad)\b/.test(ua),
    touchPoints: env.maxTouchPoints ?? 0,
    ...game,
  };
}
