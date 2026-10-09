// Tests for the Esc keyboard lock.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { createEscLock, type KeyboardLockLike } from './keyboard-lock';

const fake = (lock: KeyboardLockLike['lock'] = async () => {}) => {
  const keyboard = { lock: vi.fn(lock), unlock: vi.fn() };
  return { keyboard, env: { keyboard, secure: true } };
};

describe('createEscLock', () => {
  it('locks Esc on enter and is held once the browser agrees', async () => {
    const { keyboard, env } = fake();
    const l = createEscLock(env);
    expect(l.held).toBe(false);
    expect(await l.engage(false)).toBe('ok');
    expect(keyboard.lock).toHaveBeenCalledWith(['Escape']);
    expect(l.held).toBe(true);
  });

  it('is not held while the request is pending', async () => {
    let grant: () => void = () => {};
    const { env } = fake(() => new Promise<void>((r) => (grant = r)));
    const l = createEscLock(env);
    const p = l.engage(false);
    expect(l.held).toBe(false);
    grant();
    await p;
    expect(l.held).toBe(true);
  });

  it('unlocks on exit, and not when nothing was held', async () => {
    const { keyboard, env } = fake();
    const l = createEscLock(env);
    l.release();
    expect(keyboard.unlock).not.toHaveBeenCalled();
    await l.engage(false);
    l.release();
    expect(keyboard.unlock).toHaveBeenCalledTimes(1);
    expect(l.held).toBe(false);
    l.release();
    expect(keyboard.unlock).toHaveBeenCalledTimes(1);
  });

  it('asks once while held or pending', async () => {
    const { keyboard, env } = fake();
    const l = createEscLock(env);
    const a = l.engage(false);
    const b = l.engage(false);
    await Promise.all([a, b]);
    await l.engage(false);
    expect(keyboard.lock).toHaveBeenCalledTimes(1);
  });

  it('undoes a lock granted after the release', async () => {
    let grant: () => void = () => {};
    const { keyboard, env } = fake(() => new Promise<void>((r) => (grant = r)));
    const l = createEscLock(env);
    const p = l.engage(false);
    l.release();
    grant();
    await p;
    expect(l.held).toBe(false);
    expect(keyboard.unlock).toHaveBeenCalledTimes(1);
  });

  it('reports unsupported without the API, and never holds', async () => {
    expect(await createEscLock({ keyboard: undefined, secure: true }).engage(false)).toBe(
      'unsupported',
    );
    expect(await createEscLock({ keyboard: {}, secure: true }).engage(false)).toBe('unsupported');
    const l = createEscLock({ keyboard: {}, secure: true });
    await l.engage(false);
    expect(l.held).toBe(false);
    expect(() => l.release()).not.toThrow();
  });

  it('survives a rejected promise and a throw, and can try again', async () => {
    const { env } = fake(() => Promise.reject(new Error('no')));
    const l = createEscLock(env);
    expect(await l.engage(false)).toBe('denied');
    expect(l.held).toBe(false);
    const t = createEscLock({
      keyboard: {
        lock: () => {
          throw new Error('sync');
        },
      },
      secure: true,
    });
    expect(await t.engage(false)).toBe('denied');
    expect(t.held).toBe(false);
    let calls = 0;
    const retry = fake(() => (++calls === 1 ? Promise.reject(new Error('x')) : Promise.resolve()));
    const r = createEscLock(retry.env);
    expect(await r.engage(false)).toBe('denied');
    expect(await r.engage(false)).toBe('ok');
  });

  it('does nothing on touch or an insecure page', async () => {
    const a = fake();
    expect(await createEscLock(a.env).engage(true)).toBe('skipped');
    expect(a.keyboard.lock).not.toHaveBeenCalled();
    const b = fake();
    expect(await createEscLock({ ...b.env, secure: false }).engage(false)).toBe('skipped');
    expect(b.keyboard.lock).not.toHaveBeenCalled();
  });
});
