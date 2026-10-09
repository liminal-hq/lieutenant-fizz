// Pure rules for fullscreen, the landscape lock, auto-pause and (later) keeping the screen on.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Where the game runs: an ordinary browser page, or inside the native app's webview. */
export type Host = 'web' | 'app';

/** The fullscreen setting: Auto follows the device, On and Off force it. */
export type Want = 'auto' | 'on' | 'off';

/** What this page can do, found once at boot. */
export interface Caps {
  /** Element fullscreen is available (false on iPhone). */
  fullscreen: boolean;
  /** `screen.orientation.lock` exists. */
  orientationLock: boolean;
  /** `navigator.wakeLock` exists in a secure context. */
  wakeLock: boolean;
  /** Running as an installed app (`display-mode` standalone, fullscreen or minimal-ui, or `navigator.standalone`). */
  installed: boolean;
  host: Host;
}

/** What the policy looks at. */
export interface LifeState {
  /** The screen is one the player is watching or playing, so the display should stay on. */
  live: boolean;
  /** A level is being played (not paused, not a scene). */
  playing: boolean;
  visible: boolean;
  /** The Rotate screen is up. */
  rotated: boolean;
  /** An element is fullscreen right now. */
  fullscreen: boolean;
  /** Milliseconds since the last input. */
  idleMs: number;
  touchCapable: boolean;
  fullscreenWant: Want;
  wakeWant: 'on' | 'off';
}

/** What the player just did: start a run, resume one, or anything else. */
export type Gesture = 'start' | 'resume' | 'other';

/** Something that happened to the page. */
export type LifeEvent = 'hidden' | 'visible' | 'blur' | 'portrait' | 'fullscreenExit' | 'padLost';

/** How long the screen is kept on without input before it is let go. */
export const IDLE_RELEASE_MS = 300_000;

/** The parts of the browser that `detectCaps` looks at; fakes in tests. */
export interface CapsEnv {
  doc?: { fullscreenEnabled?: boolean; documentElement?: { requestFullscreen?: unknown } };
  orientation?: { lock?: unknown };
  nav?: { wakeLock?: unknown; standalone?: boolean };
  isSecureContext?: boolean;
  matchMedia?: (query: string) => { matches: boolean };
  host: Host;
}

/** The `display-mode` values an installed app runs in. */
const INSTALLED_MODES = ['standalone', 'fullscreen', 'minimal-ui'];

/** Finds what the page can do. Never throws; a missing or failing API counts as unavailable. */
export function detectCaps(env: CapsEnv): Caps {
  const mq = (q: string): boolean => {
    try {
      return env.matchMedia?.(q).matches ?? false;
    } catch {
      return false;
    }
  };
  return {
    fullscreen:
      env.doc?.fullscreenEnabled === true &&
      typeof env.doc.documentElement?.requestFullscreen === 'function',
    orientationLock: typeof env.orientation?.lock === 'function',
    wakeLock: env.isSecureContext !== false && !!env.nav?.wakeLock,
    installed:
      INSTALLED_MODES.some((m) => mq(`(display-mode: ${m})`)) || env.nav?.standalone === true,
    host: env.host,
  };
}

/** Whether the page runs inside the Tauri app (`__TAURI_INTERNALS__` is always injected; `isTauri` is the public flag). */
export function isAppHost(w: object): boolean {
  return '__TAURI_INTERNALS__' in w || (w as { isTauri?: unknown }).isTauri === true;
}

/** Whether the setting means fullscreen on this device: Auto is on for touch devices only. */
export function resolveFullscreen(want: Want, touchCapable: boolean): boolean {
  return want === 'auto' ? touchCapable : want === 'on';
}

/**
 * Reads `?fullscreen`: bare or `on` forces On, `off` forces Off, anything else (or no flag) leaves the
 * choice to the setting.
 */
export function parseFullscreenParam(value: string | null | undefined): Want | undefined {
  if (value === '' || value === 'on') return 'on';
  return value === 'off' ? 'off' : undefined;
}

/** Reads `?host=app`, which only counts in debug mode and pretends to be the native app. */
export function parseHostParam(value: string | null | undefined, debug: boolean): Host | undefined {
  return debug && value === 'app' ? 'app' : undefined;
}

/** What to ask the browser for on a gesture. */
export interface GesturePlan {
  fullscreen: boolean;
  lock: boolean;
}

