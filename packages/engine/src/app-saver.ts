// The app's file saver: the system Save dialog, and the share sheet fed from a file in the app's cache.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { FileSaver, ShareOutcome } from './file-save';

/** What the saver needs from Tauri. The real ones load each plugin when first used; tests pass fakes. */
export interface AppDeps {
  /** Opens the system Save dialog with a file name filled in; resolves the chosen path, or null if it was cancelled. */
  pickSavePath(name: string): Promise<string | null>;
  /** Writes bytes to a path the player chose, or to the share folder. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  /** Empties the share folder in the app's cache, makes it, and resolves the path a file of this name goes at. */
  sharePath(name: string): Promise<string>;
  /** Whether the system has a share sheet and whether it takes a file. */
  canShare(): Promise<{ supported: boolean; files: boolean }>;
  shareFile(options: {
    path: string;
    mime: string;
    title?: string;
  }): Promise<{ status: 'shared' | 'cancelled' | 'unknown' }>;
}

/** The folder in the app's cache the zips handed to the share sheet are written in. */
export const SHARE_FOLDER = 'fizz-share';

/** The real dependencies: the dialog and fs plugins, the path API and the share-sheet plugin's commands. */
export function realAppDeps(): AppDeps {
  return {
    async pickSavePath(name) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      return save({ defaultPath: name, filters: [{ name: 'Zip archive', extensions: ['zip'] }] });
    },
    async writeFile(path, bytes) {
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(path, bytes);
    },
    async sharePath(name) {
      const { remove, mkdir } = await import('@tauri-apps/plugin-fs');
      const { cacheDir, join } = await import('@tauri-apps/api/path');
      const dir = await join(await cacheDir(), SHARE_FOLDER);
      // An earlier share's file is cleared now and not straight after sharing: the target app may still be reading it.
      await remove(dir, { recursive: true }).catch(() => undefined);
      await mkdir(dir, { recursive: true });
      return join(dir, name);
    },
    async canShare() {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke('plugin:share-sheet|can_share');
    },
    async shareFile(options) {
      const { invoke } = await import('@tauri-apps/api/core');
      return invoke('plugin:share-sheet|share_file', { options });
    },
  };
}

/**
 * The saver for the apps. Save zip opens the system Save dialog (a file picker on Android) and writes the zip
 * where the player chooses. Share writes it to the app's cache and opens the system share sheet with it. Asking
 * what the share sheet can take is done once here, so the review screen can show or hide Share at once.
 */
export async function openAppSaver(deps: AppDeps = realAppDeps()): Promise<FileSaver> {
  const can = await deps
    .canShare()
    .then((c) => c.supported && c.files)
    .catch(() => false);
  return {
    async save(bytes, name) {
      try {
        const path = await deps.pickSavePath(name);
        if (!path) return 'cancelled';
        await deps.writeFile(path, bytes);
        return 'saved';
      } catch {
        return 'failed';
      }
    },
    canShare: () => can,
    async share(bytes, name, mime): Promise<ShareOutcome> {
      try {
        const path = await deps.sharePath(name);
        await deps.writeFile(path, bytes);
        return (await deps.shareFile({ path, mime, title: name })).status;
      } catch {
        return 'failed';
      }
    },
  };
}
