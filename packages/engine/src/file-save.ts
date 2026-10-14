// Hands a file the player asked for to the browser: a download, or the system share sheet where the browser has one.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { openAppSaver } from './app-saver';
import { detectHostKind, hostEnvOf } from './host';

/** How a share ended. `unknown` is a share that started and the system did not say more (Android and Windows often do not). */
export type ShareOutcome = 'shared' | 'cancelled' | 'unknown' | 'failed';

/** How a save ended. `cancelled` is the player closing the Save dialog, which is a choice and not a failure. */
export type SaveOutcome = 'saved' | 'cancelled' | 'failed';

/**
 * What the game saves a file with. The web build uses the browser; the apps swap in their own (the system
 * Save dialog, the share sheet). Both calls are made from a tap, since browsers only allow them from one.
 */
export interface FileSaver {
  /** Saves the file where the player chooses or to Downloads; resolves how it ended. */
  save(bytes: Uint8Array, name: string, mime: string): Promise<SaveOutcome>;
  /** Whether a share menu is available for a file. */
  canShare(name: string, mime: string): boolean;
  /** Opens the system share menu for the file. */
  share(bytes: Uint8Array, name: string, mime: string): Promise<ShareOutcome>;
}

/** The parts of the page the web saver uses, so tests can pass fakes. */
export interface WebSaverEnv {
  document: {
    createElement(tag: 'a'): { href: string; download: string; rel: string; click(): void };
    body: { appendChild(n: unknown): unknown; removeChild(n: unknown): unknown };
  };
  URL: { createObjectURL(b: Blob): string; revokeObjectURL(u: string): void };
  navigator: {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  File: typeof File;
  setTimeout(fn: () => void, ms: number): unknown;
}

/** The browser's own saver: a download through a link, and the Web Share sheet for a file where it exists. */
export function webSaver(env: WebSaverEnv): FileSaver {
  const fileOf = (bytes: Uint8Array, name: string, mime: string): File =>
    new env.File([bytes as BlobPart], name, { type: mime });
  return {
    async save(bytes, name, mime) {
      try {
        const url = env.URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
        const a = env.document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        env.document.body.appendChild(a);
        a.click();
        env.document.body.removeChild(a);
        // The download has started by now; the address is freed a little later so it is never freed too soon.
        env.setTimeout(() => env.URL.revokeObjectURL(url), 10_000);
        return 'saved';
      } catch {
        return 'failed';
      }
    },
    canShare(name, mime) {
      try {
        return (
          typeof env.navigator.share === 'function' &&
          typeof env.navigator.canShare === 'function' &&
          env.navigator.canShare({ files: [fileOf(new Uint8Array(), name, mime)] })
        );
      } catch {
        return false;
      }
    },
    async share(bytes, name, mime) {
      try {
        await env.navigator.share?.({ files: [fileOf(bytes, name, mime)], title: name });
        return 'shared';
      } catch (err) {
        // Closing the share sheet rejects with an AbortError; that is a choice, not a failure.
        return (err as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'failed';
      }
    },
  };
}

/** The web saver for the real page, or null outside a browser. */
export function pageSaver(): FileSaver | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return webSaver({
    document: document as unknown as WebSaverEnv['document'],
    URL,
    navigator: navigator as unknown as WebSaverEnv['navigator'],
    File,
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  });
}

/**
 * The saver for where the game is running: the system dialogs and share sheet in the apps, the browser's own
 * download and Web Share on the web, or null where neither exists. Asking what can be shared takes a moment in
 * the apps, so this resolves once it is known.
 */
export async function openSaver(): Promise<FileSaver | null> {
  if (detectHostKind(hostEnvOf()).startsWith('tauri')) return openAppSaver();
  return pageSaver();
}
