// The Back gesture's peek: how far the screen has slid and faded for a gesture's progress, and the state of one peek.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The screen edge a back gesture started from, as Android's `BackEvent.swipeEdge` says. */
export type SwipeEdge = 'left' | 'right';

/** How the screen being left looks at one moment of the gesture. */
export interface PeekStyle {
  /** The slide, in percent of the screen's own width: positive is rightwards. */
  translateXPercent: number;
  /** 1 at rest, 0 once the screen has faded away. */
  opacity: number;
}

/** The furthest the screen slides, in percent of its width. */
export const PEEK_SLIDE_PERCENT = 30;
/** The progress by which the screen has fully faded. */
export const PEEK_FADE_BY = 0.9;
/** How long the screen takes to glide back to rest after a cancelled gesture, in milliseconds. */
export const PEEK_SETTLE_MS = 200;
/** How long a peek waits for the next gesture event before it lets go and puts the screen back. */
export const PEEK_TIMEOUT_MS = 3000;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * The look of the screen for a gesture's progress (0 to 1). It slides in the direction of the swipe, as
 * Android's own back preview does (a swipe from the left edge moves it right) and fades out by
 * `PEEK_FADE_BY`. Progress 0 is exactly the rest state. With reduced motion it only fades.
 */
export function peekStyle(progress: number, edge: SwipeEdge, reducedMotion: boolean): PeekStyle {
  const p = clamp01(progress);
  const fade = clamp01(p / PEEK_FADE_BY);
  const opacity = 1 - fade * fade * (3 - 2 * fade);
  if (reducedMotion) return { translateXPercent: 0, opacity };
  const slide = PEEK_SLIDE_PERCENT * (1 - (1 - p) * (1 - p));
  // `+ 0` turns a negative zero into zero.
  return { translateXPercent: (edge === 'right' ? -slide : slide) + 0, opacity };
}

/** What a peek needs of the game and the page. */
export interface PeekHost {
  /** Starts the peek if the screen showing has one: shows what Back goes to and lifts the screen being left. False when it has none. */
  begin(): boolean;
  /** Puts the screen being left in a look. `settle` animates the change over `PEEK_SETTLE_MS`. */
  apply(style: PeekStyle, settle: boolean): void;
  /** Ends the peek: removes the lifted screen and shows the real one again. */
  end(): void;
}

/** The timers a peek uses, so a test can drive them. */
export interface PeekClock {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  /** Runs `fn` before the next frame. */
  frame(fn: () => void): number;
  cancelFrame(id: number): void;
}

type PeekPhase = 'idle' | 'dragging' | 'settling';

/**
 * One Back gesture's peek. `started`, `progress` and `cancelled` move the screen; the game ends a
 * committed gesture with `end()` once it has gone back. It never leaves the screen lifted: any event
 * re-arms a timeout, and `end()` is safe to call at any time (a screen change, the app hiding).
 */
export class BackPeek {
  private phase: PeekPhase = 'idle';
  private edge: SwipeEdge = 'left';
  private latest = 0;
  private timer: number | null = null;
  private frameId: number | null = null;

  constructor(
    private readonly host: PeekHost,
    private readonly clock: PeekClock,
    private readonly reduced: () => boolean,
  ) {}

  /** A peek is on, dragging or gliding back. */
  get active(): boolean {
    return this.phase !== 'idle';
  }

  started(edge: SwipeEdge = 'left'): void {
    if (this.phase === 'dragging') return;
    if (this.phase === 'settling') this.end();
    if (!this.host.begin()) return;
    this.phase = 'dragging';
    this.edge = edge;
    this.latest = 0;
    this.host.apply(peekStyle(0, edge, this.reduced()), false);
    this.arm(PEEK_TIMEOUT_MS, () => this.end());
  }

  progress(progress: number, edge?: SwipeEdge): void {
    if (this.phase !== 'dragging') return;
    if (edge) this.edge = edge;
    this.latest = progress;
    this.arm(PEEK_TIMEOUT_MS, () => this.end());
    if (this.frameId !== null) return;
    this.frameId = this.clock.frame(() => {
      this.frameId = null;
      if (this.phase === 'dragging')
        this.host.apply(peekStyle(this.latest, this.edge, this.reduced()), false);
    });
  }

  /** The gesture was cancelled: glide back to rest, then end. */
  cancelled(): void {
    if (this.phase !== 'dragging') return;
    this.dropFrame();
    this.phase = 'settling';
    this.host.apply(peekStyle(0, this.edge, this.reduced()), true);
    this.arm(PEEK_SETTLE_MS, () => this.end());
  }

  /** Ends the peek at once. */
  end(): void {
    if (this.phase === 'idle') return;
    this.phase = 'idle';
    this.dropFrame();
    this.disarm();
    this.host.end();
  }

  private arm(ms: number, fn: () => void): void {
    this.disarm();
    this.timer = this.clock.setTimeout(fn, ms);
  }

  private disarm(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private dropFrame(): void {
    if (this.frameId !== null) this.clock.cancelFrame(this.frameId);
    this.frameId = null;
  }
}
