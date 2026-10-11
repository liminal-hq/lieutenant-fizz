// Forwards the page's console output and uncaught errors to the Tauri log plugin, and shows Rust's logs in the devtools console.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { isAppHost } from './lifecycle-policy';

/** The levels the bridge writes. `console.log` goes out as `info`: the plugin has no separate log level. */
export type LogLevelName = 'debug' | 'info' | 'warn' | 'error';

/** The console methods the bridge replaces. */
export type ConsoleMethod = 'log' | 'debug' | 'info' | 'warn' | 'error';

/** Where a log call came from, as the plugin's `file` and `line` options take it. */
export interface CallSite {
  file: string;
  line: number;
}

const METHODS: readonly ConsoleMethod[] = ['log', 'debug', 'info', 'warn', 'error'];

const LEVEL_OF: Record<ConsoleMethod, LogLevelName> = {
  log: 'info',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

/** The console, as far as the bridge needs it. */
export type ConsoleLike = Record<ConsoleMethod, (...args: unknown[]) => void>;

/** The window, as far as the bridge needs it. */
export interface WindowLike {
  addEventListener(type: string, listener: (event: Event) => void): void;
}

/** What the bridge uses of `@tauri-apps/plugin-log`. */
export interface PluginLogLike {
  debug(message: string, options?: { file?: string; line?: number }): Promise<void>;
  info(message: string, options?: { file?: string; line?: number }): Promise<void>;
  warn(message: string, options?: { file?: string; line?: number }): Promise<void>;
  error(message: string, options?: { file?: string; line?: number }): Promise<void>;
  /** Subscribes to the records Rust sends to the WebView target. Optional so a fake can leave it out. */
  attachLogger?(fn: (entry: { level: number; message: string }) => void): Promise<unknown>;
}

/** Everything the bridge touches, injectable so tests use fakes. */
export interface TauriLogEnv {
  /** Names the page in every line, for example `episode-1` or `probe`. */
  prefix: string;
  console: ConsoleLike;
  /** The window; `null` where there is none. Doubles as the app-host check (`isAppHost`). */
  win: (WindowLike & object) | null;
  /** Loads the plugin. The default is a lazy `import('@tauri-apps/plugin-log')`, so the web bundle never carries it. */
  load: () => Promise<PluginLogLike>;
}

/** How many lines are held while the plugin loads; older ones are dropped. */
export const MAX_PENDING = 200;

function serialiseError(error: Error): string {
  return error.stack ?? `${error.name}: ${error.message}`;
}

/**
 * One console argument as text. Strings pass through; errors become their stack; objects become JSON,
 * retried with `[Circular]` for repeated references and `12n` for bigint; what is still unwritable becomes
 * a type-tagged marker. Never throws, whatever the argument's getters and `toJSON` do.
 */
export function serialiseConsoleArg(arg: unknown): string {
  try {
    if (typeof arg === 'string') return arg;
    if (arg === null || arg === undefined) return String(arg);
    if (typeof arg === 'bigint') return `${arg.toString()}n`;
    if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'symbol') {
      return String(arg);
    }
    if (typeof arg === 'function') return `[Function ${arg.name || 'anonymous'}]`;
    if (arg instanceof Error) return serialiseError(arg);
    try {
      return JSON.stringify(arg) ?? String(arg);
    } catch {
      return serialiseTolerant(arg);
    }
  } catch {
    return '[unserialisable]';
  }
}

/** The second try for values `JSON.stringify` rejects: circular references and bigint are written, not thrown. */
function serialiseTolerant(arg: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return (
      JSON.stringify(arg, (_key, value: unknown) => {
        if (typeof value === 'bigint') return `${value.toString()}n`;
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      }) ?? String(arg)
    );
  } catch {
    let kind: string = typeof arg;
    try {
      kind = (arg as { constructor?: { name?: string } } | null)?.constructor?.name ?? kind;
    } catch {
      // A hostile getter: keep the plain type.
    }
    return `[unserialisable ${kind}]`;
  }
}

/** The arguments of one console call as a single line. */
export function serialiseConsoleArgs(args: readonly unknown[]): string {
  return args.map(serialiseConsoleArg).join(' ');
}

/** One V8 frame, `at name (file:line:col)` or `at file:line:col`. */
function parseV8Frame(frame: string): CallSite | undefined {
  const match =
    /^at\s+.*?\s+\((.+?):(\d+):(\d+)\)$/.exec(frame) ?? /^at\s+(.+?):(\d+):(\d+)$/.exec(frame);
  const [, file, line] = match ?? [];
  return file && line ? { file, line: Number(line) } : undefined;
}

/** One JavaScriptCore frame, `name@file:line:col` (WebKitGTK on the desktop, WKWebView on iOS). */
function parseJscFrame(frame: string): CallSite | undefined {
  const at = frame.lastIndexOf('@');
  const match = /^(.+?):(\d+):(\d+)$/.exec(at === -1 ? frame : frame.slice(at + 1));
  const [, file, line] = match ?? [];
  return file && line ? { file, line: Number(line) } : undefined;
}

