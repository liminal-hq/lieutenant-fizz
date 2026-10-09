// Browser entry point that mounts the Episode 1 game on the stage element.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  parseFullscreenParam,
  parseHostParam,
  parseWakeParam,
} from '@lieutenant-fizz/engine/lifecycle-policy';
import { parseAudioParam } from '@lieutenant-fizz/engine/sound-field';
import { Game } from './game';
import { parseHapticsParam } from './url-lock';

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

// Haptics (the phone's vibration and a controller's rumble) are on where the device has them. `?haptics`
// (or `?haptics=on`) forces them on and `?haptics=off` forces them off, for this visit only.
const haptics = parseHapticsParam(query.get('haptics'));

// `?fullscreen` (or `=on`) asks for fullscreen on every device when a run starts, `?fullscreen=off` never
// does; left out, touch devices do. `?debug&host=app` pretends to be the native app.
const fullscreen = parseFullscreenParam(query.get('fullscreen'));
const host = parseHostParam(query.get('host'), query.has('debug'));
// `?wake=off` never keeps the screen on, `?wake` (or `=on`) does while playing; left out, it is on.
const wake = parseWakeParam(query.get('wake'));

// `?back` makes the browser's Back button the game's in an ordinary tab, to try it without fullscreen.

Game.start(stage, {
  previewStinger: query.has('previewStinger'),
  touch: query.has('touch'),
  back: query.has('back'),
  ...(haptics ? { haptics } : {}),
  ...(pixels ? { pixels } : {}),
  ...(audio ? { audio } : {}),
  ...(title ? { title } : {}),
  ...(fullscreen ? { fullscreen } : {}),
  ...(host ? { host } : {}),
  ...(wake ? { wake } : {}),
})
  .then((game) => {
    if (query.has('debug')) {
      (window as unknown as { __lf: Game }).__lf = game;
      // The labs: a Lab button for auditioning and tuning the sound and the haptics. `?debug&lab` opens
      // the sound lab and `?debug&lab=haptics` the haptics lab.
      void game.debugLab(query.get('lab') === 'haptics' ? 'haptics' : query.has('lab'));
      // `?debug&level=N` starts straight in level N, so a phone can show a level without a keyboard.
      const level = query.get('level');
      if (level !== null) game.debugEnterLevel(Number.parseInt(level, 10));
    }
  })
  .catch(() => {
    /* the overlay already shows the error */
  });
