// The launcher page: opens the store, keeps the state machine's state and hands its effects to the page.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { BackGuard } from '@lieutenant-fizz/engine/back-guard';
import type { BackPeek } from '@lieutenant-fizz/engine/back-peek';
import { hintText } from '@lieutenant-fizz/engine/font/tokens';
import { closeApp } from '@lieutenant-fizz/engine/close-app';
import type { FullscreenBackend } from '@lieutenant-fizz/engine/fullscreen-backend';
import { createHostBackend, openPage, type HostBackend } from '@lieutenant-fizz/engine/host';
import type { InputDevice } from '@lieutenant-fizz/engine/input';
import type { MenuCue } from '@lieutenant-fizz/engine/menu/sounds';
import {
  fakeNativeWindow,
  nativeFullscreenBackend,
} from '@lieutenant-fizz/engine/native-fullscreen';
import { applyMenuScale } from '@lieutenant-fizz/engine/menu/scale-vars';
import {
  applyMenuTheme,
  bulletImageOf,
  themeOfData,
  type MenuThemeData,
} from '@lieutenant-fizz/engine/menu/theme';
import { createPredictiveBack } from '@lieutenant-fizz/engine/predictive-back';
import { createStorage, flushable } from '@lieutenant-fizz/engine/storage';
import episodesFile from '../../../../site/episodes.json';
import { createLauncherBack } from './back';
import { hintsOf } from './hints';
import { createLauncherPeek } from './peek';
import {
  readSaves,
  stopsOf,
  type EpisodeInfo,
  type SceneInfo,
  type Stop,
  type EpisodesFile,
  type SaveSummary,
} from './catalog';
import { cueOf } from './cues';
import { readUnlocked } from './dev-unlock';
import { fullscreenKey, shouldStartFullscreen } from './desktop';
import { applyEffects } from './effects';
import { parseOverworld, type OverworldData } from './slot-info';
import { optionsSourceOf, readGlobal, resetGlobal, volumeOf, writeGlobal } from './options';
import type { GlobalOptions } from '@lieutenant-fizz/engine/options';
import { RESET_ARM_MS } from '@lieutenant-fizz/engine/two-tap';
import { densityRow } from '@lieutenant-fizz/engine/menu/density';
import { SILENT, createLauncherSound, type LauncherSound } from './sound';
import { DEBUG_URL, currentStop, hasBack, initialState, reduce, type Action } from './state';
import { createSnackbar, createToast, type ToastDeps } from './toast';
import { isPortrait } from '@lieutenant-fizz/engine/portrait';
import { BEN_LOOK, BEN_WAVE, benFrame, benScale } from '@lieutenant-fizz/engine/menu/title-ben';
import { createScene, createStage } from './scene';
import { libraryOf, musicSettingsOf, openLauncherMusic, trackOf } from './music';
import { createLauncherHaptics, NO_HAPTICS, type LauncherHaptics } from './haptics';
import { createLauncherTouch, type LauncherTouch } from './touch';
import { readStop, writeStop } from './stop-memory';
import { SETTINGS_TABS } from './settings';
import { openSaver } from '@lieutenant-fizz/engine/file-save';
import { exportSaves, importSaves, saveKeysOf, type SavesDeps } from './saves';
import { APP_VERSION, createView } from './view';
import './launcher.css';

const root = document.getElementById('launcher');
if (!root) throw new Error('The launcher page has no #launcher element');

const store = await createStorage({
  onError: (kind, error) => console.warn(`The ${kind} store could not be opened`, error),
});
const ui = document.getElementById('ui') ?? document.body;
const snackbar = createSnackbar(ui);
// `?debug&host=fake-desktop` is the desktop app without an OS behind it: a window whose fullscreen is a flag, and a
// Quit that counts in `window.__lfQuits` instead of closing the page (the same fake the game uses).
const query = new URLSearchParams(location.search);
const fakeDesktop = query.has('debug') && query.get('host') === 'fake-desktop';
const host: HostBackend = fakeDesktop
  ? {
      kind: 'tauri-desktop',
      quit: async () => {
        const w = window as unknown as { __lfQuits?: number };
        w.__lfQuits = (w.__lfQuits ?? 0) + 1;
      },
    }
  : createHostBackend();
