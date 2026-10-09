// Tests for the fullscreen, lock and auto-pause rules.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  fullscreenButton,
  IDLE_RELEASE_MS,
  backGuardAllowed,
  detectCaps,
  isAppHost,
  isIdle,
  lifecyclePolicy,
  onGesture,
  parseFullscreenParam,
  parseHostParam,
  parseWakeParam,
  pauseFor,
  resolveFullscreen,
  wakeWanted,
  type Caps,
  type CapsEnv,
  type LifeEvent,
  type LifeState,
} from './lifecycle-policy';

const CAPS: Caps = {
  fullscreen: true,
  orientationLock: true,
  wakeLock: true,
  installed: false,
  host: 'web',
};
const S = { fullscreenWant: 'auto', touchCapable: true, fullscreen: false } as const;
const NO = { fullscreen: false, lock: false };

describe('onGesture', () => {
  it('asks for fullscreen and the lock when a touch device starts a run', () => {
    expect(onGesture('start', S, CAPS)).toEqual({ fullscreen: true, lock: true });
    expect(onGesture('resume', S, CAPS)).toEqual({ fullscreen: true, lock: true });
  });

  it('only locks when installed, since the app is already fullscreen', () => {
    expect(onGesture('start', S, { ...CAPS, installed: true })).toEqual({
      fullscreen: false,
      lock: true,
    });
  });

  it('asks for nothing in the app', () => {
    for (const want of ['auto', 'on', 'off'] as const) {
      expect(onGesture('start', { ...S, fullscreenWant: want }, { ...CAPS, host: 'app' })).toEqual(
        NO,
      );
    }
  });

  it('follows the setting: Auto is off on desktop, On forces it, Off never', () => {
    expect(onGesture('start', { ...S, touchCapable: false }, CAPS)).toEqual(NO);
    expect(onGesture('start', { ...S, touchCapable: false, fullscreenWant: 'on' }, CAPS)).toEqual({
      fullscreen: true,
      lock: true,
    });
    expect(onGesture('start', { ...S, fullscreenWant: 'off' }, CAPS)).toEqual(NO);
  });

  it('asks for nothing on any other gesture', () => {
    expect(onGesture('other', { ...S, fullscreenWant: 'on' }, CAPS)).toEqual(NO);
  });

  it('does not ask again when already fullscreen, but still locks', () => {
    expect(onGesture('resume', { ...S, fullscreen: true }, CAPS)).toEqual({
      fullscreen: false,
      lock: true,
    });
  });

  it('skips what the browser cannot do', () => {
    expect(onGesture('start', S, { ...CAPS, fullscreen: false })).toEqual({
      fullscreen: false,
      lock: true,
    });
    expect(onGesture('start', S, { ...CAPS, orientationLock: false })).toEqual({
      fullscreen: true,
      lock: false,
    });
  });
});

describe('resolveFullscreen', () => {
  it('resolves Auto by touch and the others as given', () => {
    expect(resolveFullscreen('auto', true)).toBe(true);
    expect(resolveFullscreen('auto', false)).toBe(false);
    expect(resolveFullscreen('on', false)).toBe(true);
    expect(resolveFullscreen('off', true)).toBe(false);
  });
});

describe('pauseFor', () => {
  const events: LifeEvent[] = [
    'hidden',
    'visible',
    'blur',
    'portrait',
    'fullscreenExit',
    'padLost',
  ];
  const expected: Record<LifeEvent, boolean> = {
    hidden: true,
    visible: false,
    blur: true,
    portrait: true,
    fullscreenExit: true,
    padLost: true,
  };

  it('pauses a level in play on every event but coming back', () => {
    for (const e of events) expect(pauseFor(e, { playing: true })).toBe(expected[e]);
  });

  it('never pauses anything that is not in play', () => {
    for (const e of events) expect(pauseFor(e, { playing: false })).toBe(false);
  });
});

describe('wakeWanted and lifecyclePolicy', () => {
  const live: LifeState = {
    live: true,
    playing: true,
    visible: true,
    rotated: false,
    fullscreen: false,
    idleMs: 10_000,
    touchCapable: true,
    fullscreenWant: 'auto',
    wakeWant: 'on',
  };

  it('wants the screen on while live, visible, upright, recent and allowed', () => {
    expect(wakeWanted(live, CAPS)).toBe(true);
  });

  it('lets go when idle, hidden, rotated, off the live screens, off, or unsupported', () => {
    expect(wakeWanted({ ...live, idleMs: IDLE_RELEASE_MS }, CAPS)).toBe(false);
    expect(wakeWanted({ ...live, visible: false }, CAPS)).toBe(false);
    expect(wakeWanted({ ...live, rotated: true }, CAPS)).toBe(false);
    expect(wakeWanted({ ...live, live: false }, CAPS)).toBe(false);
    expect(wakeWanted({ ...live, wakeWant: 'off' }, CAPS)).toBe(false);
    expect(wakeWanted(live, { ...CAPS, wakeLock: false })).toBe(false);
  });

  it('leaves the app to its native backend', () => {
    expect(wakeWanted(live, { ...CAPS, wakeLock: false, host: 'app' })).toBe(true);
  });

  it('keeps the Back guard out of the app only', () => {
    expect(lifecyclePolicy(live, CAPS)).toEqual({ awake: true, backGuardAllowed: true });
    expect(lifecyclePolicy(live, { ...CAPS, host: 'app' }).backGuardAllowed).toBe(false);
    expect(backGuardAllowed({ ...CAPS, host: 'app' })).toBe(false);
  });
});

