// Draws a menu's rows: a button for each, with a gutter for the bullet and a plate for the label.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** What every row has; an episode's rows may carry more and fill the plate themselves. */
export interface RowItem {
  label: string;
  /** A value shown beside the label. */
  value?: string;
  disabled?: boolean;
  /** `meter` shows `meter` of {@link METER_BLOCKS} blocks; `choice` shows `◄ value ►` while the row is selected. */
  kind?: 'meter' | 'choice';
  /** Lit blocks, 0 to 8, for a `meter` row. */
  meter?: number;
}

/** The bullet as an image: the data URL, and how many frames it holds side by side. */
export interface BulletImage {
  url: string;
  frames: number;
  /** How long the whole run of frames takes, in milliseconds. */
  cycleMs: number;
}

export interface RowState {
  i: number;
  selected: boolean;
  button: HTMLElement;
}

export interface RowsOptions<T extends RowItem> {
  bullet?: BulletImage | undefined;
  /** A row was chosen (a click; the caller keeps any tap bookkeeping of its own). */
  onClick(i: number): void;
  /** The pointer came over a row. */
  onHover?(i: number, e: PointerEvent): void;
  /** Called with each button before it is added, to set classes or attributes of its own. */
  decorate?(button: HTMLElement, item: T, state: RowState): void;
  /** Fills a row's plate. Without it the plate gets the label and the value. */
  fill?(plate: HTMLElement, item: T, state: RowState): void;
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/** The blocks on a volume meter. */
export const METER_BLOCKS = 8;

/** The label, then the meter or the value after it: a choice shows `◄ value ►` while its row is selected. */
export function fillPlate(plate: HTMLElement, item: RowItem, selected = false): void {
  const label = make('span', { class: 'lbl' });
  label.textContent = item.label;
  plate.append(label);
  if (item.kind === 'meter') {
    const meter = make('span', { class: 'meter' });
    for (let k = 0; k < METER_BLOCKS; k++) {
      meter.append(make('i', k < (item.meter ?? 0) ? { class: 'on' } : {}));
    }
    plate.append(meter);
  } else if (item.value) {
    const value = make('span', { class: 'val' });
    value.textContent = item.kind === 'choice' && selected ? `◄ ${item.value} ►` : item.value;
    plate.append(value);
  }
}

/** The bullet element for the gutter: an image for one frame, a strip that steps through its frames for more. */
function bulletElement(b: BulletImage): HTMLElement {
  if (b.frames <= 1) return make('img', { class: 'bullet', alt: '', src: b.url });
  const strip = make('span', { class: 'bullet strip', 'aria-hidden': 'true' });
  strip.style.backgroundImage = `url("${b.url}")`;
  strip.style.setProperty('--lf-bullet-frames', String(b.frames));
  strip.style.setProperty('--lf-bullet-ms', `${b.cycleMs}ms`);
  return strip;
}

/**
 * Redraws a menu's rows into `into`. The list keeps where it was scrolled, and `data-sel` says which row is
 * selected. A disabled row is never drawn as selected.
 */
export function renderRows<T extends RowItem>(
  into: HTMLElement,
  items: readonly T[],
  sel: number,
  options: RowsOptions<T>,
): void {
  const scrolled = into.scrollTop;
  into.replaceChildren();
  into.dataset['sel'] = String(sel);
  items.forEach((item, i) => {
    const selected = i === sel && !item.disabled;
    const button = make('button', {
      class: `${selected ? 'sel' : ''} ${item.disabled ? 'dis' : ''}`.trim(),
      'data-i': String(i),
    });
    const gutter = make('span', { class: 'gut' });
    if (options.bullet) gutter.append(bulletElement(options.bullet));
    const plate = make('span', { class: 'plate' });
    const state: RowState = { i, selected, button };
    options.decorate?.(button, item, state);
    if (options.fill) options.fill(plate, item, state);
    else fillPlate(plate, item, selected);
    button.append(gutter, plate);
    button.addEventListener('click', () => options.onClick(i));
    if (options.onHover) {
      const hover = options.onHover;
      button.addEventListener('pointerenter', (e) => hover(i, e));
    }
    into.append(button);
  });
  into.scrollTop = scrolled;
}