// The desktop app's window takes fullscreen; no other host does.
const fullscreen: FullscreenBackend | undefined =
  host.kind === 'tauri-desktop'
    ? await nativeFullscreenBackend(fakeDesktop ? fakeNativeWindow() : undefined)
    : undefined;

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
  /** The overworld the Load game screen draws slots from, when the episode has one. */
  overworld: OverworldData | undefined;
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
    const overworldFile = info?.saves.overworld;
    const overworld = overworldFile
      ? parseOverworld(await loadJson<unknown>(new URL(overworldFile, base)))
      : undefined;
    files.set(stop.id, { info, theme, overworld, base });
  }),
);
// The app-wide options (read from the shared file, carried over from an older build's the first time).
const optionsSource = optionsSourceOf([...files.values()].map((f) => f.info));
let options = readGlobal(store, optionsSource);
const saves: Record<string, SaveSummary> = {};
for (const [id, f] of files) if (f.info) saves[id] = readSaves(store, f.info, f.overworld);

// Leaving for the debug menu from About comes back to About, not to the first screen.
const RETURN_KEY = 'lf-launcher-return-v1';
let returnToAbout = false;
try {
  returnToAbout = sessionStorage.getItem(RETURN_KEY) === 'about';
  sessionStorage.removeItem(RETURN_KEY);
} catch {
  /* no session storage */
}

let state = initialState(stops, readUnlocked(store), saves, {
  canQuit: host.quit !== undefined,
  stop: readStop(store, stops),
  about: returnToAbout,
  options,
  touch: matchMedia('(pointer: coarse)').matches,
});

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

// The file dialogs the saves export and import use (the system's in the apps, the browser's on the web).
const saver = await openSaver();
const savesDeps: SavesDeps = {
  store,
  saver,
  episodes: saveKeysOf([...files].map(([id, f]) => [id, f.info] as const)),
  app: APP_VERSION,
  now: () => new Date(),
  flush: async () => (await flushable(store)?.flush()) !== false,
  refresh: () => {
    const next: Record<string, SaveSummary> = {};
    for (const [id, f] of files) if (f.info) next[id] = readSaves(store, f.info, f.overworld);
    dispatch({ type: 'saves', saves: next });
  },
};
let armTimer: ReturnType<typeof setTimeout> | undefined;

const deps = {
  store,
  toast,
  options: {
    save: (key: string, value: number | boolean) => {
      const ok = writeGlobal(store, optionsSource, key, value);
      if (ok) applyOptions(readGlobal(store, optionsSource));
      // The screen goes back to what is held when the write failed.
      else dispatch({ type: 'options', options });
      return ok;
    },
    reset: (keys: readonly string[]) => {
      const ok = resetGlobal(store, optionsSource, keys);
      if (ok) applyOptions(readGlobal(store, optionsSource));
      else dispatch({ type: 'options', options });
      return ok;
    },
  },
  saves: { export: () => exportSaves(savesDeps), import: () => importSaves(savesDeps) },
  arm: () => {
    clearTimeout(armTimer);
    armTimer = setTimeout(() => dispatch({ type: 'disarm' }), RESET_ARM_MS);
  },
  // In place of the launcher, so the launcher and the episode do not pile up in the history.
  navigate: (url: string) => {
    if (url === DEBUG_URL && state.screen === 'about') {
      try {
        sessionStorage.setItem(RETURN_KEY, 'about');
      } catch {
        /* no session storage */
      }
    }
    openPage(url);
  },
  pageOf: (episode: string) => files.get(episode)?.info?.page,
  releaseBack: () => back.release(),
  reclaimBack: () => back.reclaim(hasBack(state)),
  quit: host.quit
    ? () =>
        closeApp({
          exitFullscreen: async () => void (await fullscreen?.exit()),
          ...(flushable(store) ? { flush: () => flushable(store)!.flush() } : {}),
          quit: host.quit!,
        })
    : undefined,
};

