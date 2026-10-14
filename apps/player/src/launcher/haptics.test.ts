// Tests for the launcher's menu haptics.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { MENU_CUES } from '@lieutenant-fizz/engine/menu/sounds';
import { NO_HAPTICS, createMenuHaptics, hapticScales, type HapticsHost } from './haptics';

function fakeHost() {
  const log: string[] = [];
  const host: HapticsHost = {
    cue: (id) => void log.push(`cue:${id}`),
    flush: () => void log.push('flush'),
    setRoute: (r) => void log.push(`route:${r}`),
    setActive: (on) => void log.push(`active:${on}`),
  };
  return { host, log };
}

describe('the menu cues as haptic cues', () => {
  it('plays the haptic cue the episode named for each menu cue, and nothing for one it left out', () => {
    const { host, log } = fakeHost();
    const menu = createMenuHaptics(host, {
      move: 'ui.move',
      select: 'ui.select',
      change: 'ui.toggleOn',
    });
    for (const cue of MENU_CUES) menu.cue(cue);
    expect(log).toEqual(['cue:ui.move', 'cue:ui.select', 'cue:ui.toggleOn']);
  });

  it('plays what was raised when it is flushed, once a frame', () => {
    const { host, log } = fakeHost();
    const menu = createMenuHaptics(host, { move: 'ui.move' });
    menu.cue('move');
    menu.flush();
    expect(log).toEqual(['cue:ui.move', 'flush']);
  });

  it('sends the cues to the pad while a pad is the device in use, and to the phone otherwise', () => {
    const { host, log } = fakeHost();
    const menu = createMenuHaptics(host, {});
    menu.setDevice('gamepad');
    menu.setDevice('touch');
    menu.setDevice('keyboard');
    expect(log).toEqual(['route:controller', 'route:device', 'route:device']);
  });

  it('goes quiet when the page is hidden or disposed', () => {
    const { host, log } = fakeHost();
    const menu = createMenuHaptics(host, {});
    menu.setActive(false);
    menu.setActive(true);
    menu.dispose();
    expect(log).toEqual(['active:false', 'active:true', 'active:false']);
    expect(() => NO_HAPTICS.cue('move')).not.toThrow();
  });
});

describe('the strength of the haptics', () => {
  it('uses the touch settings for the phone only where there is a touch screen, and Rumble for the pad', () => {
    expect(hapticScales({ touchCapable: true, phoneStrength: 3, rumbleLevel: 2 })).toEqual({
      device: 1,
      controller: 0.75,
    });
    expect(hapticScales({ touchCapable: false, phoneStrength: 3, rumbleLevel: 1 })).toEqual({
      device: 0,
      controller: 0.5,
    });
    expect(hapticScales({ touchCapable: true, phoneStrength: 0, rumbleLevel: 0 })).toEqual({
      device: 0,
      controller: 0,
    });
  });
});
