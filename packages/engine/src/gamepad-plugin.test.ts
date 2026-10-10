// Tests for the gamepad plugin backend with a fake plugin.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { fakeBackend, type HapticBackend, type RumblePad } from './haptic-backends';
import type { HapticPattern } from './haptic-pattern';
import {
  adoptGamepadPlugin,
  choosePad,
  framesOf,
  gamepadPluginBackend,
  matchPads,
  parseGamepadId,
  pluginPadApi,
  type MotorFrame,
  type NativePad,
  type PadApi,
} from './gamepad-plugin';

const ds3: NativePad = {
  id: 'gamepad:0',
  slot: 0,
  name: 'Sony PLAYSTATION(R)3 Controller',
  vendorId: 0x054c,
  productId: 0x0268,
  topTier: 2,
};
const xbox: NativePad = {
  id: 'gamepad:1',
  slot: 1,
  name: 'Xbox Wireless Controller',
  vendorId: 0x045e,
  productId: 0x0b13,
  topTier: 2,
};
const DS3_WEB = { id: '054c-0268-Sony PLAYSTATION(R)3 Controller' };

const thump: HapticPattern = {
  events: [
    { kind: 'transient', at: 0, intensity: 1, sharpness: 0 },
    { kind: 'transient', at: 200, intensity: 1, sharpness: 1 },
  ],
};

interface FakeApi extends PadApi {
  pads: NativePad[];
  plays: { padId: string; frames: MotorFrame[] }[];
  stops: (string | undefined)[];
  identified: string[];
  /** Fires the pad event, as the plugin does on a hot-plug. */
  emit(): void;
  unlistened: number;
}

