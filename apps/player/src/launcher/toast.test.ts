// Tests for how the launcher picks where a message is shown.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { SHOW_COMMAND, SHOW_EVENT, createToast, type ToastDeps } from './toast';

function setup(
  kind: ToastDeps['kind'],
  opts: { invokeFails?: boolean; listenFails?: boolean } = {},
) {
  const log: string[] = [];
  let handler: ((e: { payload: { message?: unknown } }) => void) | undefined;
  const deps: ToastDeps = {
    kind,
    snackbar: (m) => log.push(`snackbar:${m}`),
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
      `invoke:${SHOW_COMMAND}:{"payload":{"message":"Hi","duration":"short","position":"bottom"}}`,
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
