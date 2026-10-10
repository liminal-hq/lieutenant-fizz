// Chooses the whole-number pixel scales for the overlay from the window size.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  MAX_SCALE,
  MIN_SCALE,
  pixelScale,
  scaleSteps,
  type ScaleSteps,
  sidePadding,
  verticalPadding,
  wordmarkScale,
  wrapColumns,
} from '@lieutenant-fizz/engine/font/scale';

/** The room the touch controls take on each side of the menus, in CSS pixels (0 without them). */
export interface TouchGutters {
  left: number;
  right: number;
  /** Where content above the controls must stop on the left and right (0 for none). */
  leftTop: number;
  rightTop: number;
  /** The hand the controls are laid out for: `right` has the D-pad on the left. */
  hand: 'left' | 'right';
}

/** Below this height the wordmark steps down one scale on touch, to leave the menu its rows. */
export const SHORT_PHONE = 420;

export const NO_GUTTERS: TouchGutters = {
  left: 0,
  right: 0,
  leftTop: 0,
  rightTop: 0,
  hand: 'right',
};

/** How far from the bottom of the screen the touch prompt's lower edge is (`phone.css`), in CSS pixels. */
export const PROMPT_BOTTOM = 200;

/**
 * The room the prompt leaves on each side so it stays clear of a raised control. A side counts only
 * when its highest control rises above the line the prompt sits on (`bottom` up from the bottom of a
 * window `height` px tall); otherwise the prompt passes below it and the side is 0. With the controls in
 * their default places nothing rises that high, so the prompt is where it always was.
 */
export function promptClear(
  g: TouchGutters,
  height: number,
  bottom = PROMPT_BOTTOM,
): { left: number; right: number } {
  const line = height - bottom;
  return {
    left: g.leftTop > 0 && g.leftTop < line ? g.left : 0,
    right: g.rightTop > 0 && g.rightTop < line ? g.right : 0,
  };
}

/**
 * The CSS custom properties that size the overlay, for a window of this size. With touch gutters the
 * menus start right of the D-pad and end left of the buttons, so the wordmark and text columns are
 * sized for the width left between them, and the wordmark stays on one line (two would not fit the
 * height of a landscape phone).
 */
export function layoutVars(
  width: number,
  height: number,
  large: boolean,
  gutters: TouchGutters = NO_GUTTERS,
): Record<string, string> {
  const steps = scaleSteps(pixelScale(height, large));
  const padX = sidePadding(width);
  const touch = gutters.left > 0 || gutters.right > 0;
  const content = width - Math.max(padX, gutters.left) - Math.max(padX, gutters.right);
  const fitted = Math.min(
    Math.max(MIN_SCALE, Math.floor(content / 102)),
    steps.item + 3,
    MAX_SCALE,
  );
  const prompt = promptClear(gutters, height);
  const logo = touch
    ? Math.max(MIN_SCALE, height < SHORT_PHONE ? fitted - 1 : fitted)
    : wordmarkScale(width, padX, steps.item);
  return {
    '--lf-n': String(steps.item),
    '--lf-n-small': String(steps.small),
    '--lf-n-head': String(steps.head),
    '--lf-n-hint': String(steps.hint),
    '--lf-n-logo': String(logo),
    '--lf-cw-mul': String(steps.bullet),
    '--lf-pad-x': `${padX}px`,
    '--lf-pad-y': `${verticalPadding(height)}px`,
    '--lf-keys-bottom': `${Math.min(36, Math.max(16, Math.round(height * 0.04)))}px`,
    '--lf-thumb': String(steps.item >= 4 ? 2 : 1),
    '--lf-cols': String(wrapColumns(content, steps.small)),
    '--lf-touch-left': `${gutters.left}px`,
    '--lf-touch-right': `${gutters.right}px`,
    '--lf-prompt-left': `${prompt.left}px`,
    '--lf-prompt-right': `${prompt.right}px`,
  };
}

/** One way to set the title's wordmark: a pixel scale and one line or two. */
export interface TitleCandidate {
  logo: number;
  lines: 1 | 2;
}

/**
 * The wordmark sizes the split title tries, largest first: from the item scale plus three (never
 * above 6) down to 2, each on one line and then on two. The first that fits beside the menu and above
 * the D-pad is used.
 */
export function titleCandidates(steps: ScaleSteps): TitleCandidate[] {
  const out: TitleCandidate[] = [];
  for (let logo = Math.min(steps.item + 3, MAX_SCALE); logo >= MIN_SCALE; logo--) {
    out.push({ logo, lines: 1 }, { logo, lines: 2 });
  }
  return out;
}

