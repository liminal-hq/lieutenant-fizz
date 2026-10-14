// The words on Episode 1's title: the line above the logo, the logo itself and the episode's line under it.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** What a wordmark says; the launcher gets the same through `episode.json`. */
export interface TitleCard {
  /** The small line above the logo. */
  kicker: string;
  /** The logo's words, which stack on a narrow screen. */
  words: readonly string[];
  /** The line under the logo. */
  line: string;
}

export const TITLE_CARD: TitleCard = {
  kicker: 'Ben Blaze in',
  words: ['Lieutenant', 'Fizz'],
  line: 'Episode 1 · The Cocoa Caper',
};
