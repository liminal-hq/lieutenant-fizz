// Tests for the console bridge to the Tauri log plugin, against a fake console, window and plugin.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  extractCallSite,
  initTauriLogging,
  MAX_PENDING,
  serialiseConsoleArg,
  type ConsoleLike,
  type PluginLogLike,
} from './tauri-log';

describe('serialiseConsoleArg', () => {
  it('writes strings, numbers, booleans, null and undefined plainly', () => {
    expect(serialiseConsoleArg('hi')).toBe('hi');
    expect(serialiseConsoleArg(4.5)).toBe('4.5');
    expect(serialiseConsoleArg(false)).toBe('false');
    expect(serialiseConsoleArg(null)).toBe('null');
    expect(serialiseConsoleArg(undefined)).toBe('undefined');
  });

  it('writes an error as its stack, or name and message without one', () => {
    const error = new Error('boom');
    expect(serialiseConsoleArg(error)).toContain('boom');
    const bare = new Error('bare');
    bare.stack = undefined;
    expect(serialiseConsoleArg(bare)).toBe('Error: bare');
  });

  it('writes objects as JSON and marks circular references', () => {
    expect(serialiseConsoleArg({ a: 1 })).toBe('{"a":1}');
    const loop: Record<string, unknown> = { name: 'loop' };
    loop.self = loop;
    expect(serialiseConsoleArg(loop)).toBe('{"name":"loop","self":"[Circular]"}');
  });

  it('writes bigint, bare or inside an object', () => {
    expect(serialiseConsoleArg(12n)).toBe('12n');
    expect(serialiseConsoleArg({ big: 7n })).toBe('{"big":"7n"}');
  });

  it('falls back to a marker for what cannot be written, and never throws', () => {
    const hostile = {
      toJSON() {
        throw new Error('no');
      },
    };
    expect(serialiseConsoleArg(hostile)).toBe('[unserialisable Object]');
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error('trap');
        },
        getPrototypeOf() {
          throw new Error('trap');
        },
      },
    );
    expect(() => serialiseConsoleArg(proxy)).not.toThrow();
    expect(serialiseConsoleArg(Symbol('s'))).toBe('Symbol(s)');
    expect(serialiseConsoleArg(function named() {})).toBe('[Function named]');
  });
});

describe('extractCallSite', () => {
  it('reads the caller from a V8 stack', () => {
    const stack = 'Error\n    at wrapper (http://x/a.js:1:1)\n    at play (http://x/game.js:42:9)';
    expect(extractCallSite(stack)).toEqual({ file: 'http://x/game.js', line: 42 });
    const bare = 'Error\n    at wrapper (http://x/a.js:1:1)\n    at http://x/game.js:7:3';
    expect(extractCallSite(bare)).toEqual({ file: 'http://x/game.js', line: 7 });
  });

  it('reads the caller from a JavaScriptCore stack', () => {
    const stack = 'wrapper@http://x/a.js:1:1\nplay@http://x/game.js:42:9';
    expect(extractCallSite(stack)).toEqual({ file: 'http://x/game.js', line: 42 });
  });

  it('returns undefined when unsure', () => {
    expect(extractCallSite(undefined)).toBeUndefined();
    expect(extractCallSite('')).toBeUndefined();
    expect(extractCallSite('Error\n    at wrapper (a.js:1:1)')).toBeUndefined();
    expect(extractCallSite('Error\n    at wrapper (a.js:1:1)\n    at <anonymous>')).toBeUndefined();
    expect(extractCallSite('wrapper@[native code]\nfoo@[native code]')).toBeUndefined();
  });
});

type Call = { level: string; message: string; options?: { file?: string; line?: number } };

function rig(options: { reject?: boolean; throwing?: boolean } = {}) {
  const shown: Array<[string, unknown[]]> = [];
  const fakeConsole = {} as ConsoleLike;
  for (const m of ['log', 'debug', 'info', 'warn', 'error'] as const) {
    fakeConsole[m] = (...args: unknown[]) => void shown.push([m, args]);
  }
  const listeners = new Map<string, (event: never) => void>();
  const win = {
    __TAURI_INTERNALS__: {},
    addEventListener: (type: string, fn: (event: never) => void) => void listeners.set(type, fn),
  };
  const calls: Call[] = [];
  let onRust: ((entry: { level: number; message: string }) => void) | undefined;
  const record = (level: string) => (message: string, opts?: { file?: string; line?: number }) => {
    if (options.throwing) throw new Error('plugin threw');
    calls.push({ level, message, options: opts });
    return options.reject ? Promise.reject(new Error('ipc')) : Promise.resolve();
  };
  const plugin: PluginLogLike = {
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    attachLogger: (fn) => {
      onRust = fn;
      return Promise.resolve(() => {});
    },
  };
  return {
    shown,
    fakeConsole,
    listeners,
    win,
    calls,
    plugin,
    rust: (e: { level: number; message: string }) => onRust?.(e),
  };
}

