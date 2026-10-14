// Lets a menu that does not fit its screen scroll inside its own area, with "more rows" chevrons at its edges.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  chevronScale,
  chevronSvg,
  menuViewport,
  MIN_STRIP,
  revealRow,
  scrollCues,
  snapScroll,
  snapViewport,
  stripLayout,
  uniformRowUnit,
  type RowBox,
} from './scroll';

export interface FitOptions {
  /** The least a row may be tall, in CSS pixels: the touch row height, or 0 where rows follow the glyph cell. */
  minRow: number;
  /**
   * Asks whether the selected row of `menu` is under the pointer (the mouse chose it by hovering), and takes the
   * flag: such a row is visible already, so only the nearest row boundary is found. Called once, for a menu that
   * scrolls.
   */
  takeHover?(menu: HTMLElement): boolean;
}

/**
 * Lays menus out to scroll when they overrun their screen. Rows keep their height; when the menu runs the screen
 * over, its height is cut by the overflow, then down to a whole number of rows (never fewer than two), and it
 * scrolls while everything else on the screen stays put. A cue strip, about half a row tall, is reserved above and
 * below the menu (as its margins) for the chevrons, paid for first from the pixels the cut frees; half of what is
 * left then goes above the menu as spacing. A chevron shows in a strip only when rows are out of view that way,
 * and the selected row is kept in view. A scrolling list lays every row out at the height of its tallest
 * (`--lf-menu-unit`), never under the minimum row height, so a row whose text wraps does not leave a sliver of
 * the next at an edge. A menu that fits is left alone. Call {@link fit} after the menu is drawn.
 */
export class MenuScroller {
  private readonly cues = new Map<HTMLElement, { up: HTMLElement; down: HTMLElement }>();
  private readonly chevronUrl = `data:image/svg+xml,${encodeURIComponent(chevronSvg('#ffffff', '#050507'))}`;

  /** Gives a screen its pair of chevrons, inert and hidden until its menu scrolls. */
  attach(screen: HTMLElement, menu: HTMLElement): void {
    screen.classList.add('menu-host');
    const cue = (dir: 'up' | 'down'): HTMLElement => {
      const c = document.createElement('div');
      c.className = `more ${dir}`;
      c.setAttribute('aria-hidden', 'true');
      c.hidden = true;
      const img = document.createElement('img');
      img.alt = '';
      img.src = this.chevronUrl;
      c.append(img);
      return c;
    };
    const cues = { up: cue('up'), down: cue('down') };
    this.cues.set(screen, cues);
    screen.append(cues.up, cues.down);
    menu.addEventListener('scroll', () => this.updateCues(screen, menu), { passive: true });
  }

  /** Lays out the menu showing on each screen. */
  fit(screens: readonly HTMLElement[], options: FitOptions): void {
    const { minRow } = options;
    for (const screen of screens) {
      const menus = [...screen.querySelectorAll<HTMLElement>('.menu:not(.pinned)')];
      const shown = menus.find((m) => !m.hidden && m.offsetParent);
      const keep = shown?.scrollTop ?? 0;
      for (const m of menus) {
        m.style.removeProperty('max-height');
        m.style.removeProperty('margin-top');
        m.style.removeProperty('margin-bottom');
        m.style.removeProperty('--lf-menu-unit');
        delete m.dataset['scroll'];
        delete m.dataset['unit'];
        delete m.dataset['strip'];
      }
      if (screen.hidden || !shown || !shown.firstElementChild) {
        this.updateCues(screen, null);
        continue;
      }
      let overflow = screen.scrollHeight - screen.clientHeight;
      if (overflow > 0) {
        // Snapping and the window maths assume one row height, so a scrolling list lays every row out at
        // the height of its tallest, though never under the minimum row.
        const heights = this.rowBoxes(shown).map((r) => r.height);
        const unit = uniformRowUnit(heights, minRow);
        if (heights.some((h) => Math.abs(h - unit) > 0.5)) {
          shown.style.setProperty('--lf-menu-unit', `${unit}px`);
          shown.dataset['unit'] = '';
          overflow = screen.scrollHeight - screen.clientHeight;
        }
      }
      const boxes = this.rowBoxes(shown);
      // The head and controls decide what is left; two rows and their strips are the least worth scrolling.
      const least = snapViewport(boxes, 0) + 2 * MIN_STRIP;
      let avail = menuViewport(shown.offsetHeight, overflow, least);
      if (avail !== null) {
        shown.dataset['scroll'] = '';
        this.layoutScroll(shown, boxes, avail);
        // A grid or a wrapped slot can leave some overflow after the first cut; take the rest off too.
        const left = screen.scrollHeight - screen.clientHeight;
        if (left > 0) {
          const used = shown.offsetHeight + this.stripOf(shown) * 2 + this.spareOf(shown);
          avail = menuViewport(used, left, least);
          if (avail !== null) this.layoutScroll(shown, boxes, avail);
        }
      }
      this.reveal(shown, keep, options.takeHover);
      this.updateCues(screen, shown);
    }
  }