// The menu's sounds, once a theme (which names them) has loaded.
let sound: LauncherSound = SILENT;
// The same cues for the hand: the phone buzzes (a pad rumbles) as the menu sounds.
let haptics: LauncherHaptics = NO_HAPTICS;
/** A menu cue, for the ear and the hand. */
const menuCue = (cue: MenuCue): void => {
  sound.cue(cue);
  haptics.cue(cue);
  // Ben turns to the menu as the cursor moves and waves when a row is chosen, as on the game's title.
  const now = performance.now() / 1000;
  if (cue === 'move') benLookUntil = now + BEN_LOOK;
  else if (cue === 'select') benWaveUntil = now + BEN_WAVE;
};
let benLookUntil = 0;
let benWaveUntil = 0;
const benT0 = performance.now() / 1000;
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

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
// Which device the player last used decides the hints: keys for a keyboard and mouse, buttons for a pad, none for touch.
// A phone starts with its on-screen controls; any other device starts on the keyboard until a touch.
let device: InputDevice = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
// The game is landscape: a touch device held upright gets a "Rotate your phone" screen over the page.
const rotate = document.createElement('div');
rotate.id = 'rotate';
rotate.hidden = true;
rotate.innerHTML =
  '<div><h2>Rotate your phone</h2><p>Lieutenant Fizz plays in landscape.</p></div>';
ui.append(rotate);
const showRotate = (): void => {
  rotate.hidden = !(device === 'touch' && isPortrait(innerWidth, innerHeight));
};
const useDevice = (next: InputDevice): void => {
  if (next === device) return;
  device = next;
  showRotate();
  haptics.setDevice(device);
  touch?.setActive(device === 'touch');
  keepClearOfControls();
  drawHints();
};
const drawHints = (): void => {
  keys.replaceChildren(
    ...hintsOf(state, device).map((hint) => {
      const span = document.createElement('span');
      span.textContent = hintText(hint);
      return span;
    }),
  );
};

// The on-screen controls (D-pad, Select and Back), shown while touch is the device in use.
const touchLayer = document.createElement('div');
touchLayer.id = 'touch';
ui.append(touchLayer);
// eslint-disable-next-line prefer-const -- assigned once below, after the view and `dispatch` it acts on exist
let touch: LauncherTouch | undefined;

/** Pads the page away from the controls on each side, so the menu and its heading start beside them. */
function keepClearOfControls(): void {
  // Every screen sits beside the controls, as the game's menus do, so the text lines up from screen to screen.
  const room = touch?.room() ?? { left: 0, right: 0 };
  const style = document.documentElement.style;
  style.setProperty('--lf-touch-left', `${room.left}px`);
  style.setProperty('--lf-touch-right', `${room.right}px`);
}