/**
 * What a gesture should request. Only a gesture that starts or resumes a run asks for anything; the app
 * asks for nothing; an installed app is already fullscreen, so it only locks the orientation.
 */
export function onGesture(
  g: Gesture,
  s: Pick<LifeState, 'fullscreenWant' | 'touchCapable' | 'fullscreen'>,
  c: Caps,
): GesturePlan {
  if (g === 'other' || c.host === 'app') return { fullscreen: false, lock: false };
  if (!resolveFullscreen(s.fullscreenWant, s.touchCapable))
    return { fullscreen: false, lock: false };
  return {
    fullscreen: c.fullscreen && !c.installed && !s.fullscreen,
    lock: c.orientationLock,
  };
}

/** Whether no input has come for long enough that the display is let go. */
export function isIdle(idleMs: number): boolean {
  return idleMs >= IDLE_RELEASE_MS;
}

/** Reads `?wake`: bare or `on` forces the wake lock on, `off` forces it off, anything else leaves it to the setting. */
export function parseWakeParam(value: string | null | undefined): 'on' | 'off' | undefined {
  if (value === '' || value === 'on') return 'on';
  return value === 'off' ? 'off' : undefined;
}

/**
 * Whether the display should be kept on: a screen being watched or played, the page showing, the phone
 * upright, input within the last five minutes, the setting on, and something to hold it (the browser's
 * wake lock, or the app's native backend).
 */
export function wakeWanted(s: LifeState, c: Caps): boolean {
  return (
    s.live &&
    s.visible &&
    !s.rotated &&
    !isIdle(s.idleMs) &&
    s.wakeWant === 'on' &&
    (c.wakeLock || c.host === 'app')
  );
}

/** Whether an event should pause the game. Only a level in play pauses, and coming back never un-pauses. */
export function pauseFor(e: LifeEvent, s: Pick<LifeState, 'playing'>): boolean {
  return e !== 'visible' && s.playing;
}

/** The screens the fullscreen button cares about: the title, the pause menu, a level card, play, and everything else (scenes, the editor, loading). */
export type FullscreenScreen = 'title' | 'pause' | 'card' | 'play' | 'other';

/** The glyph the button draws: Expand to enter fullscreen, Collapse to leave it. */
export type FullscreenGlyph = 'expand' | 'collapse';

/** What the fullscreen button needs to decide. */
export interface FullscreenButtonInput {
  screen: FullscreenScreen;
  /** The on-screen touch controls are in use. */
  touch: boolean;
  caps: Pick<Caps, 'fullscreen' | 'host'>;
  /** An element is fullscreen right now. */
  fullscreen: boolean;
}

/** Whether the button shows, and what it says. */
export interface FullscreenButton {
  show: boolean;
  glyph: FullscreenGlyph;
  label: 'Fullscreen' | 'Exit fullscreen';
}

/**
 * The explicit fullscreen button and the `F` shortcut. They exist only where element fullscreen can work
 * in a browser page (the same rule as the Display screen: not an iPhone, not the app). On a touch screen
 * they show on the title and the pause menu, where the corner is free, and never in play, which already
 * goes fullscreen on its gesture and gives the corner to Pause. On a desktop they also show on level
 * cards and in play. The glyph and label follow whether the page is fullscreen. The Fullscreen setting
 * and `?fullscreen` govern only the automatic requests, so they do not appear here.
 */
export function fullscreenButton(i: FullscreenButtonInput): FullscreenButton {
  const can = i.caps.fullscreen && i.caps.host === 'web';
  const where =
    i.screen === 'title' ||
    i.screen === 'pause' ||
    (!i.touch && (i.screen === 'card' || i.screen === 'play'));
  return {
    show: can && where,
    glyph: i.fullscreen ? 'collapse' : 'expand',
    label: i.fullscreen ? 'Exit fullscreen' : 'Fullscreen',
  };
}

/** The web Back guard stays out of the app, where the native Back is the game's. */
export function backGuardAllowed(c: Caps): boolean {
  return c.host !== 'app';
}

/** Everything the lifecycle decides from the state of the page. */
export function lifecyclePolicy(
  s: LifeState,
  c: Caps,
): { awake: boolean; backGuardAllowed: boolean } {
  return { awake: wakeWanted(s, c), backGuardAllowed: backGuardAllowed(c) };
}
