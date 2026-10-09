// Browser entry point that mounts the Episode 1 game on the stage element.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { parseAudioParam } from '@lieutenant-fizz/engine/sound-field';
import { Game } from './game';

const stage = document.getElementById('stage');
if (!stage) throw new Error('missing #stage');

const query = new URLSearchParams(location.search);

// `?pixels=sharp` draws at a whole pixel scale and `?pixels=soft` keeps the fractional one. Anything
// else leaves the choice to the device (touch is Sharp, desktop is Soft).
const pixelsParam = query.get('pixels');
const pixels = pixelsParam === 'sharp' || pixelsParam === 'soft' ? pixelsParam : undefined;

// Sound effects are placed in the stereo field (Enhanced) unless `?audio=classic` keeps the sound as
// it has always been. `?audio=enhanced` is the default spelled out. Anything else leaves the default.
const audio = parseAudioParam(query.get('audio'));

// `?title=split` tries the phone title with the logo and the menu on opposite sides.
const title = query.get('title') === 'split' ? 'split' : undefined;

// `?back` makes the browser's Back button the game's in an ordinary tab, to try it without fullscreen.

Game.start(stage, {
  previewStinger: query.has('previewStinger'),
  touch: query.has('touch'),
  back: query.has('back'),
  ...(pixels ? { pixels } : {}),
  ...(audio ? { audio } : {}),
  ...(title ? { title } : {}),
})
  .then((game) => {
    if (query.has('debug')) {
      (window as unknown as { __lf: Game }).__lf = game;
      // `?debug&level=N` starts straight in level N, so a phone can show a level without a keyboard.
      const level = query.get('level');
      if (level !== null) game.debugEnterLevel(Number.parseInt(level, 10));
    }
  })
  .catch(() => {
    /* the overlay already shows the error */
  });