/**
 * The heading scales the split menus try, largest first: from the heading scale down to 2. The heading
 * wraps inside its column, so a smaller scale is the only other way to make it shorter. The first that
 * fits above the D-pad is used.
 */
export function headCandidates(steps: ScaleSteps): number[] {
  const out: number[] = [];
  for (let n = steps.head; n >= MIN_SCALE; n--) out.push(n);
  return out;
}

/** Writes the layout variables onto an element (the document root, so floating captions see them). */
export function applyLayout(
  el: HTMLElement,
  width: number,
  height: number,
  large: boolean,
  gutters: TouchGutters = NO_GUTTERS,
): void {
  for (const [name, value] of Object.entries(layoutVars(width, height, large, gutters))) {
    el.style.setProperty(name, value);
  }
}

type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Calls `onChange` whenever the window is resized, the phone is turned (`orientationchange`) or the
 * visual viewport changes (a browser bar showing or hiding, a keyboard opening). Returns a function
 * that stops listening, so a disposed game does not stay reachable through the window.
 */
export function watchResize(
  onChange: () => void,
  target: Listenable = window,
  visual: Listenable | null = typeof window === 'undefined' ? null : window.visualViewport,
): () => void {
  target.addEventListener('resize', onChange);
  target.addEventListener('orientationchange', onChange);
  visual?.addEventListener('resize', onChange);
  return () => {
    target.removeEventListener('resize', onChange);
    target.removeEventListener('orientationchange', onChange);
    visual?.removeEventListener('resize', onChange);
  };
}

/**
 * The widest word each touch face holds, in glyph pixels at scale 1 (the condensed cut; "Select" is 29,
 * "Back" 20, and the Fizz count is up to three digits of 7). Jump's face holds Jump and Select, Pogo's
 * holds Pogo and Back, so a face keeps one scale in play and in a menu.
 */
export const TOUCH_WORD_GLYPHS = { jump: 29, pogo: 20, fire: 21 } as const;

/** The most the Fizz face shows: three digits, the width `TOUCH_WORD_GLYPHS.fire` is sized for. */
export const TOUCH_COUNT_MAX = 999;

/**
 * The Fizz count as the touch face shows it: the real count up to {@link TOUCH_COUNT_MAX}, then 999.
 * Soda adds ammo on every level load and nothing caps it, so a longer count would outgrow the round
 * face; the sim and the saves keep the real value, and the desktop HUD shows all of it.
 */
export const touchCount = (ammo: number): string =>
  String(Math.min(TOUCH_COUNT_MAX, Math.max(0, Math.trunc(ammo) || 0)));

/** The room a word keeps from the edge of its face, on each side, in CSS pixels. */
export const TOUCH_WORD_MARGIN = 4;

/**
 * The largest whole pixel scale at which a word `glyphs` pixels wide at scale 1 stays inside a round
 * face `face` px across with `margin` px to spare on each side. Never below 1, so a very small face
 * still shows its word.
 */
export function touchWordCap(face: number, glyphs: number, margin = TOUCH_WORD_MARGIN): number {
  if (!(glyphs > 0)) return MAX_SCALE;
  return Math.min(MAX_SCALE, Math.max(1, Math.floor((face - 2 * margin) / glyphs)));
}

/** Whether a window of this size is taller than it is wide (a phone held upright). */
export const isPortrait = (width: number, height: number): boolean => height > width;

/** The credits roll's transform for a given distance travelled, in whole CSS pixels. */
export const creditsTransform = (viewport: number, offset: number): string =>
  `translateY(${Math.round(viewport - offset)}px)`;

/** How far a sound caption floats up, in pixels. */
const CAPTION_RISE = 24;

/**
 * A sound caption's animation: it rises one pixel at a time and fades, with no scaling, so the
 * pixel font is never resampled to a fractional size or position.
 */
export function captionAnimation(): { keyframes: Keyframe[]; options: KeyframeAnimationOptions } {
  return {
    keyframes: [
      { transform: 'translateY(0px)', opacity: 1 },
      { transform: `translateY(-${CAPTION_RISE}px)`, opacity: 0 },
    ],
    options: { duration: 950, easing: `steps(${CAPTION_RISE}, end)` },
  };
}

/** The top-left corner, in whole pixels, that centres a caption of this size on a point. */
export const captionPosition = (
  x: number,
  y: number,
  width: number,
  height: number,
): { left: number; top: number } => ({
  left: Math.round(x - width / 2),
  top: Math.round(y - height / 2),
});