describe('detectCaps', () => {
  const full = (): CapsEnv => ({
    doc: { fullscreenEnabled: true, documentElement: { requestFullscreen: () => {} } },
    orientation: { lock: () => {} },
    nav: { wakeLock: {} },
    isSecureContext: true,
    matchMedia: () => ({ matches: false }),
    host: 'web',
  });

  it('finds everything on a capable browser', () => {
    expect(detectCaps(full())).toEqual({
      fullscreen: true,
      orientationLock: true,
      wakeLock: true,
      installed: false,
      host: 'web',
    });
  });

  it('has no fullscreen where fullscreenEnabled is false, as on iPhone', () => {
    const env = full();
    env.doc = { fullscreenEnabled: false, documentElement: { requestFullscreen: () => {} } };
    expect(detectCaps(env).fullscreen).toBe(false);
  });

  it('has no lock when screen.orientation.lock is missing', () => {
    const env = full();
    env.orientation = {};
    expect(detectCaps(env).orientationLock).toBe(false);
    env.orientation = undefined;
    expect(detectCaps(env).orientationLock).toBe(false);
  });

  it('has no wake lock outside a secure context or without the API', () => {
    const env = full();
    env.isSecureContext = false;
    expect(detectCaps(env).wakeLock).toBe(false);
    env.isSecureContext = true;
    env.nav = {};
    expect(detectCaps(env).wakeLock).toBe(false);
  });

  it('survives a throwing matchMedia', () => {
    const env = full();
    env.matchMedia = () => {
      throw new Error('no media queries');
    };
    expect(detectCaps(env).installed).toBe(false);
  });

  it('is installed in display-mode fullscreen, standalone or minimal-ui, or navigator.standalone', () => {
    for (const mode of ['fullscreen', 'standalone', 'minimal-ui']) {
      const env = full();
      env.matchMedia = (q) => ({ matches: q === `(display-mode: ${mode})` });
      expect(detectCaps(env).installed).toBe(true);
    }
    const env = full();
    env.nav = { standalone: true };
    expect(detectCaps(env).installed).toBe(true);
  });

  it('carries the host through', () => {
    expect(detectCaps({ ...full(), host: 'app' }).host).toBe('app');
  });
});

describe('isAppHost', () => {
  it('sees Tauri by either global', () => {
    expect(isAppHost({})).toBe(false);
    expect(isAppHost({ isTauri: false })).toBe(false);
    expect(isAppHost({ isTauri: true })).toBe(true);
    expect(isAppHost({ __TAURI_INTERNALS__: {} })).toBe(true);
  });
});

describe('the URL flags', () => {
  it('reads ?fullscreen: bare and on force On, off forces Off, anything else chooses nothing', () => {
    expect(parseFullscreenParam('')).toBe('on');
    expect(parseFullscreenParam('on')).toBe('on');
    expect(parseFullscreenParam('off')).toBe('off');
    for (const v of [null, undefined, 'auto', 'ON', 'yes', ' off']) {
      expect(parseFullscreenParam(v)).toBeUndefined();
    }
  });

  it('reads ?host=app only in debug mode', () => {
    expect(parseHostParam('app', true)).toBe('app');
    expect(parseHostParam('app', false)).toBeUndefined();
    expect(parseHostParam('web', true)).toBeUndefined();
    expect(parseHostParam(null, true)).toBeUndefined();
  });
});

describe('isIdle and parseWakeParam', () => {
  it('lets the display go at exactly five minutes without input', () => {
    expect(isIdle(0)).toBe(false);
    expect(isIdle(299_999)).toBe(false);
    expect(isIdle(300_000)).toBe(true);
    expect(isIdle(IDLE_RELEASE_MS + 1)).toBe(true);
  });

  it('reads ?wake like ?fullscreen', () => {
    expect(parseWakeParam('')).toBe('on');
    expect(parseWakeParam('on')).toBe('on');
    expect(parseWakeParam('off')).toBe('off');
    for (const v of [null, undefined, 'maybe', '1']) expect(parseWakeParam(v)).toBeUndefined();
  });
});

describe('fullscreenButton', () => {
  const web = { fullscreen: true, host: 'web' } as const;
  const base = { screen: 'title', touch: false, caps: web, fullscreen: false } as const;
  const shows = (i: Partial<Parameters<typeof fullscreenButton>[0]>): boolean =>
    fullscreenButton({ ...base, ...i }).show;

  it('shows on the title and the pause menu on touch and on a desktop', () => {
    for (const touch of [true, false]) {
      expect(shows({ screen: 'title', touch })).toBe(true);
      expect(shows({ screen: 'pause', touch })).toBe(true);
    }
  });

  it('shows on level cards and in play on a desktop only', () => {
    expect(shows({ screen: 'card', touch: false })).toBe(true);
    expect(shows({ screen: 'play', touch: false })).toBe(true);
    expect(shows({ screen: 'card', touch: true })).toBe(false);
    expect(shows({ screen: 'play', touch: true })).toBe(false);
  });

  it('stays off scenes, the editor and loading', () => {
    expect(shows({ screen: 'other', touch: false })).toBe(false);
    expect(shows({ screen: 'other', touch: true })).toBe(false);
  });

  it('needs element fullscreen in a browser page', () => {
    expect(shows({ caps: { fullscreen: false, host: 'web' } })).toBe(false);
    expect(shows({ caps: { fullscreen: true, host: 'app' } })).toBe(false);
    expect(shows({ caps: { fullscreen: false, host: 'app' } })).toBe(false);
  });

  it('flips the glyph and the label while fullscreen', () => {
    expect(fullscreenButton(base)).toEqual({
      show: true,
      glyph: 'expand',
      label: 'Fullscreen',
    });
    expect(fullscreenButton({ ...base, fullscreen: true })).toEqual({
      show: true,
      glyph: 'collapse',
      label: 'Exit fullscreen',
    });
  });
});
