// Episode 1's Enhanced music: how each level cue becomes a song, by the engine's song builder.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { MusicSong, MusicTrack } from '@lieutenant-fizz/engine/audio';
import { songFor, type SongDef } from '@lieutenant-fizz/engine/music-songs';

/**
 * How each cue becomes a song. The overworld and the boss start straight on the tune and have no fill,
 * since an intro distracts from their melody and the boss's tension is in the tempo; the caves, the
 * theatre and the foundry keep their key (a lift would spoil the mood). The title has no intro, no fill and no lift
 * either, so its last tune, back in the home key, runs straight into its first on every loop.
 */
const DEFS: Record<string, SongDef> = {
  title: { trim: 0.75, contrast: 5, lift: 0, arp: true, intro: 0, noFill: true },
  crater: { trim: 0.75, contrast: 5, lift: 2, arp: true },
  caves: { trim: 1, contrast: 7, lift: 0, arp: true },
  sky: { trim: 0.88, contrast: 7, lift: 2, arp: true },
  tower: { trim: 0.92, contrast: 2, lift: 5, arp: false },
  theatre: { trim: 1, contrast: 5, lift: 0, arp: false },
  foundry: { trim: 0.74, contrast: 5, lift: 0, arp: false },
  secret: { trim: 0.95, contrast: 7, lift: 0, arp: false },
  citadel: { trim: 0.75, contrast: 5, lift: 2, arp: true },
  map: { trim: 0.9, contrast: 7, lift: 0, arp: false, intro: 0, noFill: true, form: 'A B A′' },
  boss: { trim: 0.8, contrast: 5, lift: 0, arp: true, intro: 0, noFill: true },
};

/** The Enhanced song for every cue that has one (the level and overworld tracks and the boss). */
export function buildSongs(music: Record<string, MusicTrack>): Record<string, MusicSong> {
  return Object.fromEntries(
    Object.entries(DEFS).flatMap(([id, def]) => {
      const track = music[id];
      return track ? [[id, songFor(track, def)] as const] : [];
    }),
  );
}
