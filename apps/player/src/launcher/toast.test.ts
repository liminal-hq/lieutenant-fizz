// Tests for how the launcher picks where a message is shown.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  SHOW_COMMAND,
  SHOW_EVENT,
  createSnackbarQueue,
  createToast,
  type SnackbarView,
  type ToastDeps,
} from './toast';

function setup(
  kind: ToastDeps['kind'],
  opts: { invokeFails?: boolean; listenFails?: boolean } = {},
) {
  const log: string[] = [];
  let handler: ((e: { payload: { message?: unknown } }) => void) | undefined;
  const deps: ToastDeps = {
    kind,
    snackbar: (m, o) => log.push(`snackbar:${m}${o?.replace === false ? ':queued' : ''}`),
    invoke: async (cmd, args) => {
      log.push(`invoke:${cmd}:${JSON.stringify(args)}`);
      if (opts.invokeFails) throw new Error('no plugin');
    },
    listen: async (event, h) => {
      if (opts.listenFails) throw new Error('no events');
      log.push(`listen:${event}`);
      handler = h;
    },
  };
  return { deps, log, emit: (payload: { message?: unknown }) => handler?.({ payload }) };
}

describe('showing a message', () => {
  it('draws the snackbar on the web and on iOS, without calling the plugin', async () => {
    for (const kind of ['web', 'tauri-ios'] as const) {
      const { deps, log } = setup(kind);
      (await createToast(deps))('Hi');
      expect(log).toEqual(['snackbar:Hi']);
    }
  });

  it('draws the snackbar when there are no Tauri calls to make', async () => {
    const { deps, log } = setup('tauri-android');
    (await createToast({ ...deps, invoke: undefined, listen: undefined }))('Hi');
    expect(log).toEqual(['snackbar:Hi']);
  });

  it('asks the plugin for a native toast on Android', async () => {
    const { deps, log } = setup('tauri-android');
    (await createToast(deps))('Hi');
    await Promise.resolve();
    expect(log).toEqual([
      `invoke:${SHOW_COMMAND}:{"payload":{"message":"Hi","duration":"short","position":"bottom","replace":true}}`,
    ]);
  });

  it('asks the plugin on the desktop and draws the snackbar when its event comes back', async () => {
    const { deps, log, emit } = setup('tauri-desktop');
    (await createToast(deps))('Hi');
    emit({ message: 'Hi' });
    emit({ message: 7 });
    expect(log[0]).toBe(`listen:${SHOW_EVENT}`);
    expect(log.filter((l) => l.startsWith('invoke'))).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('snackbar'))).toEqual(['snackbar:Hi']);
  });

  it('passes replace: false on to the plugin and keeps it when falling back', async () => {
    const { deps, log } = setup('tauri-android');
    (await createToast(deps))('Hi', { replace: false });
    expect(log[0]).toContain('"replace":false');
    const failing = setup('tauri-android', { invokeFails: true });
    (await createToast(failing.deps))('Hi', { replace: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(failing.log).toContain('snackbar:Hi:queued');
  });

  it('falls back to the snackbar when the plugin fails or events cannot be heard', async () => {
    const failing = setup('tauri-android', { invokeFails: true });
    (await createToast(failing.deps))('Hi');
    await new Promise((r) => setTimeout(r, 0));
    expect(failing.log).toContain('snackbar:Hi');
    const deaf = setup('tauri-desktop', { listenFails: true });
    (await createToast(deaf.deps))('Hi');
    expect(deaf.log).toEqual(['snackbar:Hi']);
  });
});

/** A snackbar with timers the test winds on by hand. */
function queue() {
  const log: string[] = [];
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const view: SnackbarView = { show: (m) => log.push(`show:${m}`), hide: () => log.push('hide') };
  const toast = createSnackbarQueue(view, 1000, {
    set: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (id) => void timers.delete(id as number),
  });
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...timers]) {
      if (t.at <= now) {
        timers.delete(id);
        t.fn();
      }
    }
  };
  return { toast, log, advance };
}

describe('the snackbar queue', () => {
  it('replaces the message showing, so only the last of a run fades away', () => {
    const { toast, log, advance } = queue();
    toast('4 more');
    advance(100);
    toast('3 more');
    toast('2 more');
    expect(log).toEqual(['show:4 more', 'show:3 more', 'show:2 more']);
    advance(999);
    expect(log).toHaveLength(3);
    advance(1);
    expect(log.at(-1)).toBe('hide');
  });

  it('makes a message with replace: false wait its turn', () => {
    const { toast, log, advance } = queue();
    toast('first');
    toast('second', { replace: false });
    toast('third', { replace: false });
    expect(log).toEqual(['show:first']);
    advance(1000);
    expect(log).toEqual(['show:first', 'show:second']);
    advance(1000);
    expect(log).toEqual(['show:first', 'show:second', 'show:third']);
    advance(1000);
    expect(log.at(-1)).toBe('hide');
  });

  it('shows a replace: false message at once when nothing is up, and a replacing one drops the waiting', () => {
    const { toast, log, advance } = queue();
    toast('alone', { replace: false });
    expect(log).toEqual(['show:alone']);
    toast('waits', { replace: false });
    toast('wins');
    advance(5000);
    expect(log).toEqual(['show:alone', 'show:wins', 'hide']);
  });
});