function fakeApi(pads: NativePad[], opts: { failList?: boolean } = {}): FakeApi {
  const subs = new Set<() => void>();
  const api: FakeApi = {
    pads,
    plays: [],
    stops: [],
    identified: [],
    unlistened: 0,
    listPads: () =>
      opts.failList ? Promise.reject(new Error('denied')) : Promise.resolve([...api.pads]),
    playFrames(padId, frames) {
      api.plays.push({ padId, frames });
      return Promise.resolve({ tier: 2 });
    },
    identify(padId) {
      api.identified.push(padId);
      return Promise.resolve({ tier: 2 });
    },
    stop(padId) {
      api.stops.push(padId);
      return Promise.resolve();
    },
    onPads(fn) {
      subs.add(fn);
      return Promise.resolve(() => {
        subs.delete(fn);
        api.unlistened++;
      });
    },
    emit: () => subs.forEach((f) => f()),
  };
  return api;
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function setup(pads: NativePad[], web: RumblePad | null = null) {
  const api = fakeApi(pads);
  const fallback = fakeBackend({ target: 'controller' });
  let current = web;
  const backend = gamepadPluginBackend(fallback, () => current, { api });
  return { api, fallback, backend, setWeb: (p: RumblePad | null) => (current = p) };
}

describe('parseGamepadId and matchPads', () => {
  it('reads Chromium and Firefox ids', () => {
    expect(parseGamepadId('Pad (STANDARD GAMEPAD Vendor: 054c Product: 0268)')).toEqual({
      vendorId: 0x054c,
      productId: 0x0268,
    });
    expect(parseGamepadId('054c-0268-Name')).toEqual({ vendorId: 0x054c, productId: 0x0268 });
    expect(parseGamepadId('Wireless Controller')).toBeUndefined();
  });

  it('falls back to the name when the id has no numbers', () => {
    expect(matchPads([ds3, xbox], { id: 'Xbox Wireless Controller' })).toEqual([xbox]);
  });
});

describe('choosePad', () => {
  it('plays the native twin of the pad in use', () => {
    expect(choosePad([ds3, xbox], DS3_WEB)).toEqual({ kind: 'native', pad: ds3 });
  });

  it('takes the first native pad that can play when the webview lists none', () => {
    const mute = { ...ds3, topTier: 0, reason: 'No write access' };
    expect(choosePad([mute, xbox], null)).toEqual({ kind: 'native', pad: xbox });
  });

  it('leaves a pad the plugin cannot address to the webview', () => {
    expect(choosePad([xbox], DS3_WEB)).toEqual({ kind: 'web' });
    expect(choosePad([], DS3_WEB)).toEqual({ kind: 'web' });
  });

  it('does not play a listed pad it cannot drive through the webview either', () => {
    expect(choosePad([{ ...ds3, topTier: 0 }], DS3_WEB)).toEqual({ kind: 'none' });
  });

  it('breaks a tie between identical pads by slot', () => {
    const twin = { ...ds3, id: 'gamepad:2', slot: 2 };
    expect(choosePad([twin, ds3], DS3_WEB)).toEqual({ kind: 'native', pad: ds3 });
  });

  it('chooses nothing with no pads at all', () => {
    expect(choosePad([], null)).toEqual({ kind: 'none' });
  });
});

describe('framesOf', () => {
  it('maps strong to heavy and weak to light, with a silent frame in each gap', () => {
    const frames = framesOf([
      { at: 0, duration: 80, strong: 1, weak: 0 },
      { at: 200, duration: 80, strong: 0, weak: 1 },
    ]);
    expect(frames).toEqual([
      { durationMs: 80, heavy: 1, light: 0 },
      { durationMs: 120, heavy: 0, light: 0 },
      { durationMs: 80, heavy: 0, light: 1 },
    ]);
  });

  it('keeps whole milliseconds and levels inside 0 to 1', () => {
    const [f] = framesOf([{ at: 0, duration: 40.4, strong: 1.2, weak: -0.1 }]);
    expect(f).toEqual({ durationMs: 40, heavy: 1, light: 0 });
  });
});

describe('gamepadPluginBackend', () => {
  it('plays a cue as frames on the native pad and not through the webview', async () => {
    const { api, fallback, backend } = setup([ds3], { id: DS3_WEB.id });
    await backend.ready;
    const r = backend.play(thump, 1);
    expect(r).toMatchObject({ ok: true, tier: 2, target: 'controller' });
    expect(r.ms).toBeGreaterThan(200);
    expect(api.plays).toHaveLength(1);
    expect(api.plays[0]?.padId).toBe('gamepad:0');
    expect(
      api.plays[0]?.frames.map((f) => f.durationMs).every((d) => Number.isInteger(d) && d > 0),
    ).toBe(true);
    expect(fallback.plays).toHaveLength(0);
  });

  it('applies the strength it is given to the frames', async () => {
    const { api, backend } = setup([ds3]);
    await backend.ready;
    backend.play(thump, 0.5);
    expect(api.plays[0]?.frames[0]?.heavy).toBeLessThanOrEqual(0.5);
  });

  it('hands a pad the plugin cannot reach to the webview backend', async () => {
    const { api, fallback, backend } = setup([xbox], { id: DS3_WEB.id });
    await backend.ready;
    backend.play(thump, 1);
    expect(api.plays).toHaveLength(0);
    expect(fallback.plays).toHaveLength(1);
  });

  it('is a quiet no-op without a pad', async () => {
    const { api, fallback, backend } = setup([]);
    await backend.ready;
    expect(backend.caps().available).toBe(false);
    const r = backend.play(thump, 1);
    expect(r.ok).toBe(false);
    expect(api.plays).toHaveLength(0);
    expect(fallback.plays).toHaveLength(0);
    expect(() => backend.stop()).not.toThrow();
    expect(api.stops).toHaveLength(0);
  });

  it('is a no-op, not an error, when the plugin cannot be read', async () => {
    const api = fakeApi([ds3], { failList: true });
    const backend = gamepadPluginBackend(fakeBackend({ target: 'controller' }), () => null, {
      api,
    });
    await expect(backend.ready).resolves.toEqual([]);
    expect(backend.play(thump, 1).ok).toBe(false);
  });

  it('follows a pad being plugged in and unplugged', async () => {
    const { api, backend } = setup([]);
    await backend.ready;
    const seen: number[] = [];
    backend.onPads((p) => seen.push(p.length));
    expect(backend.caps().available).toBe(false);

    api.pads = [ds3];
    api.emit();
    await settle();
    expect(seen).toEqual([1]);
    expect(backend.caps()).toMatchObject({ available: true, target: 'controller', name: ds3.name });
    backend.play(thump, 1);
    expect(api.plays).toHaveLength(1);

    api.pads = [];
    api.emit();
    await settle();
    expect(seen).toEqual([1, 0]);
    expect(backend.play(thump, 1).ok).toBe(false);
    expect(api.plays).toHaveLength(1);
  });

  it('stops the pad it played, and the webview pad when that played', async () => {
    const { api, fallback, backend, setWeb } = setup([ds3], { id: DS3_WEB.id });
    await backend.ready;
    backend.play(thump, 1);
    backend.stop();
    expect(api.stops).toEqual(['gamepad:0']);
    backend.stop();
    expect(api.stops).toHaveLength(1);

    setWeb({ id: 'Other pad' });
    backend.play(thump, 1);
    expect(fallback.plays).toHaveLength(1);
    backend.stop();
    expect(fallback.stops).toBe(1);
  });

  it('stops the webview pad before the native one plays, so one pad has one writer', async () => {
    const { fallback, backend, setWeb } = setup([ds3]);
    await backend.ready;
    setWeb({ id: 'Other pad' });
    backend.play(thump, 1);
    expect(fallback.plays).toHaveLength(1);
    setWeb({ id: DS3_WEB.id });
    backend.play(thump, 1);
    expect(fallback.stops).toBe(1);
  });

  it('passes rumble tuning to the compiler and the webview backend', async () => {
    const { api, fallback, backend } = setup([ds3]);
    await backend.ready;
    backend.tuneRumble?.({ tapBase: 100, tapSpan: 0 });
    backend.play({ events: [{ kind: 'transient', at: 0, intensity: 1, sharpness: 0 }] }, 1);
    expect(api.plays[0]?.frames[0]?.durationMs).toBe(100);
    expect(fallback.tunedRumble).toEqual([{ tapBase: 100, tapSpan: 0 }]);
  });

  it('identifies a pad, and reports a failure instead of throwing', async () => {
    const { api, backend } = setup([ds3]);
    await backend.ready;
    await backend.identify('gamepad:0');
    expect(api.identified).toEqual(['gamepad:0']);
    api.identify = () => Promise.reject(new Error('no pad'));
    await expect(backend.identify('gamepad:9')).resolves.toMatchObject({ ok: false });
  });

  it('stops listening and disposes the fallback on dispose', async () => {
    const { api, fallback, backend } = setup([ds3]);
    await backend.ready;
    await settle();
    backend.dispose();
    expect(api.unlistened).toBe(1);
    expect(fallback.stops).toBe(0);
  });
});

describe('adoptGamepadPlugin', () => {
  it('installs the backend as the controller inside the desktop app', () => {
    const set: { controller?: HapticBackend }[] = [];
    const host = { setBackends: (b: { controller?: HapticBackend }) => set.push(b) };
    const fallback = fakeBackend({ target: 'controller' });
    const b = adoptGamepadPlugin(host, fallback, () => null, true, { api: fakeApi([ds3]) });
    expect(b).not.toBeNull();
    expect(set[0]?.controller).toBe(b);
  });

  it('leaves the backend in place anywhere else', () => {
    const set: unknown[] = [];
    const host = { setBackends: (b: unknown) => set.push(b) };
    const b = adoptGamepadPlugin(host, fakeBackend(), () => null, false, { api: fakeApi([ds3]) });
    expect(b).toBeNull();
    expect(set).toHaveLength(0);
  });
});

describe('pluginPadApi', () => {
  it('calls the plugin by command name with the shapes it expects', async () => {
    const calls: [string, unknown][] = [];
    const subs: string[] = [];
    const api = pluginPadApi({
      invoke: (cmd, args) => {
        calls.push([cmd, args]);
        return Promise.resolve([]);
      },
      listen: (event) => {
        subs.push(event);
        return Promise.resolve(() => {});
      },
    });
    await api.listPads();
    await api.playFrames('gamepad:0', [{ durationMs: 10, heavy: 1, light: 0 }]);
    await api.identify('gamepad:0');
    await api.stop();
    await api.stop('gamepad:0');
    await api.onPads(() => {});
    expect(calls).toEqual([
      ['plugin:gamepad-haptics|list_pads', undefined],
      [
        'plugin:gamepad-haptics|play_frames',
        { args: { padId: 'gamepad:0', frames: [{ durationMs: 10, heavy: 1, light: 0 }] } },
      ],
      ['plugin:gamepad-haptics|identify', { padId: 'gamepad:0' }],
      ['plugin:gamepad-haptics|stop', {}],
      ['plugin:gamepad-haptics|stop', { padId: 'gamepad:0' }],
    ]);
    expect(subs).toEqual([
      'gamepad-haptics://connected',
      'gamepad-haptics://changed',
      'gamepad-haptics://disconnected',
    ]);
  });
});
