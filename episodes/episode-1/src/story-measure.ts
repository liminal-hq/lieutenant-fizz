// Measures story pages in the real letterbox, so packing fits what the text box renders.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { allowedLines, type PageFit } from '@lieutenant-fizz/engine/story-pages';

/** The share of the screen height a phone's bottom strip may take with three lines in it. */
export const STRIP_SHARE = 0.3;
/** The lines a page may take on a desktop window, where the opaque bar's text box reserves three. */
export const DESKTOP_LINES = 3;

/** What one measurement found. */
export interface StoryMeasure {
  fit: PageFit;
  /** The most lines a page may take. */
  allowed: number;
  /** The text box's width, and its width beside the button that leaves the intro. */
  width: number;
  lastWidth: number;
  lineHeight: number;
  fontSize: number;
  /** The strip's height with `allowed` lines, as a share of the screen height. */
  share: number;
  touch: boolean;
}

/**
 * Counts the lines a text takes in the story's text box. A hidden copy of the box (same class, so the
 * same font, size, line height and wrapping rules) is given the real box's measured width and filled
 * with the candidate text; its height over the line height is the line count. Results are cached by
 * width and type size, and `invalidate` drops them when the layout or the font changes.
 */
export class StoryMeasurer {
  private readonly probe: HTMLElement;
  private cache = new Map<string, number>();
  private cacheKey = '';
  /** How many times the layout was measured afresh, for tests. */
  measures = 0;

  constructor(private readonly letterbox: HTMLElement) {
    this.probe = document.createElement('div');
    this.probe.className = 'text probe';
    this.probe.setAttribute('aria-hidden', 'true');
    this.letterbox.querySelector('.bar.bottom')?.append(this.probe);
  }

  /** Forgets every count; the next page is measured afresh. */
  invalidate(): void {
    this.cache.clear();
    this.cacheKey = '';
  }

  /**
   * Measures the text box now and returns how to fit pages into it. `lastWord` is true for the intro,
   * whose last page sits beside the word "Step out" rather than an arrow.
   */
  measure(lastWord: boolean): StoryMeasure {
    this.measures++;
    return this.visible(() => {
      const lb = this.letterbox;
      const q = (s: string): HTMLElement => lb.querySelector<HTMLElement>(s)!;
      const text = q('.text:not(.probe)');
      const bottom = q('.bar.bottom');
      const next = q('.next');
      // The box is as wide as the grid leaves beside the button, so measure it with the button as each
      // page shows it: an arrow (and "Continue" for a screen reader) on every page but the intro's last,
      // which has the word "Step out". The button is put back as it was.
      const lbl = q('.next .lbl');
      const was = [lbl.textContent, next.hasAttribute('data-word')] as const;
      const widthWith = (word: boolean): number => {
        lbl.textContent = word ? 'Step out' : 'Continue';
        next.toggleAttribute('data-word', word);
        return text.getBoundingClientRect().width;
      };
      const width = widthWith(false);
      const lastWidth = lastWord ? widthWith(true) : width;
      lbl.textContent = was[0];
      next.toggleAttribute('data-word', was[1]);
      const cs = getComputedStyle(this.probe);
      const lineHeight = parseFloat(cs.lineHeight);
      const fontSize = parseFloat(cs.fontSize);
      const height = lb.getBoundingClientRect().height;
      const touch = lb.closest('[data-touch]') !== null;
      const pad = (s: CSSStyleDeclaration): number =>
        parseFloat(s.paddingTop) + parseFloat(s.paddingBottom);
      const chrome = pad(getComputedStyle(bottom));
      const button = next.getBoundingClientRect().height;
      const allowed = touch
        ? allowedLines({
            height,
            lineHeight,
            chrome,
            floor: button,
            maxShare: STRIP_SHARE,
            most: 3,
            least: 2,
          })
        : DESKTOP_LINES;
      // The text box keeps this many lines, so the strip does not jump between pages.
      lb.style.setProperty('--lf-story-lines', String(allowed));
      const key = `${width}|${lastWidth}|${fontSize}|${lineHeight}`;
      if (key !== this.cacheKey) {
        this.cache.clear();
        this.cacheKey = key;
      }
      const fitsAt = (w: number) => (t: string) => this.lines(t, w, lineHeight) <= allowed;
      const fit: PageFit = { fits: fitsAt(width) };
      if (lastWidth !== width) fit.fitsLast = fitsAt(lastWidth);
      const strip = chrome + Math.max(allowed * lineHeight, button);
      return {
        fit,
        allowed,
        width,
        lastWidth,
        lineHeight,
        fontSize,
        share: height > 0 ? strip / height : 0,
        touch,
      };
    });
  }

  /** The lines `text` takes at `width`, from the cache or the hidden copy of the box. */
  lines(text: string, width: number, lineHeight: number): number {
    const key = `${width}|${text}`;
    const known = this.cache.get(key);
    if (known !== undefined) return known;
    const n = this.visible(() => {
      const p = this.probe;
      p.style.cssText = `width:${width}px;max-width:none;min-height:0;margin:0`;
      p.textContent = text;
      return Math.round(p.getBoundingClientRect().height / lineHeight);
    });
    this.cache.set(key, n);
    return n;
  }

  /** Runs `fn` with the letterbox laid out, even when it is hidden, and puts it back. */
  private visible<T>(fn: () => T): T {
    const hidden = this.letterbox.hidden;
    if (hidden) this.letterbox.hidden = false;
    try {
      return fn();
    } finally {
      if (hidden) this.letterbox.hidden = true;
    }
  }
}
