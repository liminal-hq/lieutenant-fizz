// The launcher page: opens the store, keeps the state machine's state and hands its effects to the page.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { BackGuard } from '@lieutenant-fizz/engine/back-guard';
import type { BackPeek } from '@lieutenant-fizz/engine/back-peek';
import { hintText } from '@lieutenant-fizz/engine/font/tokens';
import { createHostBackend, openPage } from '@lieutenant-fizz/engine/host';
import { applyMenuScale } from '@lieutenant-fizz/engine/menu/scale-vars';
import {
  applyMenuTheme,
  bulletImageOf,
  themeOfData,
  type MenuThemeData,
} from '@lieutenant-fizz/engine/menu/theme';
import { createPredictiveBack } from '@lieutenant-fizz/engine/predictive-back';
import { createStorage } from '@lieutenant-fizz/engine/storage';
import episodesFile from '../../../../site/episodes.json';
import { createLauncherBack } from './back';
import { hintsOf } from './hints';
import { createLauncherPeek } from './peek';
import {
  readSaves,
  stopsOf,
  type EpisodeInfo,
  type EpisodesFile,
  type SaveSummary,
} from './catalog';
import { cueOf } from './cues';
import { readUnlocked } from './dev-unlock';
import { applyEffects } from './effects';
import { SILENT, createLauncherSound, type LauncherSound } from './sound';
import { currentStop, hasBack, initialState, reduce, type Action } from './state';
import { createSnackbar, createToast, type ToastDeps } from './toast';
import { createStrip, type Strip } from './strip';
import { createView } from './view';
import './launcher.css';

const root = document.getElementById('launcher');
if (!root) throw new Error('The launcher page has no #launcher element');

const store = await createStorage({
  onError: (kind, error) => console.warn(`The ${kind} store could not be opened`, error),
});
const ui = document.getElementById('ui') ?? document.body;
const snackbar = createSnackbar(ui);
const host = createHostBackend();

/** The Tauri calls, loaded only inside the app so the browser never fetches them. */
async function tauriCalls(): Promise<Pick<ToastDeps, 'invoke' | 'listen'>> {
  if (host.kind === 'web') return {};
  const [{ invoke }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
  ]);
  return { invoke, listen };
}

const toast = await createToast({ kind: host.kind, snackbar, ...(await tauriCalls()) });

// What each playable episode's build wrote out for the launcher (`scripts/build-launcher-art.ts`): the page that
// runs it, where its saves are, and its menu look. An episode whose files are missing has no Continue or Load game
// and keeps the default look.
interface EpisodeFiles {
  info: EpisodeInfo | undefined;
  theme: MenuThemeData | undefined;
  base: URL;
}
async function loadJson<T>(url: URL): Promise<T | undefined> {
  try {
    const response = await fetch(url);
    return response.ok ? ((await response.json()) as T) : undefined;
  } catch (error) {
    console.warn(`${url.pathname} could not be loaded`, error);
    return undefined;
  }
}
const stops = stopsOf(episodesFile as EpisodesFile);
const files = new Map<string, EpisodeFiles>();
await Promise.all(
  stops.map(async (stop) => {
    if (stop.kind !== 'episode' || !stop.playable) return;
    const base = new URL(`launcher/${stop.id}/`, location.href);
    const [info, theme] = await Promise.all([
      loadJson<EpisodeInfo>(new URL('episode.json', base)),
      loadJson<MenuThemeData>(new URL('theme.json', base)),
    ]);
    files.set(stop.id, { info, theme, base });
  }),
);
const saves: Record<string, SaveSummary> = {};
for (const [id, f] of files) if (f.info) saves[id] = readSaves(store, f.info);

let state = initialState(stops, readUnlocked(store), saves);

// The Back gesture's peek, made below once the view exists; a gesture that arrives before then has nothing to peek at.
// eslint-disable-next-line prefer-const -- assigned once below, after the Back callbacks that use it are made
let peek: BackPeek | undefined;

// Back: the Android gesture in the app, and a history entry in a browser (the desktop app has no Back button).
const back = await createLauncherBack({
  backend: createPredictiveBack(host.kind),
  guard:
    host.kind === 'web'
      ? new BackGuard(() => dispatch({ type: 'back' }), window.history, window)
      : undefined,
  // A completed gesture goes back, then the peek's copy is dropped.
  onBack: () => {
    dispatch({ type: 'back' });
    peek?.end();
  },
  peek: {
    started: (edge) => peek?.started(edge),
    progress: (progress, edge) => peek?.progress(progress, edge),
    cancelled: () => peek?.cancelled(),
  },
});

