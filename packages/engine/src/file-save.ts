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
 * How opening a file ended: the file's name and bytes, the player closing the dialog (a choice), a file larger than
 * the limit asked for (left unread), or a failure.
 */
export type OpenOutcome =
  | { status: 'opened'; name: string; bytes: Uint8Array }
  | { status: 'cancelled' }
  | { status: 'toolarge' }
  | { status: 'failed' };

/**
 * What the game saves a file with. The web build uses the browser; the apps swap in their own (the system
 * Save dialog, the share sheet). Each call is made from a tap, since browsers only allow them from one.
 */
export interface FileSaver {
  /**
   * Opens the system file picker for a file the player chooses (by extension, without the dot) and reads it. With
   * `maxBytes`, a file the picker reports as larger is not read, so a huge file cannot fill the page's memory; where
   * the size cannot be known beforehand the caller still checks the bytes it gets.
   */
  open(extensions: readonly string[], maxBytes?: number): Promise<OpenOutcome>;
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
  /** Asks the player for a file (the page's file picker); resolves null when they close it. */
  pickFile?: (accept: string) => Promise<File | null>;
}

/** The browser's own saver: a download through a link, and the Web Share sheet for a file where it exists. */
export function webSaver(env: WebSaverEnv): FileSaver {
  const fileOf = (bytes: Uint8Array, name: string, mime: string): File =>
    new env.File([bytes as BlobPart], name, { type: mime });
  return {
    async open(extensions, maxBytes) {
      try {
        if (!env.pickFile) return { status: 'failed' };
        const file = await env.pickFile(extensions.map((e) => `.${e}`).join(','));
        if (!file) return { status: 'cancelled' };
        if (maxBytes !== undefined && file.size > maxBytes) return { status: 'toolarge' };
        return {
          status: 'opened',
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        };
      } catch {
        return { status: 'failed' };
      }
    },
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
    pickFile: pickPageFile,
  });
}

/**
 * The page's file picker: a hidden file input, clicked from the tap that asked for it (browsers allow it only
 * from one). It resolves null when the player closes the picker, in browsers that say so.
 */
function pickPageFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    const done = (file: File | null): void => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    document.body.append(input);
    input.click();
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