const view = createView(root, {
  // App settings shows the app's icon beside the logo.
  iconOf: (stop) =>
    stop.kind === 'app' ? new URL('launcher/app-icon.png', location.href).href : undefined,
  // The series logo: the first episode's, which every stop shares.
  logo: () => {
    const card = [...files.values()].find((f) => f.info?.card)?.info?.card;
    return card ? { kicker: card.kicker, words: card.words } : undefined;
  },
  // What the carousel says: the episode's number above and its name in the picker; App settings has the version.
  nameOf: (stop) => {
    if (stop.kind === 'app') return { sub: `Version ${APP_VERSION}`, name: 'App settings' };
    if (!stop.playable) {
      return { sub: `Episode ${stop.number}`, name: stop.title || '???' };
    }
    const card = files.get(stop.id)?.info?.card;
    return card ? { sub: card.episode, name: card.name } : undefined;
  },
  onActivate: (row) => dispatch({ type: 'activate', row }),
  onMove: () => menuCue('move'),
  onStop: (dir) => dispatch({ type: 'stop', dir }),
  onTab: (index) => {
    const tab = SETTINGS_TABS[index];
    if (tab) dispatch({ type: 'pick-tab', tab });
  },
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
  sound = createLauncherSound(found.data, volumeOf(options.sfx), host.kind !== 'web');
  haptics.dispose();
  haptics = createLauncherHaptics({
    data: found.data,
    store,
    rumble: options.rumble,
    kind: host.kind,
    touchCapable: matchMedia('(pointer: coarse)').matches,
    activePad: () => Array.from(navigator.getGamepads?.() ?? []).find((pad) => pad) ?? null,
  });
  haptics.setDevice(device);
}

/** Makes a changed option take effect now: the sound and rumble levels, the text size, row spacing and motion. */
function applyOptions(next: GlobalOptions): void {
  const before = options;
  options = next;
  // The sound and the haptics are made for a level, so a changed level makes them again.
  // Going to or from silence makes or drops the player; any other change only sets the level on the one there is.
  if (next.sfx <= 0 !== before.sfx <= 0) {
    themed = undefined;
    applyTheme();
  } else if (next.sfx !== before.sfx) sound.setLevel(volumeOf(next.sfx));
  music.set(musicSettingsOf(next));
  if (next.rumble !== before.rumble) haptics.setRumble(next.rumble);
  applyLook();
  view.relayout();
}

/** The options that shape the page itself. */
function applyLook(): void {
  applyMenuScale(document.documentElement, innerWidth, innerHeight, options.text === 1);
  const style = document.documentElement.style;
  if (matchMedia('(pointer: coarse)').matches) {
    style.setProperty('--lf-menu-row', `${densityRow(options.density)}px`);
  }
  const reduced =
    options.motion === 1 ||
    (options.motion === 0 && matchMedia('(prefers-reduced-motion: reduce)').matches);
  ui.classList.toggle('rm', reduced);
}

/** Left and right: a Settings row changes by a step, anywhere else they step between stops. */
function sideways(dir: -1 | 1): void {
  const row = view.selectedRow();
  if (state.screen === 'settings' && row) dispatch({ type: 'step', row, dir });
  else dispatch({ type: 'stop', dir });
}

const dispatch = (action: Action): void => {
  const before = state;
  const step = reduce(state, action);
  const cue = cueOf(before, action, step);
  if (cue) menuCue(cue);
  state = step.state;
  // The stop is remembered, so coming back from an episode (or the next launch) opens where the player was.
  if (state.stop !== before.stop) {
    writeStop(store, currentStop(state));
    showScene(action.type === 'stop' ? action.dir : 0);
  }
  if (state !== before) {
    applyTheme();
    view.render(state);
    touch?.refresh();
    keepClearOfControls();
    drawHints();
  }
  back.sync(hasBack(state));
  void applyEffects(step.effects, deps);
};

// The keyboard: Back, and the arrows between stops. The gamepad's B and left and right arrive as events
// (menu.ts passes them on).
document.addEventListener('keydown', (e) => {
  useDevice('keyboard');
  const toggle = fullscreen
    ? fullscreenKey(e, fullscreen.isFullscreen(), hasBack(state))
    : undefined;
  if (fullscreen && toggle) {
    // F11 and F toggle the window's fullscreen; Esc at the home screen leaves it first.
    e.preventDefault();
    if (toggle === 'exit' || fullscreen.isFullscreen()) void fullscreen.exit();
    else void fullscreen.enter({ fullscreen: true, lock: false });
  } else if (e.key === 'Escape' || e.key === 'Backspace') dispatch({ type: 'back' });
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    view.step(e.key === 'ArrowDown' ? 1 : -1);
  } else if ((e.key === 'Enter' || e.key === ' ') && !view.rowHasFocus() && !isControl(e.target)) {
    // Nothing is focused yet: Enter chooses the highlighted row.
    e.preventDefault();
    view.activateSelected();
  } else if (e.key === 'ArrowLeft') sideways(-1);
  else if (e.key === 'ArrowRight') sideways(1);
});
/** Whether a key press landed on a button or link of its own, which handles Enter itself. */
function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a[href]') !== null;
}
// A page in the background makes no buzz.
document.addEventListener('visibilitychange', () => {
  haptics.setActive(!document.hidden);
  music.setActive(!document.hidden);
});
document.addEventListener('pad-back', () => dispatch({ type: 'back' }));
document.addEventListener('pad-active', () => useDevice('gamepad'));
document.addEventListener(
  'pointerdown',
  (e) => useDevice(e.pointerType === 'touch' ? 'touch' : 'keyboard'),
  true,
);
document.addEventListener('pad-left', () => sideways(-1));
document.addEventListener('pad-right', () => sideways(1));

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

