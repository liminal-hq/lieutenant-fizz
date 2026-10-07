// Episode configuration shape: the per-episode content the shared shell flow consumes.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { CreditsContent } from './credits';
import type { StingerContent } from './stinger';

/** What an episode supplies to the ending flow (ending panels, credits, optional stinger, score card). */
export interface EpisodeConfig {
  credits: CreditsContent;
  /** Post-credits stinger, or `null` for episodes that end on the score card. */
  stinger: StingerContent | null;
}
