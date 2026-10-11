// Tests for host detection and the host's quit capability, with injected environments.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { createHostBackend, detectHostKind, hostEnvOf } from './host';

const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';

const IPAD_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

describe('hostEnvOf', () => {
  it('sees Tauri through the internals or the public flag', () => {
    expect(hostEnvOf({ __TAURI_INTERNALS__: {} }, { userAgent: LINUX }).tauri).toBe(true);
    expect(hostEnvOf({ isTauri: true }, { userAgent: LINUX }).tauri).toBe(true);
    expect(hostEnvOf({}, { userAgent: LINUX }).tauri).toBe(false);
    expect(hostEnvOf({ isTauri: false }, { userAgent: LINUX }).tauri).toBe(false);
  });

  it('copes with no window or navigator', () => {
    expect(hostEnvOf(null, null)).toEqual({ tauri: false, userAgent: '', maxTouchPoints: 0 });
  });

  it('reads the touch points', () => {
    expect(hostEnvOf({}, { userAgent: LINUX, maxTouchPoints: 5 }).maxTouchPoints).toBe(5);
  });
});

describe('detectHostKind', () => {
  it('is the web outside Tauri, whatever the device', () => {
    expect(detectHostKind({ tauri: false, userAgent: LINUX })).toBe('web');
    expect(detectHostKind({ tauri: false, userAgent: ANDROID })).toBe('web');
  });

  it('tells the desktop app from Android and iOS by the user agent', () => {
    expect(detectHostKind({ tauri: true, userAgent: LINUX })).toBe('tauri-desktop');
    expect(detectHostKind({ tauri: true, userAgent: ANDROID })).toBe('tauri-android');
    expect(detectHostKind({ tauri: true, userAgent: IPHONE })).toBe('tauri-ios');
  });

  it('takes a desktop-mode iPad (a Macintosh user agent with a touch screen) for iOS, and a Mac for a desktop', () => {
    expect(detectHostKind({ tauri: true, userAgent: IPAD_DESKTOP, maxTouchPoints: 5 })).toBe(
      'tauri-ios',
    );
    expect(detectHostKind({ tauri: true, userAgent: IPAD_DESKTOP, maxTouchPoints: 0 })).toBe(
      'tauri-desktop',
    );
    expect(detectHostKind({ tauri: true, userAgent: IPAD_DESKTOP })).toBe('tauri-desktop');
  });
});

describe('createHostBackend', () => {
  it('offers quit on the desktop app only', () => {
    expect(createHostBackend({ tauri: true, userAgent: LINUX }, async () => {}).quit).toBeTypeOf(
      'function',
    );
    for (const env of [
      { tauri: false, userAgent: LINUX },
      { tauri: true, userAgent: ANDROID },
      { tauri: true, userAgent: IPHONE },
    ]) {
      expect(createHostBackend(env, async () => {}).quit).toBeUndefined();
    }
  });

  it('runs the quit command', async () => {
    const quit = vi.fn(async () => {});
    await createHostBackend({ tauri: true, userAgent: LINUX }, quit).quit?.();
    expect(quit).toHaveBeenCalledOnce();
  });

  it('does not reject when the command fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quit = vi.fn(async () => {
      throw new Error('no');
    });
    await expect(
      createHostBackend({ tauri: true, userAgent: LINUX }, quit).quit?.(),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