// The scenery behind the page: each stop's own, with a parallax slide as the carousel steps.
const sceneUrl = (name: string): URL => new URL(`launcher/scenes/${name}/`, location.href);
const [nightScene, teaserScene] = await Promise.all([
  loadJson<SceneInfo>(new URL('scene.json', sceneUrl('night'))),
  loadJson<SceneInfo>(new URL('scene.json', sceneUrl('teaser'))),
]);
const runnerOf = [...files.values()].find((f) => f.info?.runner);
// The music: each episode's main theme and, for one not out and App settings, the teaser score, crossfading as the
// carousel steps. It follows the Music, Style and Music version options.
const themes = new Map([...files].map(([id, f]) => [id, f.theme] as const));
const music = openLauncherMusic(libraryOf(themes), musicSettingsOf(options), host.kind !== 'web');
const stage = createStage(
  ui,
  () => ui.classList.contains('rm') || matchMedia('(prefers-reduced-motion: reduce)').matches,
);
/** The scenery of a stop: an episode's own, the teaser for one that is not out, and night for App settings. */
function sceneOf(stop: Stop): { info: SceneInfo; base: URL } | undefined {
  if (stop.kind === 'episode' && stop.playable) {
    const f = files.get(stop.id);
    if (f?.info?.scene) return { info: f.info.scene, base: f.base };
  }
  const shared = stop.kind === 'app' ? nightScene : teaserScene;
  if (shared) return { info: shared, base: sceneUrl(stop.kind === 'app' ? 'night' : 'teaser') };
  const first = [...files.values()].find((f) => f.info?.scene);
  return first?.info?.scene ? { info: first.info.scene, base: first.base } : undefined;
}
/** Shows the scenery of the stop on show, sliding the way the carousel stepped. */
function showScene(dir: -1 | 0 | 1): void {
  const stop = currentStop(state);
  const found = sceneOf(stop);
  if (!found) return;
  music.play(trackOf(stop, themes), dir === 0 ? 0 : undefined);
  stage.show(
    stop.kind === 'app' ? 'app' : `episode:${stop.id}`,
    () =>
      createScene(
        found.info,
        found.base,
        runnerOf?.info?.runner ? { art: runnerOf.info.runner, base: runnerOf.base } : undefined,
      ),
    dir,
  );
}

// The window's text scale, now and when it changes.
const scale = (): void => {
  applyLook();
  stage.resize(innerHeight, innerWidth);
  touch?.relayout();
  keepClearOfControls();
  view.relayout();
};
scale();
showRotate();
addEventListener('resize', () => {
  scale();
  showRotate();
});

// The saved Fullscreen option, applied once for this run of the app (the game applies it when it opens on its own).
let session: Storage | undefined;
try {
  session = sessionStorage;
} catch {
  /* no session storage */
}
if (
  fullscreen &&
  session &&
  shouldStartFullscreen({
    kind: host.kind,
    fullscreen: options.fullscreen,
    session,
  })
) {
  void fullscreen.enter({ fullscreen: true, lock: false });
}

touch = createLauncherTouch({
  layer: touchLayer,
  store,
  hasBack: () => hasBack(state),
  onGutters: keepClearOfControls,
  act: (action) => {
    if (action.kind === 'step') view.step(action.dir);
    else if (action.kind === 'stop') sideways(action.dir);
    else if (action.kind === 'select') view.activateSelected();
    else dispatch({ type: 'back' });
  },
});
touch.setActive(device === 'touch');
const frame = (now: number): void => {
  // Ben on the logo: a hop and a pogo across it every so often, standing still under reduced motion.
  const seconds = performance.now() / 1000;
  const box = view.logoBox();
  const scale = benScale(innerHeight);
  view.setBen(
    box
      ? benFrame({ logoW: box.w, logoH: box.h, width: 16 * scale }, seconds - benT0, {
          reduced: ui.classList.contains('rm') || motionQuery.matches,
          waveLeft: Math.max(0, benWaveUntil - seconds),
          looking: benLookUntil > seconds,
        })
      : null,
    scale,
  );
  touch?.frame(now);
  haptics.flush();
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

const benOwner = [...files.values()].find((f) => f.info?.titleBen);
if (benOwner?.info?.titleBen) {
  const art = benOwner.info.titleBen;
  view.setBenArt({
    url: new URL(art.src, benOwner.base).href,
    width: art.width,
    height: art.height,
    poses: art.poses,
  });
}
applyTheme();
showScene(0);
scale();
view.render(state);
keepClearOfControls();
drawHints();
back.sync(hasBack(state));
