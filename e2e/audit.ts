// A layout audit that runs in the page: overflow, clipped text, pixel type sizes and the hint bar.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export interface Report {
  pageOverflow: string[];
  outside: string[];
  badSize: string[];
  clipped: string[];
  crowdsHints: string[];
  /** Menu rows shorter than the touch row height (`--lf-menu-row`), which they keep however many there are. */
  shortRows: string[];
  /** The selected row, when it is not wholly inside its menu's view. */
  selectedHidden: string[];
  /** A scrolling menu that overlaps the head, the Back button, the hint bar or a touch control. */
  menuCrowds: string[];
  /** How many text elements were inspected, so an empty page cannot pass by accident. */
  checked: number;
}

/** Space the system keeps for itself (a cutout, the bars), in CSS pixels. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AuditOptions {
  /** Selectors whose visible text is checked. Defaults to the overlay, `#ui`. */
  roots?: string[];
  /** When given, text must sit inside the window shrunk by these insets (the safe area). */
  insets?: Insets;
}

/**
 * Runs in the page (pass it to `page.evaluate` with its options), so it cannot use anything from this
 * module's scope: collects every layout problem on the screen that is showing.
 */
export function audit(options: AuditOptions = {}): Report {
  const report: Report = {
    pageOverflow: [],
    outside: [],
    badSize: [],
    clipped: [],
    crowdsHints: [],
    shortRows: [],
    selectedHidden: [],
    menuCrowds: [],
    checked: 0,
  };
  const w = window.innerWidth;
  const h = window.innerHeight;
  const roots = options.roots ?? ['#ui'];
  const inset = options.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const de = document.documentElement;
  if (de.scrollWidth > w || de.scrollHeight > h) {
    report.pageOverflow.push(`${de.scrollWidth}x${de.scrollHeight} in ${w}x${h}`);
  }
  const visible = (e: Element): boolean => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return (
      r.width > 0 &&
      r.height > 0 &&
      cs.visibility !== 'hidden' &&
      cs.display !== 'none' &&
      Number(cs.opacity) > 0
    );
  };
  const name = (e: Element): string =>
    `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${typeof e.className === 'string' && e.className ? `.${e.className.split(' ').join('.')}` : ''} “${(e.textContent ?? '').trim().slice(0, 24)}”`;
  const hasText = (e: Element): boolean =>
    [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim());
  // A menu that does not fit scrolls (`data-scroll`): a row scrolled out of its view is not on screen, so
  // it is neither outside the window nor crowding the hints. Rows cut at an edge count by what shows.
  const view = (e: Element): DOMRect | null => {
    const m = e.closest('[data-scroll]');
    return m ? m.getBoundingClientRect() : null;
  };
  const shown = (e: Element, r: DOMRect): boolean => {
    const v = view(e);
    return !v || (r.bottom > v.top + 0.5 && r.top < v.bottom - 0.5);
  };
  const texts = roots
    .flatMap((root) => [...document.querySelectorAll(`${root} *`)])
    .filter((e) => visible(e) && hasText(e))
    .filter((e) => shown(e, e.getBoundingClientRect()));
  report.checked = texts.length;
  const keys = [...document.querySelectorAll('#ui .keys')].find(visible);
  const keysRect = keys?.getBoundingClientRect();
  for (const e of texts) {
    const full = e.getBoundingClientRect();
    const v = view(e);
    // What shows of a row cut by its menu's edge: the part inside the view.
    const r = v
      ? new DOMRect(
          full.x,
          Math.max(full.top, v.top),
          full.width,
          Math.min(full.bottom, v.bottom) - Math.max(full.top, v.top),
        )
      : full;
    const cs = getComputedStyle(e);
    if (
      r.left < inset.left - 0.5 ||
      r.top < inset.top - 0.5 ||
      r.right > w - inset.right + 0.5 ||
      r.bottom > h - inset.bottom + 0.5
    ) {
      report.outside.push(
        `${name(e)} at ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)}`,
      );
    }
    const px = parseFloat(cs.fontSize);
    const n = px / 11;
    if (!Number.isInteger(n) || n < 2 || n > 6 || !cs.fontFamily.includes('Fizz')) {
      report.badSize.push(`${name(e)} is ${cs.fontSize} ${cs.fontFamily}`);
    }
    if (
      cs.display !== 'inline' &&
      e.scrollWidth > e.clientWidth + 1 &&
      cs.overflowX === 'visible'
    ) {
      report.clipped.push(`${name(e)} scrollWidth ${e.scrollWidth} > ${e.clientWidth}`);
    }
    if (keysRect && !keys?.contains(e) && e.id !== 'attractTag') {
      const overlap =
        Math.min(r.right, keysRect.right) > Math.max(r.left, keysRect.left) + 1 &&
        Math.min(r.bottom, keysRect.bottom) > Math.max(r.top, keysRect.top) + 1;
      if (overlap) report.crowdsHints.push(name(e));
    }
  }
  const touch = !!document.querySelector('#stage[data-touch]');
  const rowMin = parseFloat(getComputedStyle(de).getPropertyValue('--lf-menu-row'));
  const faces = [...document.querySelectorAll('#touch [data-control] .face')]
    .filter(visible)
    .map((f) => f.getBoundingClientRect());
  const back = document.getElementById('backBtn');
  const backRect = back && visible(back) ? back.getBoundingClientRect() : null;
  const hit = (a: DOMRect, b: DOMRect): boolean =>
    Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
    Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;
  for (const menu of document.querySelectorAll<HTMLElement>('.menu')) {
    if (!visible(menu)) continue;
    const mr = menu.getBoundingClientRect();
    const rows = [...menu.querySelectorAll<HTMLElement>(':scope > button')];
    if (touch && rowMin > 0) {
      for (const b of rows) {
        if (b.getBoundingClientRect().height < rowMin - 0.5) report.shortRows.push(name(b));
      }
    }
    const sel = menu.querySelector<HTMLElement>(':scope > button.sel');
    if (sel && 'scroll' in menu.dataset) {
      const sr = sel.getBoundingClientRect();
      if (sr.top < mr.top - 0.5 || sr.bottom > mr.bottom + 0.5)
        report.selectedHidden.push(name(sel));
    }
    if (!('scroll' in menu.dataset)) continue;
    const others: [string, DOMRect | null | undefined][] = [
      ['Back button', backRect],
      ['hint bar', keysRect],
      [
        'heading',
        (
          menu.closest('.screen')?.querySelector('h2, .head') as HTMLElement | null
        )?.getBoundingClientRect(),
      ],
      ...faces.map((f): [string, DOMRect] => ['touch control', f]),
    ];
    for (const [what, o] of others) {
      if (o && o.width > 0 && hit(mr, o)) report.menuCrowds.push(`menu overlaps the ${what}`);
    }
  }
  for (const id of ['title', 'overlay']) {
    const e = document.getElementById(id);
    if (e && visible(e) && e.scrollHeight > e.clientHeight + 1) {
      report.clipped.push(`#${id} scrolls: ${e.scrollHeight} > ${e.clientHeight}`);
    }
  }
  return report;
}