const deps = {
  store,
  toast,
  // In place of the launcher, so the launcher and the episode do not pile up in the history.
  navigate: openPage,
  pageOf: (episode: string) => files.get(episode)?.info?.page,
  releaseBack: () => back.release(),
  reclaimBack: () => back.reclaim(hasBack(state)),
};

// The menu's sounds, once a theme (which names them) has loaded.
let sound: LauncherSound = SILENT;

/** The look of the stop on show: its own theme when it has one, otherwise the first episode's. */
function themeOfStop(): { data: MenuThemeData; base: URL } | undefined {
  const stop = currentStop(state);
  const own = stop.kind === 'episode' ? files.get(stop.id) : undefined;
  const found = own?.theme ? own : [...files.values()].find((f) => f.theme);
  return found?.theme ? { data: found.theme, base: found.base } : undefined;
}
let themed: MenuThemeData | undefined;

// The keyboard's hints along the bottom (hidden on touch).
const keys = document.createElement('div');
keys.className = 'keys';
keys.setAttribute('aria-hidden', 'true');
ui.append(keys);
const drawHints = (): void => {
  keys.replaceChildren(
    ...hintsOf(state).map((hint) => {
      const span = document.createElement('span');
      span.textContent = hintText(hint);
      return span;
    }),
  );
};

const view = createView(root, {
  onActivate: (row) => dispatch({ type: 'activate', row }),
  onMove: () => sound.cue('move'),
  onStop: (dir) => dispatch({ type: 'stop', dir }),
});

/** Applies the theme of the stop on show, when it is not the one applied already. */
function applyTheme(): void {
  const found = themeOfStop();
  if (!found || found.data === themed) return;
  themed = found.data;
  applyMenuTheme(document.documentElement, themeOfData(found.data));
  const b = found.data.bullet;
  view.setBullet(b ? bulletImageOf(found.data, new URL(b.src, found.base).href) : undefined);
  // The audio of the look it replaces is let go, so stepping through stops does not pile up audio contexts.
  sound.dispose();
  sound = createLauncherSound(found.data, store, host.kind !== 'web');
}

const dispatch = (action: Action): void => {
  const before = state;
  const step = reduce(state, action);
  const cue = cueOf(before, action, step);
  if (cue) sound.cue(cue);
  state = step.state;
  if (state !== before) {
    applyTheme();
    view.render(state);
    drawHints();
  }
  back.sync(hasBack(state));
  void applyEffects(step.effects, deps);
};

// The keyboard: Back, and the arrows between stops. The gamepad's B and left and right arrive as events
// (menu.ts passes them on).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Backspace') dispatch({ type: 'back' });
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    view.step(e.key === 'ArrowDown' ? 1 : -1);
  } else if ((e.key === 'Enter' || e.key === ' ') && !view.rowHasFocus() && !isControl(e.target)) {
    // Nothing is focused yet: Enter chooses the highlighted row.
    e.preventDefault();
    view.activateSelected();
  } else if (e.key === 'ArrowLeft') dispatch({ type: 'stop', dir: -1 });
  else if (e.key === 'ArrowRight') dispatch({ type: 'stop', dir: 1 });
});
/** Whether a key press landed on a button or link of its own, which handles Enter itself. */
function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a[href]') !== null;
}
document.addEventListener('pad-back', () => dispatch({ type: 'back' }));
document.addEventListener('pad-left', () => dispatch({ type: 'stop', dir: -1 }));
document.addEventListener('pad-right', () => dispatch({ type: 'stop', dir: 1 }));

// The Back gesture's peek: the screen being left slides away over the one Back goes to.
peek = createLauncherPeek({
  root,
  ui,
  canPeek: () => hasBack(state),
  showParent: () => view.preview(reduce(state, { type: 'back' }).state),
  showCurrent: () => view.render(state),
  reducedMotion: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
});

// `?debug` leaves the pieces in reach of a browser check.
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __launcher: unknown }).__launcher = {
    peek,
    dispatch,
    state: () => state,
  };
}

// The window's text scale, now and when it changes.
let strip: Strip | undefined;
const scale = (): void => {
  applyMenuScale(document.documentElement, innerWidth, innerHeight);
  strip?.resize(innerHeight);
};
scale();
addEventListener('resize', scale);

// The demo strip, from the first episode that has one.
for (const f of files.values()) {
  if (f.info?.strip && f.info.runner) {
    strip = createStrip(ui, { strip: f.info.strip, runner: f.info.runner }, f.base);
    scale();
    break;
  }
}

applyTheme();
view.render(state);
drawHints();
back.sync(hasBack(state));
