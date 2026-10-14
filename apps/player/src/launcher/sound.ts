// The launcher's menu sounds: the effects an episode named for each cue, played through the engine's audio.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { GameAudio } from '@lieutenant-fizz/engine/audio';
import { createMenuSounds, type MenuSoundPlayer } from '@lieutenant-fizz/engine/menu/sounds';
import type { MenuThemeData } from '@lieutenant-fizz/engine/menu/theme';

/** The menu's sounds, and a way to let go of the audio they use. */
export interface LauncherSound extends MenuSoundPlayer {
  /** Sets the volume of the effects, 0 to 1 (a level above silence; silence is a player of nothing). */
  setLevel(level: number): void;
  dispose(): void;
}

/** A player that makes no sound. */
export const SILENT: LauncherSound = { cue: () => {}, setLevel: () => {}, dispose: () => {} };

/**
 * The menu sounds for a theme: silent when the theme has none (or the player turned sound effects off), and
 * otherwise played through an audio that unlocks at the first press, or at once inside the app, whose page may
 * play without one.
 */
export function createLauncherSound(
  data: MenuThemeData,
  level: number,
  inApp: boolean,
): LauncherSound {
  if (!data.sounds || !data.voices || level <= 0) return SILENT;
  const audio = new GameAudio(
    { sfx: { ...data.voices } as never, music: {}, captionSfx: {} },
    undefined,
    { unlockAtBoot: inApp },
  );
  audio.setSfxVolume(level);
  return {
    ...createMenuSounds(data.sounds, (effect) => audio.play(effect)),
    setLevel: (next) => audio.setSfxVolume(next),
    dispose: () => audio.dispose(),
  };
}
