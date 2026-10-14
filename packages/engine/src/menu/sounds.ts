// The sounds a menu makes, by what happened: the cursor moved, a row was chosen, Back, a value changed, "no", a swipe.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** What a menu makes a sound for. */
export type MenuCue = 'move' | 'select' | 'back' | 'change' | 'deny' | 'swipe';

/** Every cue, in the order a menu's sounds are listed. */
export const MENU_CUES: readonly MenuCue[] = ['move', 'select', 'back', 'change', 'deny', 'swipe'];

/**
 * The effect each cue plays, by the name the episode's audio knows it by, so one episode's menus can sound
 * unlike another's while the menu code asks for a cue and never for a particular effect.
 */
export type MenuSounds = Readonly<Record<MenuCue, string>>;

/** Plays the sound for a cue. */
export interface MenuSoundPlayer {
  cue(cue: MenuCue): void;
}

/** A player that plays each cue's effect through `play` (the audio's `play`). Menu sounds never vary in pitch. */
export function createMenuSounds(
  sounds: MenuSounds,
  play: (effect: string) => void,
): MenuSoundPlayer {
  return {
    cue(cue) {
      play(sounds[cue]);
    },
  };
}
