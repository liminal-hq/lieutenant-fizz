// Browser entry point that mounts the Episode 1 game on the stage element.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { Game } from './game';

const stage = document.getElementById('stage');
if (!stage) throw new Error('missing #stage');

const query = new URLSearchParams(location.search);

Game.start(stage, { previewStinger: query.has('previewStinger'), touch: query.has('touch') })
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
