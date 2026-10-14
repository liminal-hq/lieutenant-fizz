// The launcher page: opens the store, keeps the state machine's state and hands its effects to the page.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { BackGuard } from '@lieutenant-fizz/engine/back-guard';
import { createHostBackend } from '@lieutenant-fizz/engine/host';
import { applyMenuScale } from '@lieutenant-fizz/engine/menu/scale-vars';
import type { MenuSoundPlayer } from '@lieutenant-fizz/engine/menu/sounds';
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
import { SILENT, createLauncherSound } from './sound';
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

// Back: the Android gesture in the app, and a history entry in a browser (the desktop app has no Back button).
const back = await createLauncherBack({
  backend: createPredictiveBack(host.kind),
  guard:
    host.kind === 'web'
      ? new BackGuard(() => dispatch({ type: 'back' }), window.history, window)
      : undefined,
  onBack: () => dispatch({ type: 'back' }),
});

const deps = {
  store,
  toast,
  navigate: (url: string) => location.assign(new URL(url, location.href).href),
  pageOf: (episode: string) => files.get(episode)?.info?.page,
  releaseBack: () => back.release(),
};

// The menu's sounds, once a theme (which names them) has loaded.
let sound: MenuSoundPlayer = SILENT;

/** The look of the stop on show: its own theme when it has one, otherwise the first episode's. */
function themeOfStop(): { data: MenuThemeData; base: URL } | undefined {
  const stop = currentStop(state);
  const own = stop.kind === 'episode' ? files.get(stop.id) : undefined;
  const found = own?.theme ? own : [...files.values()].find((f) => f.theme);
  return found?.theme ? { data: found.theme, base: found.base } : undefined;
}
let themed: MenuThemeData | undefined;

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
  }
  back.sync(hasBack(state));
  void applyEffects(step.effects, deps);
};

// The keyboard: Back, and the arrows between stops. The gamepad's B and left and right arrive as events
// (menu.ts passes them on).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Backspace') dispatch({ type: 'back' });
  else if (e.key === 'ArrowLeft') dispatch({ type: 'stop', dir: -1 });
  else if (e.key === 'ArrowRight') dispatch({ type: 'stop', dir: 1 });
});
document.addEventListener('pad-back', () => dispatch({ type: 'back' }));
document.addEventListener('pad-left', () => dispatch({ type: 'stop', dir: -1 }));
document.addEventListener('pad-right', () => dispatch({ type: 'stop', dir: 1 }));

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
back.sync(hasBack(state));
