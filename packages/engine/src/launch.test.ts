// Tests for the launch contract.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { launchUrl, parseLaunch, type Launch } from './launch';

describe('reading the launch contract', () => {
  it('reads continue, new and a slot to load', () => {
    expect(parseLaunch('?launch=continue')).toEqual({ kind: 'continue' });
    expect(parseLaunch('?launch=new')).toEqual({ kind: 'new' });
    expect(parseLaunch('?launch=load:auto')).toEqual({ kind: 'load', slot: 'auto' });
    expect(parseLaunch('?launch=load:3')).toEqual({ kind: 'load', slot: 3 });
    expect(parseLaunch('?debug&launch=new')).toEqual({ kind: 'new' });
  });

  it('is no launch for nothing, an unknown value or a slot that does not exist', () => {
    expect(parseLaunch('')).toBeUndefined();
    expect(parseLaunch('?debug')).toBeUndefined();
    expect(parseLaunch('?launch=')).toBeUndefined();
    expect(parseLaunch('?launch=play')).toBeUndefined();
    expect(parseLaunch('?launch=load')).toBeUndefined();
    expect(parseLaunch('?launch=load:5')).toBeUndefined();
    expect(parseLaunch('?launch=load:0')).toBeUndefined();
    expect(parseLaunch('?launch=load:x')).toBeUndefined();
  });
});

describe('writing the launch contract', () => {
  it('round trips every launch through its URL', () => {
    const launches: Launch[] = [
      { kind: 'continue' },
      { kind: 'new' },
      { kind: 'load', slot: 'auto' },
      { kind: 'load', slot: 1 },
      { kind: 'load', slot: 4 },
    ];
    for (const launch of launches) {
      const url = launchUrl('episode-1/index.html', launch);
      expect(parseLaunch(url.slice(url.indexOf('?')))).toEqual(launch);
    }
  });

  it('keeps the rest of the page and its query', () => {
    expect(launchUrl('episode-1/index.html', { kind: 'new' })).toBe(
      'episode-1/index.html?launch=new',
    );
    expect(launchUrl('episode-1/index.html?debug', { kind: 'load', slot: 2 })).toBe(
      'episode-1/index.html?debug=&launch=load:2',
    );
    expect(launchUrl('episode-1/index.html?launch=new', { kind: 'continue' })).toBe(
      'episode-1/index.html?launch=continue',
    );
  });
});