describe('initTauriLogging', () => {
  it('forwards each console method at its level and still calls the original', async () => {
    const r = rig();
    await initTauriLogging({
      prefix: 'probe',
      console: r.fakeConsole,
      win: r.win,
      load: async () => r.plugin,
    });
    r.fakeConsole.log('a', 1);
    r.fakeConsole.debug('b');
    r.fakeConsole.info('c');
    r.fakeConsole.warn('d');
    r.fakeConsole.error('e', { k: 1 });
    expect(r.calls.map((c) => [c.level, c.message])).toEqual([
      ['info', '[probe] a 1'],
      ['debug', '[probe] b'],
      ['info', '[probe] c'],
      ['warn', '[probe] d'],
      ['error', '[probe] e {"k":1}'],
    ]);
    expect(r.shown.map(([m]) => m)).toEqual(['log', 'debug', 'info', 'warn', 'error']);
    expect(r.shown[0]?.[1]).toEqual(['a', 1]);
  });

  it('passes the call site to the plugin', async () => {
    const r = rig();
    await initTauriLogging({
      prefix: 'p',
      console: r.fakeConsole,
      win: r.win,
      load: async () => r.plugin,
    });
    r.fakeConsole.log('x');
    expect(r.calls).toHaveLength(1);
    const site = r.calls[0]?.options;
    expect(
      site === undefined || (typeof site.file === 'string' && typeof site.line === 'number'),
    ).toBe(true);
  });

  it('holds lines until the plugin loads, then writes them in order', async () => {
    const r = rig();
    let release: (p: PluginLogLike) => void = () => {};
    const done = initTauriLogging({
      prefix: 'p',
      console: r.fakeConsole,
      win: r.win,
      load: () => new Promise((resolve) => (release = resolve)),
    });
    r.fakeConsole.log('early 1');
    r.fakeConsole.warn('early 2');
    expect(r.calls).toHaveLength(0);
    release(r.plugin);
    await done;
    expect(r.calls.map((c) => c.message)).toEqual(['[p] early 1', '[p] early 2']);
  });

  it('keeps only the newest lines while loading', async () => {
    const r = rig();
    let release: (p: PluginLogLike) => void = () => {};
    const done = initTauriLogging({
      prefix: 'p',
      console: r.fakeConsole,
      win: r.win,
      load: () => new Promise((resolve) => (release = resolve)),
    });
    for (let i = 0; i < MAX_PENDING + 5; i++) r.fakeConsole.log(i);
    release(r.plugin);
    await done;
    expect(r.calls).toHaveLength(MAX_PENDING);
    expect(r.calls[0]?.message).toBe('[p] 5');
  });

  it('captures uncaught errors and unhandled rejections as error entries', async () => {
    const r = rig();
    await initTauriLogging({
      prefix: 'p',
      console: r.fakeConsole,
      win: r.win,
      load: async () => r.plugin,
    });
    r.listeners.get('error')?.({
      message: 'bad',
      filename: 'http://x/g.js',
      lineno: 9,
      error: new Error('bad'),
    } as never);
    r.listeners.get('unhandledrejection')?.({ reason: 'nope' } as never);
    expect(r.calls[0]).toMatchObject({
      level: 'error',
      options: { file: 'http://x/g.js', line: 9 },
    });
    expect(r.calls[0]?.message).toContain('Uncaught: bad');
    expect(r.calls[1]).toMatchObject({ level: 'error', message: '[p] Unhandled rejection: nope' });
  });

  it('never throws or rejects, whatever the plugin does', async () => {
    for (const mode of [{ reject: true }, { throwing: true }]) {
      const r = rig(mode);
      await initTauriLogging({
        prefix: 'p',
        console: r.fakeConsole,
        win: r.win,
        load: async () => r.plugin,
      });
      expect(() => r.fakeConsole.error('x')).not.toThrow();
      await Promise.resolve();
      expect(r.shown).toHaveLength(1);
    }
  });

  it('stops quietly when the plugin cannot load, leaving the console working', async () => {
    const r = rig();
    await expect(
      initTauriLogging({
        prefix: 'p',
        console: r.fakeConsole,
        win: r.win,
        load: () => Promise.reject(new Error('missing')),
      }),
    ).resolves.toBeUndefined();
    expect(() => r.fakeConsole.log('after')).not.toThrow();
    expect(r.shown).toHaveLength(1);
    expect(r.calls).toHaveLength(0);
  });

  it('does not feed Rust records, or console output made while forwarding, back to the plugin', async () => {
    const r = rig();
    await initTauriLogging({
      prefix: 'p',
      console: r.fakeConsole,
      win: r.win,
      load: async () => r.plugin,
    });
    r.rust({ level: 3, message: 'from rust' });
    r.rust({ level: 5, message: 'rust error' });
    expect(r.shown).toEqual([
      ['info', ['from rust']],
      ['error', ['rust error']],
    ]);
    expect(r.calls).toHaveLength(0);

    // A console call made from inside a forward (here a serialiser that logs) is not forwarded again.
    const noisy = {
      toJSON() {
        r.fakeConsole.log('inside');
        return 'noisy';
      },
    };
    r.fakeConsole.log(noisy);
    expect(r.calls.map((c) => c.message)).toEqual(['[p] "noisy"']);
    expect(r.shown.filter(([, a]) => a[0] === 'inside')).toHaveLength(1);
  });

  it('is idempotent for one console', async () => {
    const r = rig();
    const env = { prefix: 'p', console: r.fakeConsole, win: r.win, load: async () => r.plugin };
    await initTauriLogging(env);
    await initTauriLogging(env);
    r.fakeConsole.log('once');
    expect(r.calls).toHaveLength(1);
    expect(r.shown).toHaveLength(1);
  });

  it('does nothing outside the app host', async () => {
    const r = rig();
    const original = r.fakeConsole.log;
    let loaded = false;
    const web = { addEventListener: () => {} };
    await initTauriLogging({
      prefix: 'p',
      console: r.fakeConsole,
      win: web,
      load: async () => {
        loaded = true;
        return r.plugin;
      },
    });
    await initTauriLogging({
      prefix: 'p',
      console: r.fakeConsole,
      win: null,
      load: async () => r.plugin,
    });
    expect(loaded).toBe(false);
    expect(r.fakeConsole.log).toBe(original);
    expect(r.listeners.size).toBe(0);
  });
});
