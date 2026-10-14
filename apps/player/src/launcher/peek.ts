// The Back gesture's peek on the launcher: a copy of the screen being left slides away over the screen Back goes to.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { BackPeek, type PeekStyle } from '@lieutenant-fizz/engine/back-peek';

export interface LauncherPeekDeps {
  /** The launcher's screen, the one that is lifted. */
  root: HTMLElement;
  /** The element that holds the screen, which says a peek is on and carries its look. */
  ui: HTMLElement;
  /** Whether the screen on show has somewhere to go on Back, and so a peek. */
  canPeek(): boolean;
  /** Draws the real screen as the one Back goes to. */
  showParent(): void;
  /** Draws the real screen as it really is, once the peek is over. */
  showCurrent(): void;
  /** Whether motion is reduced: the peek then only fades. */
  reducedMotion(): boolean;
}

/** The properties a peek sets on the holder, which a finished peek takes off again. */
const HOLDER_VARS = ['--lf-peek-parent-a', '--lf-peek-parent-v', '--lf-peek-w'] as const;

/**
 * The launcher's peek. It uses the engine's `BackPeek` for the gesture's timing and the look of each frame; this is
 * the page's side of it. When a peek starts a copy of the screen being left is laid over it and the real screen is
 * redrawn as the screen Back goes to, which takes no taps and fades in as the copy slides and fades away. When it
 * ends, the copy goes and the real screen is drawn as it is.
 */
export function createLauncherPeek(deps: LauncherPeekDeps): BackPeek {
  const { root, ui } = deps;
  let ghost: HTMLElement | null = null;

  const end = (): void => {
    ghost?.remove();
    ghost = null;
    delete ui.dataset['peeking'];
    for (const name of HOLDER_VARS) ui.style.removeProperty(name);
    deps.showCurrent();
  };

  return new BackPeek(
    {
      begin() {
        if (!deps.canPeek()) return false;
        const copy = root.cloneNode(true) as HTMLElement;
        copy.classList.add('peek-ghost');
        copy.setAttribute('aria-hidden', 'true');
        copy.inert = true;
        copy.dataset['peek'] = 'drag';
        root.after(copy);
        ghost = copy;
        ui.dataset['peeking'] = 'drag';
        ui.style.setProperty('--lf-peek-parent-a', '0');
        ui.style.setProperty('--lf-peek-parent-v', 'hidden');
        ui.style.setProperty('--lf-peek-w', '0');
        deps.showParent();
        return true;
      },
      apply(style: PeekStyle, settle: boolean) {
        if (!ghost) return;
        ghost.dataset['peek'] = settle ? 'settle' : 'drag';
        ghost.style.setProperty('--lf-peek-x', `${style.translateXPercent}%`);
        ghost.style.setProperty('--lf-peek-a', String(style.opacity));
        ghost.style.setProperty('--lf-peek-feather', `${Math.round(style.feather * 1000) / 10}%`);
        ghost.dataset['peekEdge'] = style.featherEdge;
        ui.dataset['peeking'] = settle ? 'settle' : 'drag';
        ui.style.setProperty('--lf-peek-parent-a', String(style.parentOpacity));
        ui.style.setProperty(
          '--lf-peek-parent-v',
          style.parentOpacity > 0 || settle ? 'visible' : 'hidden',
        );
      },
      end,
    },
    {
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id),
      frame: (fn) => requestAnimationFrame(fn),
      cancelFrame: (id) => cancelAnimationFrame(id),
    },
    deps.reducedMotion,
  );
}
