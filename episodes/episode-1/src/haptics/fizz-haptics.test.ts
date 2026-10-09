// Tests for Episode 1's haptic cue table.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { compileVibrate, patternLength, totalTime } from '@lieutenant-fizz/engine/haptic-pattern';
import { FIZZ_HAPTICS } from './fizz-haptics';

describe('FIZZ_HAPTICS', () => {
  it('maps every caption to a cue that exists', () => {
    for (const [text, id] of Object.entries(FIZZ_HAPTICS.captions))
      if (id !== null) expect(FIZZ_HAPTICS.cues[id], text).toBeDefined();
  });

  it('compiles every cue to something short enough to send', () => {
    for (const [id, cue] of Object.entries(FIZZ_HAPTICS.cues)) {
      const out = compileVibrate(cue.pattern);
      expect(out.length, id).toBeGreaterThan(0);
      expect(totalTime(out), id).toBeLessThanOrEqual(1000);
      expect(patternLength(cue.pattern), id).toBeLessThanOrEqual(1000);
    }
  });

  it('keeps menu cues in the ui lane and the rest in the game lane', () => {
    for (const [id, cue] of Object.entries(FIZZ_HAPTICS.cues))
      expect(cue.lane, id).toBe(id.startsWith('ui.') ? 'ui' : 'game');
  });
});
