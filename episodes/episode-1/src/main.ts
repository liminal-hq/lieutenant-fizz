// Browser entry point that mounts the Episode 1 game on the stage element.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Imported first: ES modules evaluate in import order, so the log bridge is up before any other module loads.
import './log-boot';
import { createHostBackend, type HostBackend } from '@lieutenant-fizz/engine/host';
import {
  createPredictiveBack,
  type PredictiveBackBackend,
} from '@lieutenant-fizz/engine/predictive-back';
import {
  fakeNativeWindow,
  nativeFullscreenBackend,
} from '@lieutenant-fizz/engine/native-fullscreen';
import {
  parseFullscreenParam,
  parseHostParam,
  parseWakeParam,
} from '@lieutenant-fizz/engine/lifecycle-policy';
import { parseAudioParam } from '@lieutenant-fizz/engine/sound-field';
import { createStorage } from '@lieutenant-fizz/engine/storage';
import { Game } from './game';
import { parseHapticsParam, parsePixelsParam } from './url-lock';

const stage = document.getElementById('stage');
if (!stage) throw new Error('missing #stage');

const query = new URLSearchParams(location.search);

// `?pixels=sharp` draws at a whole pixel scale, `?pixels=soft` keeps the fractional one and `?pixels=fast`
// draws the Sharp view with one canvas pixel per sprite pixel. `auto` and anything else leave the choice
// to the device (touch is Sharp, desktop is Soft).
const pixelsParam = parsePixelsParam(query.get('pixels'));
const pixels = pixelsParam && pixelsParam !== 'auto' ? pixelsParam : undefined;

// Sound effects are placed in the stereo field (Enhanced) unless `?audio=classic` keeps the sound as
// it has always been. `?audio=enhanced` is the default spelled out. Anything else leaves the default.
const audio = parseAudioParam(query.get('audio'));

// `?title=split` tries the phone title with the logo and the menu on opposite sides.
const title = query.get('title') === 'split' ? 'split' : undefined;

// Haptics (the phone's vibration and a controller's rumble) are on where the device has them. `?haptics`
// (or `?haptics=on`) forces them on and `?haptics=off` forces them off, for this visit only.
const haptics = parseHapticsParam(query.get('haptics'));

// `?fullscreen` (or `=on`) asks for fullscreen on every device when a run starts, `?fullscreen=off` never
// does; left out, touch devices do. `?debug&host=app` pretends to be the native app.
const fullscreen = parseFullscreenParam(query.get('fullscreen'));
// `?debug&host=fake-desktop` pretends to be the desktop app with a window that has no OS behind it, and counts
// Quit game in `window.__lfQuits` instead of closing the page, so the desktop menus can be tried and tested.
const fakeDesktop = query.has('debug') && query.get('host') === 'fake-desktop';
const fakeAndroid = query.has('debug') && query.get('host') === 'fake-android';
const host =
  fakeDesktop || fakeAndroid ? 'app' : parseHostParam(query.get('host'), query.has('debug'));
// `?wake=off` never keeps the screen on, `?wake` (or `=on`) does while playing; left out, it is on.
const wake = parseWakeParam(query.get('wake'));

// The desktop app has Quit to launcher, Quit game and a native window to take fullscreen; Android has Quit to
// launcher; the web has none of them. `?debug&host=fake-android` is the Android app, which has no Quit game.
// The fakes count the quits in `window.__lfQuits` and `window.__lfLauncherLeaves` instead of leaving the page.
// `window.__lfBackLog` records, in order, each `setCanGoBack` the fake Android host is told and each launcher leave.
const logBack = (entry: string): void => {
  const w = window as unknown as { __lfBackLog?: string[] };
  (w.__lfBackLog ??= []).push(entry);
};
const count = (key: '__lfQuits' | '__lfLauncherLeaves'): void => {
  const w = window as unknown as Record<string, number | undefined>;
  w[key] = (w[key] ?? 0) + 1;
};
const hostBackend: HostBackend = fakeDesktop
  ? {
      kind: 'tauri-desktop',
      quit: async () => count('__lfQuits'),
      quitToLauncher: () => count('__lfLauncherLeaves'),
    }
  : fakeAndroid
    ? {
        kind: 'tauri-android',
        quitToLauncher: () => {
          logBack('leave');
          count('__lfLauncherLeaves');
        },
      }
    : createHostBackend();
// The Android app hands Back to the game through the predictive-back plugin; no other host has it.
const fakePredictiveBack: PredictiveBackBackend = {
  setCanGoBack: async (can) => logBack(`canGoBack:${can}`),
  onInvoked: async () => () => {},
};
const predictiveBack = fakeAndroid ? fakePredictiveBack : createPredictiveBack(hostBackend.kind);
const fullscreenBackend =
  hostBackend.kind === 'tauri-desktop'
    ? await nativeFullscreenBackend(fakeDesktop ? fakeNativeWindow() : undefined)
    : undefined;

// `?back` makes the browser's Back button the game's in an ordinary tab, to try it without fullscreen.

// Saves and settings live in the app's store file inside the Tauri app and in `localStorage` on the web. The
// store is read in full before the game starts, so the game's reads stay synchronous.
const storage = await createStorage({
  onError: (kind, error) => console.warn(`The ${kind} storage is unavailable`, error),
});

Game.start(stage, {
  storage,
  hostBackend,
  ...(predictiveBack ? { predictiveBack } : {}),
  ...(fullscreenBackend ? { fullscreenBackend } : {}),
  previewStinger: query.has('previewStinger'),
  touch: query.has('touch'),
  back: query.has('back'),
  ...(haptics ? { haptics } : {}),
  ...(pixels ? { pixels } : {}),
  ...(audio ? { audio } : {}),
  ...(title ? { title } : {}),
  ...(fullscreen ? { fullscreen } : {}),
  ...(host ? { host } : {}),
  ...(wake ? { wake } : {}),
})
  .then((game) => {
    if (query.has('debug')) {
      (window as unknown as { __lf: Game }).__lf = game;
      game.debugPerf();
      // The labs: a Lab button for auditioning and tuning the sound and the haptics. `?debug&lab` opens
      // the sound lab and `?debug&lab=haptics` the haptics lab.
      void game.debugLab(query.get('lab') === 'haptics' ? 'haptics' : query.has('lab'));
      // `?debug&level=N` starts straight in level N, so a phone can show a level without a keyboard.
      const level = query.get('level');
      if (level !== null) game.debugEnterLevel(Number.parseInt(level, 10));
    }
  })
  .catch(() => {
    /* the overlay already shows the error */
  });
