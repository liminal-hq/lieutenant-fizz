// The launcher page: opens the store, keeps the state machine's state and hands its effects to the page.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { BackGuard } from '@lieutenant-fizz/engine/back-guard';
import { createHostBackend } from '@lieutenant-fizz/engine/host';
import { createPredictiveBack } from '@lieutenant-fizz/engine/predictive-back';
import { applyMenuScale } from '@lieutenant-fizz/engine/menu/scale-vars';
import {
  applyMenuTheme,
  bulletImageOf,
  themeOfData,
  type MenuThemeData,
} from '@lieutenant-fizz/engine/menu/theme';
import { createStorage } from '@lieutenant-fizz/engine/storage';
import { readUnlocked } from './dev-unlock';
import { createLauncherBack } from './back';
import { applyEffects } from './effects';
import { hasBack, initialState, reduce, type Action } from './state';
import { createSnackbar, createToast, type ToastDeps } from './toast';
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
let state = initialState(readUnlocked(store));

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
  releaseBack: () => back.release(),
};

const dispatch = (action: Action): void => {
  const step = reduce(state, action);
  const changed = step.state !== state;
  state = step.state;
  if (changed) draw();
  back.sync(hasBack(state));
  void applyEffects(step.effects, deps);
};

const view = createView(root, (row) => dispatch({ type: 'activate', row }));
const draw = (): void => view.render(state);

// Back from the keyboard, and from the gamepad's B (menu.ts passes it on as `pad-back`).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Backspace') dispatch({ type: 'back' });
});
document.addEventListener('pad-back', () => dispatch({ type: 'back' }));

// The window's text scale, now and when it changes.
const scale = (): void => applyMenuScale(document.documentElement, innerWidth, innerHeight);
scale();
addEventListener('resize', scale);

draw();
back.sync(hasBack(state));

// Episode 1's menu look, written out at build time for the launcher (`scripts/build-launcher-art.ts`). Without it the
// menus keep the defaults and have no bullet.
try {
  const url = new URL('launcher/episode-1/theme.json', location.href);
  const data = (await (await fetch(url)).json()) as MenuThemeData;
  applyMenuTheme(document.documentElement, themeOfData(data));
  view.setBullet(data.bullet ? bulletImageOf(data, new URL(data.bullet.src, url).href) : undefined);
} catch (error) {
  console.warn('The menu theme could not be loaded', error);
}
