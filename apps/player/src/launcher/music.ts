// The launcher's music: each stop's theme through the engine's audio, crossfading as the carousel steps.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { GameAudio, type MusicSong, type MusicTrack } from '@lieutenant-fizz/engine/audio';
import { METER_BLOCKS, type GlobalOptions } from '@lieutenant-fizz/engine/options';
import { AUDIO_DEFAULT, type AudioMode } from '@lieutenant-fizz/engine/sound-field';
import type { MenuThemeData } from '@lieutenant-fizz/engine/menu/theme';
import type { Stop } from './catalog';
import { TEASER_LOOP, TEASER_SONG, TEASER_TRACK } from './teaser-score';

/** How long one track takes to fade out as the next fades in, in seconds. */
export const CROSSFADE_SECONDS = 1.4;

/** The tracks and Enhanced songs the launcher can play, by name. */
export interface MusicLibrary {
  tracks: Record<string, MusicTrack>;
  songs: Record<string, MusicSong>;
}

/** The name an episode's track goes by in the library. */
export const trackName = (episode: string, track: string): string => `${episode}:${track}`;

/**
 * The library: every playable episode's music (from its theme data) and the teaser score, which plays for an
 * episode that is not out and on App settings.
 */
export function libraryOf(themes: ReadonlyMap<string, MenuThemeData | undefined>): MusicLibrary {
  const tracks: Record<string, MusicTrack> = { [TEASER_TRACK]: TEASER_LOOP };
  const songs: Record<string, MusicSong> = { [TEASER_TRACK]: TEASER_SONG };
  for (const [episode, theme] of themes) {
    const music = theme?.music;
    if (!music) continue;
    for (const [name, track] of Object.entries(music.tracks)) {
      tracks[trackName(episode, name)] = track;
    }
    for (const [name, song] of Object.entries(music.songs ?? {})) {
      songs[trackName(episode, name)] = song;
    }
  }
  return { tracks, songs };
}

/**
 * The track that plays for a stop: an episode's main theme, the series theme (the first episode's) on App settings,
 * and the teaser score for an episode that is not out or has no music.
 */
export function trackOf(
  stop: Stop,
  themes: ReadonlyMap<string, MenuThemeData | undefined>,
): string {
  if (stop.kind === 'episode' && stop.playable) {
    const main = themes.get(stop.id)?.music?.main;
    if (main) return trackName(stop.id, main);
  } else if (stop.kind === 'app') {
    for (const [episode, theme] of themes) {
      if (theme?.music?.main) return trackName(episode, theme.music.main);
    }
  }
  return TEASER_TRACK;
}

/** What the music follows: the Music volume, and the Style and Music version options (Auto is the engine's default). */
export interface MusicSettings {
  /** 0 to 1. */
  level: number;
  /** The sound style the music is mixed in (Classic or the Enhanced stereo field). */
  mode: AudioMode;
  /** Which arrangement plays: the track as it is, or the Enhanced song. */
  version: AudioMode;
}

const choice = (n: number): AudioMode | undefined =>
  n === 1 ? 'classic' : n === 2 ? 'enhanced' : undefined;

/** The settings the options ask for: Auto is Enhanced, as in the game. */
export function musicSettingsOf(
  o: Pick<GlobalOptions, 'music' | 'audio' | 'musicVersion'>,
): MusicSettings {
  return {
    level: o.music / METER_BLOCKS,
    mode: choice(o.audio) ?? AUDIO_DEFAULT,
    version: choice(o.musicVersion) ?? AUDIO_DEFAULT,
  };
}

export interface LauncherMusic {
  /** Plays a track, fading out the one playing; null stops the music. */
  play(track: string | null, fadeSeconds?: number): void;
  set(settings: MusicSettings): void;
  /** The page went to the background or came back. */
  setActive(on: boolean): void;
  dispose(): void;
}

/** No music. */
export const NO_MUSIC: LauncherMusic = {
  play: () => {},
  set: () => {},
  setActive: () => {},
  dispose: () => {},
};

/** The parts of `GameAudio` the music uses, so a test can stand in. */
export interface MusicAudio {
  playMusic(track: string | null, force?: boolean, fadeSeconds?: number): void;
  setMusic(on: boolean): void;
  setMusicVolume(v: number): void;
  setMode(mode: AudioMode): void;
  setMusicStyle(style: AudioMode): void;
  setActive(on: boolean): void;
  dispose(): void;
}

/** Wraps an audio: the settings go in as they change, and a track is asked for with the fade. */
export function createLauncherMusic(audio: MusicAudio, initial: MusicSettings): LauncherMusic {
  let last: MusicSettings | undefined;
  const apply = (s: MusicSettings): void => {
    if (!last || last.mode !== s.mode) audio.setMode(s.mode);
    if (!last || last.version !== s.version) audio.setMusicStyle(s.version);
    if (!last || last.level !== s.level) {
      audio.setMusicVolume(s.level);
      audio.setMusic(s.level > 0);
    }
    last = s;
  };
  apply(initial);
  return {
    play: (track, fadeSeconds = CROSSFADE_SECONDS) => audio.playMusic(track, false, fadeSeconds),
    set: apply,
    setActive: (on) => audio.setActive(on),
    dispose: () => audio.dispose(),
  };
}

/** The music for these tracks: inside the app the audio unlocks at once, and on the web at the first press. */
export function openLauncherMusic(
  library: MusicLibrary,
  settings: MusicSettings,
  inApp: boolean,
): LauncherMusic {
  const audio = new GameAudio(
    { sfx: {}, music: library.tracks, songs: library.songs, captionSfx: {} },
    undefined,
    { unlockAtBoot: inApp, musicFades: true },
  );
  return createLauncherMusic(audio, settings);
}
