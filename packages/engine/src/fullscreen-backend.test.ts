// Tests for the web fullscreen backend, with a fake document and keyboard.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { webFullscreenBackend, type WebFullscreenDoc } from './fullscreen-backend';

/** A document whose fullscreen the test flips by hand; `flip()` fires `fullscreenchange`. */
function fakeDoc() {
  const listeners = new Set<() => void>();
  const doc = {
    fullscreenElement: null as Element | null,
    documentElement: {
      requestFullscreen: vi.fn(async () => {
        doc.fullscreenElement = {} as Element;
      }),
    },
    exitFullscreen: vi.fn(async () => {
      doc.fullscreenElement = null;
    }),
    addEventListener: (_: 'fullscreenchange', l: () => void) => void listeners.add(l),
    removeEventListener: (_: 'fullscreenchange', l: () => void) => void listeners.delete(l),
  };
  const flip = (): void => {
    for (const l of [...listeners]) l();
  };
  return { doc: doc as unknown as WebFullscreenDoc & typeof doc, flip, listeners };
}

const make = (opts: { keyboard?: object | undefined; touch?: boolean; secure?: boolean } = {}) => {
  const d = fakeDoc();
  const keyboard =
    'keyboard' in opts ? opts.keyboard : { lock: vi.fn(async () => {}), unlock: vi.fn() };
  const backend = webFullscreenBackend({
    doc: d.doc,
    orientation: undefined,
    keyboard: keyboard as never,
    secure: opts.secure ?? true,
    touch: () => opts.touch ?? false,
  });
  return {
    ...d,
    backend,
    keyboard: keyboard as { lock: ReturnType<typeof vi.fn>; unlock: ReturnType<typeof vi.fn> },
  };
};

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('webFullscreenBackend', () => {
  it('reports fullscreen from the document', async () => {
    const t = make();
    expect(t.backend.isFullscreen()).toBe(false);
    await t.backend.enter({ fullscreen: true, lock: false });
    expect(t.backend.isFullscreen()).toBe(true);
    expect(t.doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(await t.backend.exit()).toBe('ok');
    expect(t.backend.isFullscreen()).toBe(false);
    expect(await t.backend.exit()).toBe('skipped');
  });

  it('locks Esc when fullscreen starts, captures it once granted, and unlocks when it ends', async () => {
    const t = make();
    const seen = vi.fn();
    t.backend.onChange(seen);
    await t.backend.enter({ fullscreen: true, lock: false });
    t.flip();
    expect(t.backend.escapeCaptured).toBe(false);
    await settle();
    expect(t.keyboard.lock).toHaveBeenCalledWith(['Escape']);
    expect(t.backend.escapeCaptured).toBe(true);
    // Told once on the change and again when the lock was granted.
    expect(seen).toHaveBeenCalledTimes(2);
    await t.backend.exit();
    t.flip();
    expect(t.keyboard.unlock).toHaveBeenCalledTimes(1);
    expect(t.backend.escapeCaptured).toBe(false);
  });

  it('never captures Esc without the API, on a rejection, on touch or on an insecure page', async () => {
    const cases = [
      make({ keyboard: undefined }),
      make({
        keyboard: { lock: vi.fn(async () => Promise.reject(new Error('no'))), unlock: vi.fn() },
      }),
      make({ touch: true }),
      make({ secure: false }),
    ];
    for (const t of cases) {
      await t.backend.enter({ fullscreen: true, lock: false });
      t.flip();
      await settle();
      expect(t.backend.escapeCaptured).toBe(false);
      expect(t.backend.isFullscreen()).toBe(true);
    }
    expect(cases[2]!.keyboard.lock).not.toHaveBeenCalled();
    expect(cases[3]!.keyboard.lock).not.toHaveBeenCalled();
  });

  it('stops listening when disposed, and unsubscribes', async () => {
    const t = make();
    const seen = vi.fn();
    const off = t.backend.onChange(seen);
    off();
    await t.backend.enter({ fullscreen: true, lock: false });
    t.flip();
    expect(seen).not.toHaveBeenCalled();
    t.backend.dispose();
    expect(t.listeners.size).toBe(0);
  });
});
