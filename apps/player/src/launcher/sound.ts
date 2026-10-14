// The launcher's menu sounds: the effects an episode named for each cue, played through the engine's audio.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { GameAudio } from '@lieutenant-fizz/engine/audio';
import { createMenuSounds, type MenuSoundPlayer } from '@lieutenant-fizz/engine/menu/sounds';
import type { MenuThemeData } from '@lieutenant-fizz/engine/menu/theme';
import type { KeyValueStorage } from '@lieutenant-fizz/engine/storage';

/** Where Episode 1 keeps its options: the launcher reads the sound effects volume from there until there is a shared options model. */
export const EPISODE_1_OPTIONS_KEY = 'lf-ep1-options-v1';

/** Blocks on a volume meter: 0 is silent and 8 is full volume (Episode 1's Options). */
const METER_BLOCKS = 8;

/** The sound effects volume, 0 to 1, from Episode 1's saved options: full when nothing is saved or it cannot be read. */
export function sfxLevelFromOptions(json: string | null): number {
  try {
    const raw = (json ? JSON.parse(json) : null) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || raw['v'] !== 1) return 1;
    const level = raw['sfx'];
    if (typeof level !== 'number' || !Number.isFinite(level)) return 1;
    return Math.min(METER_BLOCKS, Math.max(0, Math.round(level))) / METER_BLOCKS;
  } catch {
    return 1;
  }
}

/** The menu's sounds, and a way to let go of the audio they use. */
export interface LauncherSound extends MenuSoundPlayer {
  dispose(): void;
}

/** A player that makes no sound. */
export const SILENT: LauncherSound = { cue: () => {}, dispose: () => {} };

/**
 * The menu sounds for a theme: silent when the theme has none (or the player turned sound effects off), and
 * otherwise played through an audio that unlocks at the first press, or at once inside the app, whose page may
 * play without one.
 */
export function createLauncherSound(
  data: MenuThemeData,
  store: Pick<KeyValueStorage, 'getItem'>,
  inApp: boolean,
): LauncherSound {
  if (!data.sounds || !data.voices) return SILENT;
  let saved: string | null = null;
  try {
    saved = store.getItem(EPISODE_1_OPTIONS_KEY);
  } catch {
    /* a store that cannot be read has no saved volume: full */
  }
  const level = sfxLevelFromOptions(saved);
  if (level <= 0) return SILENT;
  const audio = new GameAudio(
    { sfx: { ...data.voices } as never, music: {}, captionSfx: {} },
    undefined,
    { unlockAtBoot: inApp },
  );
  audio.setSfxVolume(level);
  return {
    ...createMenuSounds(data.sounds, (effect) => audio.play(effect)),
    dispose: () => audio.dispose(),
  };
}
