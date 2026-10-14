// The launcher's menu haptics: the phone buzzes (and a pad rumbles) as the menu sounds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { gamepadBackend, vibrateBackend } from '@lieutenant-fizz/engine/haptic-backends';
import { strengthScale } from '@lieutenant-fizz/engine/haptic-strength';
import { GameHaptics, routeFor, type Route } from '@lieutenant-fizz/engine/haptics';
import type { HapticTable } from '@lieutenant-fizz/engine/haptic-pattern';
import type { HostKind } from '@lieutenant-fizz/engine/host';
import type { InputDevice } from '@lieutenant-fizz/engine/input';
import type { MenuCue, MenuHaptics } from '@lieutenant-fizz/engine/menu/sounds';
import type { MenuThemeData } from '@lieutenant-fizz/engine/menu/theme';
import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';
import { readTouchSettings } from '@lieutenant-fizz/engine/touch-settings';

/** The menu's haptics, and a way to let go of what they use. */
export interface LauncherHaptics {
  cue(cue: MenuCue): void;
  /** Plays the cues raised since the last frame (the strongest for each target). Call once a frame. */
  flush(): void;
  /** The device in use changed: a pad in use takes the cues, otherwise the phone does. */
  setDevice(device: InputDevice): void;
  /** The controller's rumble level changed, 0 (Off) to 3 (Strong). */
  setRumble(level: number): void;
  /** The page went to the background or came back. */
  setActive(on: boolean): void;
  dispose(): void;
}

/** No haptics. */
export const NO_HAPTICS: LauncherHaptics = {
  cue: () => {},
  flush: () => {},
  setDevice: () => {},
  setRumble: () => {},
  setActive: () => {},
  dispose: () => {},
};

/**
 * The strength of each target. The phone's comes from the touch settings and counts only where a touch screen
 * is (a desktop's own WebView cannot vibrate); the controller's is the Rumble option.
 */
export function hapticScales(input: {
  touchCapable: boolean;
  phoneStrength: number;
  rumbleLevel: number;
}): { device: number; controller: number } {
  return {
    device: input.touchCapable ? strengthScale(input.phoneStrength) : 0,
    controller: strengthScale(input.rumbleLevel),
  };
}

/** The parts of `GameHaptics` the menu uses, so a test can stand in. */
export interface HapticsHost {
  cue(id: string): void;
  flush(): void;
  setRoute(route: Route): void;
  setActive(on: boolean): void;
}

/** Plays a menu cue as the haptic cue the episode named for it, and nothing for a cue it left out. */
export function createMenuHaptics(host: HapticsHost, cues: MenuHaptics): LauncherHaptics {
  return {
    cue(cue) {
      const id = cues[cue];
      if (id) host.cue(id);
    },
    flush() {
      host.flush();
    },
    setDevice(device) {
      host.setRoute(routeFor(device));
    },
    setRumble() {},
    setActive(on) {
      host.setActive(on);
    },
    dispose() {
      host.setActive(false);
    },
  };
}

export interface LauncherHapticsDeps {
  data: MenuThemeData;
  /** Where the player's touch settings are kept (the phone's strength). */
  store: Pick<KeyValueStorage, 'getItem'>;
  /** The controller's rumble level, 0 (Off) to 3 (Strong): the app-wide Rumble option. */
  rumble: number;
  kind: HostKind;
  /** The device has a touch screen (a phone, or a laptop with one). */
  touchCapable: boolean;
  /** The pad in use, for rumble. */
  activePad(): Gamepad | null;
}

/**
 * The menu's haptics for a theme. The phone's vibrator through the plugin inside the app (the page's own
 * `navigator.vibrate` until it loads, and on the web); on the desktop app a pad rumbles through the gamepad plugin.
 * Silent when the theme has none.
 */
export function createLauncherHaptics(deps: LauncherHapticsDeps): LauncherHaptics {
  const theme = deps.data.haptics;
  if (!theme) return NO_HAPTICS;
  const table: HapticTable = theme.table;
  const host = new GameHaptics(table, performance);
  const webPad = gamepadBackend(deps.activePad);
  host.setBackends({ device: vibrateBackend(navigator), controller: webPad });
  const scales = hapticScales({
    touchCapable: deps.touchCapable,
    phoneStrength: readTouchSettings(deps.store as KeyValueStorage).hapticStrength,
    rumbleLevel: deps.rumble,
  });
  host.setScale(scales.device, scales.controller);
  let disposed = false;
  // Inside the app the plugin's vibrator replaces `navigator.vibrate` once it reports one, and on the desktop the
  // gamepad plugin rumbles the pad natively. Each is its own chunk, loaded only there.
  if (deps.kind === 'tauri-desktop') {
    void import('@lieutenant-fizz/engine/gamepad-plugin')
      .then(({ adoptGamepadPlugin }) => {
        if (!disposed) adoptGamepadPlugin(host, webPad, deps.activePad, true);
      })
      .catch(() => {});
  }
  if (deps.kind !== 'web') {
    void import('@lieutenant-fizz/engine/haptic-plugin')
      .then(async ({ adoptPlugin, pluginBackend }) => {
        const plugin = pluginBackend();
        if (disposed) {
          plugin.dispose();
          return;
        }
        await adoptPlugin(host, plugin, true);
      })
      .catch(() => {});
  }
  const menu = createMenuHaptics(host, theme.cues);
  return {
    ...menu,
    setRumble(level) {
      host.setScale(scales.device, strengthScale(level));
    },
    dispose() {
      disposed = true;
      menu.dispose();
    },
  };
}
