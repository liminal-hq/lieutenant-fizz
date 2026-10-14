// Tests for the launcher's music.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import type { MusicTrack } from '@lieutenant-fizz/engine/audio';
import type { MenuThemeData } from '@lieutenant-fizz/engine/menu/theme';
import { stopsOf } from './catalog';
import {
  CROSSFADE_SECONDS,
  createLauncherMusic,
  libraryOf,
  musicSettingsOf,
  trackName,
  trackOf,
  type MusicAudio,
} from './music';
import { TEASER_TRACK } from './teaser-score';

const track: MusicTrack = { bpm: 120, parts: [{ notes: 'c4', g: 0.1 }] };
const themes = new Map<string, MenuThemeData | undefined>([
  ['episode-1', { music: { main: 'title', tracks: { title: track } } }],
  ['episode-2', undefined],
]);
const stops = stopsOf({
  episodes: [
    { id: 'episode-1', number: 1, status: 'playable' },
    { id: 'episode-2', number: 2, status: 'coming-soon' },
  ],
});

function fakeAudio() {
  const log: string[] = [];
  const audio: MusicAudio = {
    playMusic: (t, force, fade) => void log.push(`play:${t}:${force}:${fade}`),
    setMusic: (on) => void log.push(`music:${on}`),
    setMusicVolume: (v) => void log.push(`vol:${v}`),
    setMode: (m) => void log.push(`mode:${m}`),
    setMusicStyle: (m) => void log.push(`style:${m}`),
    setActive: (on) => void log.push(`active:${on}`),
    dispose: () => void log.push('dispose'),
  };
  return { audio, log };
}

describe('the music library', () => {
  it('holds each episode’s tracks by episode and name, and the teaser score', () => {
    const lib = libraryOf(themes);
    expect(Object.keys(lib.tracks).sort()).toEqual(['episode-1:title', TEASER_TRACK].sort());
    expect(lib.tracks[trackName('episode-1', 'title')]).toBe(track);
    expect(lib.songs[TEASER_TRACK]).toBeDefined();
  });
});

describe('the track of a stop', () => {
  it('is the episode’s main theme, the series theme on App settings, and the teaser for one not out or with no music', () => {
    expect(trackOf(stops[0]!, themes)).toBe('episode-1:title');
    expect(trackOf(stops[1]!, themes)).toBe(TEASER_TRACK);
    expect(trackOf(stops[2]!, themes)).toBe('episode-1:title');
    expect(trackOf(stops[0]!, new Map())).toBe(TEASER_TRACK);
    expect(trackOf(stops[2]!, new Map())).toBe(TEASER_TRACK);
  });
});

describe('the settings of the music', () => {
  it('follow the options, with Auto the engine’s default (Enhanced)', () => {
    expect(musicSettingsOf({ music: 4, audio: 0, musicVersion: 0 })).toEqual({
      level: 0.5,
      mode: 'enhanced',
      version: 'enhanced',
    });
    expect(musicSettingsOf({ music: 8, audio: 1, musicVersion: 1 })).toEqual({
      level: 1,
      mode: 'classic',
      version: 'classic',
    });
    expect(musicSettingsOf({ music: 0, audio: 2, musicVersion: 2 }).level).toBe(0);
  });
});

describe('the launcher music', () => {
  it('sets up the audio from the settings, and plays a track with the crossfade', () => {
    const { audio, log } = fakeAudio();
    const music = createLauncherMusic(audio, { level: 0.5, mode: 'enhanced', version: 'classic' });
    expect(log).toEqual(['mode:enhanced', 'style:classic', 'vol:0.5', 'music:true']);
    music.play('episode-1:title');
    expect(log.at(-1)).toBe(`play:episode-1:title:false:${CROSSFADE_SECONDS}`);
    music.play(null, 0);
    expect(log.at(-1)).toBe('play:null:false:0');
  });

  it('only passes on what changed, and turns the music off at a level of 0', () => {
    const { audio, log } = fakeAudio();
    const music = createLauncherMusic(audio, { level: 1, mode: 'enhanced', version: 'enhanced' });
    log.length = 0;
    music.set({ level: 1, mode: 'enhanced', version: 'enhanced' });
    expect(log).toEqual([]);
    music.set({ level: 0, mode: 'classic', version: 'enhanced' });
    expect(log).toEqual(['mode:classic', 'vol:0', 'music:false']);
  });

  it('goes quiet when the page is hidden and lets go of the audio when disposed', () => {
    const { audio, log } = fakeAudio();
    const music = createLauncherMusic(audio, { level: 1, mode: 'enhanced', version: 'enhanced' });
    log.length = 0;
    music.setActive(false);
    music.dispose();
    expect(log).toEqual(['active:false', 'dispose']);
  });
});
