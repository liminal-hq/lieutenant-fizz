// Credits content types and the pure state machine behind the scrolling or paged credits roll.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** One credited line: a role on the left and a name on the right. */
export interface CreditLine {
  role: string;
  name: string;
}

/** A titled group of credited lines. */
export interface CreditSection {
  head: string;
  lines: CreditLine[];
}

/** Everything an episode supplies for its credits. */
export interface CreditsContent {
  /** Title card shown at the start of the roll. */
  title: string;
  subtitle: string;
  sections: CreditSection[];
  /** Closing heading the roll holds on. */
  thanks: string;
  /** Line under the closing heading. */
  thanksLine: string;
  /** Final line that fades in once the roll has stopped. */
  returnLine: string;
}

/** The pages used by the reduced-motion alternative: title card, one per section, then the close. */
export function creditsPageCount(content: CreditsContent): number {
  return content.sections.length + 2;
}

/** What a press of the Jump (or Enter) control did. */
export type CreditsAction = 'speedUp' | 'normalSpeed' | 'nextPage' | 'finish';

export interface CreditsOptions {
  /** Paged and unscrolled, for players who ask for reduced motion. */
  reduced: boolean;
  /** Number of pages in the paged alternative. */
  pages: number;
  /** Multiplier applied while speeding up. */
  fastFactor?: number;
}

/** Slowest scroll speed in pixels per second, whatever the viewport height. */
export const CREDITS_MIN_SPEED = 40;
/** Scroll speed as a fraction of the viewport height per second. */
export const CREDITS_SPEED_FRACTION = 0.1;
/** Longest frame step accepted, so a stalled tab does not jump the roll. */
export const CREDITS_MAX_STEP = 0.05;

/**
 * The credits sequencing: rolling, then held on the closing card until the player continues.
 * The host measures the layout and calls `layout`, then `tick`s with real or injected frame
 * times, so the sequencing needs no clock or DOM of its own.
 */
export class CreditsRoll {
  private distance = 0;
  private total = 0;
  private speed = CREDITS_MIN_SPEED;
  private fast = false;
  private pageIndex = 0;
  private left = false;
  private readonly factor: number;

  constructor(private readonly opts: CreditsOptions) {
    this.factor = opts.fastFactor ?? 4;
  }

  get reduced(): boolean {
    return this.opts.reduced;
  }

  get sped(): boolean {
    return this.fast;
  }

  get page(): number {
    return this.pageIndex;
  }

  /** True once the roll has reached the closing card (or the last page). */
  get held(): boolean {
    return this.opts.reduced ? this.pageIndex >= this.opts.pages - 1 : this.distance >= this.total;
  }

  /** True after the player has skipped or continued out of the credits. */
  get finished(): boolean {
    return this.left;
  }

  /** Scroll offset from the start position, in pixels (always 0 in the reduced-motion form). */
  get offset(): number {
    return this.opts.reduced ? 0 : this.distance;
  }

  /**
   * Sets the scroll geometry: `total` pixels to travel from the off-screen start to the closing
   * card, with `viewport` the visible height. Progress is kept (and clamped) across re-layouts.
   */
  layout(viewport: number, total: number): void {
    this.total = Math.max(0, total);
    this.speed = Math.max(CREDITS_MIN_SPEED, viewport * CREDITS_SPEED_FRACTION);
    this.distance = Math.min(this.distance, this.total);
  }

  /** Advances the roll by `dt` seconds. */
  tick(dt: number): void {
    if (this.opts.reduced || this.left || this.held) return;
    const step = Math.min(CREDITS_MAX_STEP, Math.max(0, dt));
    this.distance = Math.min(
      this.total,
      this.distance + step * this.speed * (this.fast ? this.factor : 1),
    );
  }

  /** Jump (or Enter): speed up or slow down while rolling, turn the page, or continue when held. */
  press(): CreditsAction {
    if (this.opts.reduced) {
      if (this.held) {
        this.left = true;
        return 'finish';
      }
      this.pageIndex += 1;
      return 'nextPage';
    }
    if (this.held) {
      this.left = true;
      return 'finish';
    }
    this.fast = !this.fast;
    return this.fast ? 'speedUp' : 'normalSpeed';
  }

  /** Esc or Start: leaves the credits at once. */
  skip(): void {
    this.left = true;
  }
}
