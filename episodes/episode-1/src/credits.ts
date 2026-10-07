// Episode 1 credits content for the roll shown after the ending panels.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { CreditsContent } from '@lieutenant-fizz/engine/credits';

/** The Episode 1 credits. Other episodes supply their own through their episode config. */
export const CREDITS: CreditsContent = {
  title: 'Lieutenant Fizz',
  subtitle: 'Episode 1 · The Cocoa Caper',
  sections: [
    {
      head: 'Starring',
      lines: [
        { role: 'Neighbourhood tinkerer', name: 'Ben “Lieutenant Fizz” Blaze' },
        { role: 'Local genius', name: 'Billy Blaze' },
        { role: 'Chocolate castle architect', name: 'Mildred McMire' },
        { role: 'Hiding in the shadows somewhere', name: 'Mortimer McMire' },
        { role: 'Itself', name: 'The Cocoa Colossus' },
      ],
    },
    {
      head: 'Made by',
      lines: [
        { role: 'Game design, story, and code', name: 'Scott Morris' },
        { role: 'Studio', name: 'Liminal HQ' },
      ],
    },
    {
      head: 'Built with',
      lines: [
        { role: 'Engine', name: 'Liminal Retro Engine' },
        { role: 'Sound and music', name: 'Undertone' },
        { role: 'Rendering', name: 'Three.js' },
        { role: 'Interface', name: 'Afterglow' },
      ],
    },
  ],
  thanks: 'Thanks for playing',
  thanksLine: 'Billy’s home and the cocoa’s back.',
  returnLine: 'Lieutenant Fizz will return.',
};