  /**
   * Scrolls `menu` (from `from`) to a row boundary that shows its selected row (`data-sel`) whole, moving by the
   * fewest rows. A menu that does not scroll goes back to the top.
   */
  reveal(
    menu: HTMLElement,
    from = menu.scrollTop,
    takeHover?: (menu: HTMLElement) => boolean,
  ): void {
    if (!('scroll' in menu.dataset)) {
      menu.scrollTop = 0;
      return;
    }
    menu.scrollTop = from;
    const hovered = takeHover?.(menu) ?? false;
    const boxes = this.rowBoxes(menu);
    menu.scrollTop = hovered
      ? snapScroll(boxes, menu.scrollTop, menu.scrollHeight - menu.clientHeight)
      : revealRow(
          boxes,
          Number(menu.dataset['sel']),
          menu.scrollTop,
          menu.clientHeight,
          menu.scrollHeight,
        );
  }

  /** The cue strip, in px, reserved above and again below a scrolling menu (0 for one that fits). */
  private stripOf(menu: HTMLElement): number {
    return Number(menu.dataset['strip'] ?? 0);
  }

  /** The spare px set above a scrolling menu beyond its cue strip. */
  private spareOf(menu: HTMLElement): number {
    return Math.max(0, Number.parseFloat(menu.style.marginTop || '0') - this.stripOf(menu));
  }

  /** Cuts a scrolling `menu` to whole rows inside `avail` px and reserves its cue strips above and below. */
  private layoutScroll(menu: HTMLElement, boxes: RowBox[], avail: number): void {
    const rowH = boxes[0]?.height ?? 0;
    const { view, strip } = stripLayout(boxes, avail, Math.round(rowH / 2));
    const spare = Math.max(0, Math.floor((avail - view - 2 * strip) / 2));
    menu.style.maxHeight = `${view}px`;
    menu.style.marginTop = `${strip + spare}px`;
    menu.style.marginBottom = `${strip}px`;
    menu.dataset['strip'] = String(strip);
  }

  /** Where each row of `menu` sits in the menu's own pixels, whatever the menu is scrolled to. */
  private rowBoxes(menu: HTMLElement): RowBox[] {
    const top = menu.getBoundingClientRect().top - menu.scrollTop;
    return [...menu.querySelectorAll<HTMLElement>(':scope > button')].map((b) => {
      const r = b.getBoundingClientRect();
      return { top: r.top - top, height: r.height };
    });
  }

  /** Shows the "more above" and "more below" cues of `menu` (none when `menu` is null or fits). */
  private updateCues(screen: HTMLElement, menu: HTMLElement | null): void {
    const cues = this.cues.get(screen);
    if (!cues) return;
    const scrolls = !!menu && 'scroll' in menu.dataset;
    const c = scrolls
      ? scrollCues(menu.scrollTop, menu.clientHeight, menu.scrollHeight)
      : { above: false, below: false };
    cues.up.hidden = !c.above;
    cues.down.hidden = !c.below;
    if (!scrolls) return;
    const s = screen.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const strip = this.stripOf(menu);
    const max = Number.parseFloat(getComputedStyle(menu).getPropertyValue('--lf-n')) || 1;
    for (const cue of [cues.up, cues.down]) {
      cue.style.left = `${m.left - s.left}px`;
      cue.style.width = `${m.width}px`;
      cue.style.height = `${strip}px`;
      cue.style.setProperty('--lf-cue', String(chevronScale(strip, max)));
    }
    cues.up.style.top = `${m.top - s.top - strip}px`;
    cues.down.style.top = `${m.bottom - s.top}px`;
  }
}
