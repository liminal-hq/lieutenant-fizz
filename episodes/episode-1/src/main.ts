// Browser entry point that mounts the Episode 1 game on the stage element.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { Game } from './game';

const stage = document.getElementById('stage');
if (!stage) throw new Error('missing #stage');

const query = new URLSearchParams(location.search);

Game.start(stage, { previewStinger: query.has('previewStinger') })
  .then((game) => {
    if (query.has('debug')) {
      (window as unknown as { __lf: Game }).__lf = game;
    }
  })
  .catch(() => {
    /* the overlay already shows the error */
  });
