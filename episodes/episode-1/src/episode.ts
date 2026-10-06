// Episode 1 configuration: credits content and the (absent) post-credits stinger.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { EpisodeConfig } from '@lieutenant-fizz/engine/episode';
import { CREDITS } from './credits';

/** Episode 1 ends on the score card after its credits; the stinger belongs to Episode 3. */
export const EPISODE: EpisodeConfig = {
  credits: CREDITS,
  stinger: null,
};
