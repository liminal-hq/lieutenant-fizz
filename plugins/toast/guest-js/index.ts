// Typed TypeScript bindings for the toast plugin's commands.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { invoke } from '@tauri-apps/api/core';

export type ToastDuration = 'short' | 'long';
export type ToastPosition = 'top' | 'centre' | 'bottom';

export interface ShowToastOptions {
  message: string;
  duration?: ToastDuration;
  position?: ToastPosition;
  /** Take down the toast that is showing first (the default), so only the last of a quick run fades away. */
  replace?: boolean;
}

export async function showToast(options: ShowToastOptions): Promise<void> {
  await invoke('plugin:toast|show', {
    payload: {
      message: options.message,
      duration: options.duration ?? 'short',
      position: options.position ?? 'bottom',
      replace: options.replace ?? true,
    },
  });
}

/** Takes down the toast that is showing. */
export async function cancelToast(): Promise<void> {
  await invoke('plugin:toast|cancel');
}