/**
 * The call site of `console.*`, from a stack captured with `new Error().stack` directly inside the
 * wrapper. V8 (Android's WebView) starts with an `Error` header, then the wrapper's frame, then the caller;
 * JavaScriptCore has no header, so the caller is the second line. Returns `undefined` when it is not sure.
 */
export function extractCallSite(stack: string | undefined): CallSite | undefined {
  try {
    if (!stack) return undefined;
    const lines = stack.split('\n').map((line) => line.trim());
    const isV8 = lines[0]?.startsWith('Error') ?? false;
    const frame = isV8 ? lines[2] : lines[1];
    if (!frame) return undefined;
    return isV8 ? parseV8Frame(frame) : parseJscFrame(frame);
  } catch {
    return undefined;
  }
}

const patched = new WeakSet<object>();

async function loadPlugin(): Promise<PluginLogLike> {
  return import('@tauri-apps/plugin-log');
}

/** The console method that shows a Rust record of this level (the plugin's numbers: 1 trace to 5 error). */
function consoleMethodOfLevel(level: number): ConsoleMethod {
  if (level >= 5) return 'error';
  if (level === 4) return 'warn';
  if (level === 3) return 'info';
  return 'debug';
}

type Pending = [LogLevelName, string, CallSite | undefined];

/**
 * Starts the bridge. Call it first thing in a page. Outside the app (`isAppHost` is false) it does nothing:
 * no import, no change to the console. Inside, it forwards `console.log`, `debug`, `info`, `warn` and
 * `error` to the plugin with the call site, keeping the original console call, and writes uncaught errors and
 * unhandled rejections as `error` entries. Rust's own records are written to the devtools console through
 * the original methods, so they are never forwarded back.
 *
 * Output made while the plugin loads is held (up to `MAX_PENDING` lines) and written once it is ready. If the
 * plugin cannot load, forwarding silently stops and nothing throws. Calling it again for the same console does
 * nothing. Every forward is best-effort: a failure never reaches the page.
 */
export function initTauriLogging(
  options: Partial<TauriLogEnv> & { prefix: string },
): Promise<void> {
  const win =
    options.win !== undefined ? options.win : typeof window === 'undefined' ? null : window;
  const target = options.console ?? (console as unknown as ConsoleLike);
  if (!win || !isAppHost(win) || patched.has(target)) return Promise.resolve();
  patched.add(target);
  const load = options.load ?? loadPlugin;
  const prefix = `[${options.prefix}] `;

  const originals = {} as ConsoleLike;
  for (const method of METHODS) originals[method] = target[method].bind(target);

  let sink: PluginLogLike | null = null;
  let dead = false;
  let pending: Pending[] = [];
  // Set while the bridge itself is running, so anything it triggers goes only to the original console.
  let busy = false;

  const write = (level: LogLevelName, line: string, site: CallSite | undefined): void => {
    try {
      void sink?.[level](line, site).catch(() => {});
    } catch {
      // A throwing plugin must not reach the page.
    }
  };

  const emit = (level: LogLevelName, text: string, site?: CallSite): void => {
    if (dead) return;
    const line = prefix + text;
    if (sink) return write(level, line, site);
    pending.push([level, line, site]);
    if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
  };

  const guarded = (fn: () => void): void => {
    if (busy) return;
    busy = true;
    try {
      fn();
    } catch {
      // Never throws.
    } finally {
      busy = false;
    }
  };

  for (const method of METHODS) {
    target[method] = (...args: unknown[]): void => {
      originals[method](...args);
      guarded(() =>
        emit(LEVEL_OF[method], serialiseConsoleArgs(args), extractCallSite(new Error().stack)),
      );
    };
  }

  win.addEventListener('error', (event: Event) => {
    guarded(() => {
      const e = event as unknown as {
        message?: unknown;
        filename?: unknown;
        lineno?: unknown;
        error?: unknown;
      };
      const file = typeof e.filename === 'string' && e.filename ? e.filename : undefined;
      const line = typeof e.lineno === 'number' ? e.lineno : undefined;
      const detail =
        e.error !== undefined && e.error !== null ? ` ${serialiseConsoleArg(e.error)}` : '';
      emit(
        'error',
        `Uncaught: ${serialiseConsoleArg(e.message)}${detail}`,
        file && line ? { file, line } : undefined,
      );
    });
  });
  win.addEventListener('unhandledrejection', (event: Event) => {
    guarded(() => {
      emit(
        'error',
        `Unhandled rejection: ${serialiseConsoleArg((event as unknown as { reason?: unknown }).reason)}`,
      );
    });
  });

  return (async () => {
    try {
      const plugin = await load();
      sink = plugin;
      const queued = pending;
      pending = [];
      for (const [level, line, site] of queued) write(level, line, site);
      await plugin.attachLogger?.(({ level, message }) => {
        try {
          originals[consoleMethodOfLevel(level)](message);
        } catch {
          // Never throws.
        }
      });
    } catch {
      dead = true;
      pending = [];
      sink = null;
    }
  })();
}
