// DOM menus, HUD, prompts and option screens layered over the game canvas.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { CreditsContent } from '@lieutenant-fizz/engine/credits';
import { pixelScale, scaleSteps } from '@lieutenant-fizz/engine/font/scale';
import { hintText } from '@lieutenant-fizz/engine/font/tokens';
import { EGA } from '@lieutenant-fizz/engine/palette';
import type { Grid } from '@lieutenant-fizz/engine/pen';
import type { StingerContent, StingerPhase } from '@lieutenant-fizz/engine/stinger';
import {
  controlsTable,
  creditsHints,
  menuHints,
  stingerHints,
  type HintContext,
  type HintScreen,
} from './hints';
import {
  applyLayout,
  captionAnimation,
  captionPosition,
  creditsTransform,
  NO_GUTTERS,
  headCandidates,
  titleCandidates,
  watchResize,
  type TouchGutters,
} from './layout';
import {
  CHEVRON_SIZE,
  chevronSvg,
  isTap,
  menuViewport,
  scrollCues,
  scrollToReveal,
} from './menu-scroll';
import { pillItems, type PillIcon } from './hud';
import type { BenFrame, BenPose } from './titleBen';
import './ui.css';

/** How the title is laid out on a phone: one column, or the logo and the menu on opposite sides. */
export type TitleLayout = 'column' | 'split';

/** A save slot shown as a row: thumbnail, two lines of text and the cleared-level pips. */
export interface SlotRow {
  title: string;
  detail: string;
  /** A shorter second line for narrow windows. */
  brief: string;
  /** PNG data URL of the mini overworld; empty for an empty slot. */
  thumb: string;
  empty: boolean;
  cleared: number;
  total: number;
}

export interface MenuItem {
  /** A stable id the game acts on, so labels can change without breaking the menu. */
  id?: string;
  label: string;
  slot?: SlotRow;
  value?: string;
  disabled?: boolean;
  /** `meter` shows `meter` of 8 blocks; `choice` shows `◄ value ►` while selected. */
  kind?: 'meter' | 'choice';
  /** Filled blocks, 0 to 8, for a `meter` row. */
  meter?: number;
}

export interface HudState {
  score: number;
  lives: number;
  ammo: number;
  red: boolean;
  blue: boolean;
  green: boolean;
  usb: boolean;
}

export interface Prompt {
  title: string;
  text: string;
  action: string | null;
}

export interface CreditsView {
  content: CreditsContent;
  reduced: boolean;
  page: number;
  held: boolean;
  fast: boolean;
  /** Pixels travelled from the off-screen start (scrolling form only). */
  offset: number;
}

export interface StingerView {
  content: StingerContent;
  phase: StingerPhase;
  shown: string;
  hidden: string;
  done: boolean;
  /** Whether to show the sound caption pill while the sting lands. */
  caption: boolean;
}

export interface Stats {
  fps: number;
  ms: string;
  tick: number;
  inst: number;
  world: number;
  calls: number;
  lights: number;
  zoom: number;
  tall: number;
  /** The whole pixel scale, or 0 while the view is Soft. */
  scale?: number;
  pad: boolean;
}

export type OptionKey =
  'lighting' | 'normals' | 'poster' | 'culling' | 'stress' | 'captions' | 'night' | 'music' | 'sfx';

export interface UiHandlers {
  menuClick(i: number): void;
  menuHover(i: number): void;
  /** A tap on an Options row's ◄ (-1) or ► (+1) stepper. */
  menuStep(i: number, d: number): void;
  advance(): void;
  skipCine(): void;
  toggle(k: OptionKey): void;
  zoom(f: number | 'reset'): void;
  /** Closes the screen opened over the title or the pause menu (Controls, Options, Saves). */
  back(): void;
  /** A tap on Reset in the touch controls editor. */
  editReset(): void;
  creditsPress(): void;
  creditsSkip(): void;
  stingerPress(): void;
  stingerSkip(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  html = '',
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
};

/** Finds a child the markup is known to contain, failing loudly if the template drifts. */
const need = (root: ParentNode, selector: string): HTMLElement => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`UI template is missing ${selector}`);
  return found;
};

const fmt = (n: number): string => Math.round(n).toLocaleString('en-CA');

/** The DOM overlay. All text is static or comes from the game's own content tables. */
export class Ui {
  readonly stage: HTMLElement;
  readonly gl: HTMLElement;
  readonly fx: HTMLElement;
  /** The layer the on-screen touch controls are built in (hidden until they are shown). */
  readonly touchLayer: HTMLElement;
  private readonly rotate: HTMLElement;
  private readonly sky: HTMLElement;
  private readonly root: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly boss: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly title: HTMLElement;
  private readonly menuEl: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly backMenu: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly overlayMenu: HTMLElement;
  private readonly overlayNote: HTMLElement;
  private readonly letterbox: HTMLElement;
  private readonly dialogue: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly panelBtn: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly touchEdit: HTMLElement;
  private readonly editReset: HTMLButtonElement;
  private readonly credits: HTMLElement;
  private readonly stinger: HTMLElement;
  private creditsFor: CreditsContent | null = null;
  private creditsTrack: HTMLElement | null = null;
  private creditsEnd: HTMLElement | null = null;
  private creditsBlocks: HTMLElement[] = [];
  private creditsOffset = Number.NaN;
  private readonly err: HTMLElement;
  private readonly loading: HTMLElement;
  private toastTimer = 0;
  private bulletUrl = '';
  private hoverRow = -1;
  /** The "more rows" chevron, drawn once as whole-pixel art. */
  private readonly chevronUrl = `data:image/svg+xml,${encodeURIComponent(chevronSvg('#ffffff', '#050507'))}`;
  /** The cues of each menu screen: shown at an edge of its menu when rows are scrolled out of view there. */
  private readonly cues = new Map<HTMLElement, { up: HTMLElement; down: HTMLElement }>();
  private touchMode = false;
  private hudState: HudState | null = null;
  private hudIcons: Partial<Record<PillIcon, string>> = {};
  private benUrls: Partial<Record<BenPose, string>> = {};
  private readonly benEl: HTMLImageElement;
  private readonly heroEl: HTMLElement;
  private readonly attractFade: HTMLElement;
  private readonly attractTag: HTMLElement;
  private unwatch: () => void = () => {};
  private ctx: HintContext = { device: 'keyboard', layout: 0 };
  private titleKind: HintScreen = 'list';
  private overlayKind: HintScreen = 'list';
  private readonly titleKeys: HTMLElement;
  private readonly overlayKeys: HTMLElement;
  private large = false;
  private panelOpen = false;
  private panelVisibleAllowed = true;
  private readonly toggles = new Map<OptionKey, HTMLButtonElement>();
  private gutters: TouchGutters = NO_GUTTERS;
  private titleLayout: TitleLayout = 'column';
  private disposed = false;
  /** What each menu does when a row is chosen, for the taps handled on the menu itself. */
  private readonly choose = new WeakMap<HTMLElement, (i: number) => void>();
  /** A touch tap chose a row until this time, so the click the browser sends after it is ignored. */
  private tapUntil = 0;

  constructor(
    host: HTMLElement,
    private readonly h: UiHandlers,
  ) {
    this.stage = host;
    this.sky = el('div', { id: 'sky', hidden: '' });
    this.gl = el('div', { id: 'gl' });
    this.fx = el('div', { id: 'fx' });
    this.touchLayer = el('div', { id: 'touch', class: 'lf' });
    this.root = el('div', { id: 'ui' });
    host.append(this.sky, this.gl, this.fx, this.touchLayer, this.root);

    this.hud = el('div', { id: 'hud', class: 'lf lf-panel', hidden: '' });
    this.boss = el('div', { id: 'boss', class: 'lf lf-panel', hidden: '' });
    this.prompt = el('div', { id: 'prompt', class: 'lf lf-panel', hidden: '' });
    this.toastEl = el('div', { id: 'toast', class: 'lf lf-panel', hidden: '' });

    this.rotate = el(
      'div',
      { id: 'rotate', class: 'lf screen', hidden: '' },
      '<div><h2>Rotate your phone</h2><p>Lieutenant Fizz plays in landscape.</p></div>',
    );
    this.title = el('div', { id: 'title', class: 'lf screen', hidden: '' });
    this.title.innerHTML = `<div class="head"><h1 class="wordmark"><span class="kicker">Ben Blaze in</span><span class="logo"><span class="hero"><span class="w">Lieutenant</span> <span class="w">Fizz</span></span><img class="ben" alt="" hidden></span></h1>
      <p class="episode">Episode 1 · The Cocoa Caper</p></div>`;
    this.benEl = need(this.title, '.ben') as HTMLImageElement;
    this.heroEl = need(this.title, '.hero');
    this.menuEl = el('div', { class: 'menu' });
    this.controls = el('div', { id: 'controls', hidden: '' });
    this.renderControls();
    this.backMenu = el('div', { class: 'menu' });
    this.renderMenu(this.backMenu, [{ label: 'Back' }], 0, () => h.back());
    this.controls.append(this.backMenu);
    this.bindTaps(this.menuEl);
    this.bindTaps(this.backMenu);
    this.titleKeys = el('div', { class: 'keys' });
    this.title.append(this.menuEl, this.controls, this.titleKeys);
    this.makeCues(this.title, this.menuEl);

    this.overlay = el('div', { id: 'overlay', class: 'lf screen', hidden: '' });
    const box = el('div', { class: 'box' });
    // The text, the menu and the note sit in `.body`, which has no box of its own in the column layout
    // and is the thumb-side column of the split one.
    box.innerHTML = '<h2></h2><div class="body"><p class="text"></p></div>';
    this.overlayMenu = el('div', { class: 'menu' });
    this.bindTaps(this.overlayMenu);
    this.overlayNote = el('p', { class: 'note' });
    need(box, '.body').append(this.overlayMenu, this.overlayNote);
    this.overlayKeys = el('div', { class: 'keys' });
    this.overlay.append(box, this.overlayKeys);
    this.makeCues(this.overlay, this.overlayMenu);
    // A card's text chooses its highlighted row on a tap, as Select does.
    this.onTap(need(box, '.text'), () => {
      if (this.overlayKind === 'list') h.advance();
    });

    this.letterbox = el('div', { id: 'letterbox', class: 'lf', hidden: '' });
    this.letterbox.innerHTML = `<div class="bar"><span class="place"></span><button class="btn ghost skip">Skip</button></div>
      <div class="bar bottom"><div class="text"><span class="shown"></span><span class="hidden-text"></span></div>
      <div class="foot"><span class="pips"></span><button class="btn next">Continue</button></div></div>`;
    this.letterbox.querySelector('.skip')?.addEventListener('click', () => h.skipCine());
    this.letterbox.querySelector('.next')?.addEventListener('click', () => h.advance());
    this.onTap(this.letterbox, () => h.advance());

    this.dialogue = el('div', { id: 'dialogue', class: 'lf lf-panel', hidden: '' });
    this.dialogue.innerHTML = `<div class="who"></div><div class="text"><span class="shown"></span><span class="hidden-text"></span></div>
      <div class="foot"><button class="btn next">Continue</button></div>`;
    this.dialogue.querySelector('.next')?.addEventListener('click', () => h.advance());
    this.onTap(this.dialogue, () => h.advance());

    this.credits = el('div', { id: 'credits', class: 'lf', hidden: '' });
    this.credits.addEventListener('click', () => h.creditsPress());
    this.stinger = el('div', { id: 'stinger', class: 'lf', hidden: '', 'data-phase': 'silence' });
    this.stinger.innerHTML = `<div class="slit"></div><canvas class="figure" aria-label="" role="img"></canvas>
      <div class="name"></div><span class="sound" hidden></span>
      <div class="box"><div class="in"><span class="place"></span>
        <span class="line"><span class="shown"></span><span class="hidden-text"></span></span>
        <div class="hints"><button class="hint skip"></button>
          <span class="hint go"><span class="cursor">▌</span><span class="go-text"></span></span></div></div></div>`;
    this.stinger.addEventListener('click', () => h.stingerPress());
    need(this.stinger, '.skip').addEventListener('click', (e) => {
      e.stopPropagation();
      h.stingerSkip();
    });

    this.panelBtn = el(
      'button',
      {
        id: 'panelBtn',
        class: 'lf',
        hidden: '',
        title: 'Engine panel (`)',
        'aria-label': 'Engine panel',
      },
      'Engine ↙',
    );
    this.panelBtn.addEventListener('click', () => this.togglePanel());
    this.panel = el('div', { id: 'panel', class: 'lf lf-panel', hidden: '' });
    this.buildPanel();

    this.loading = el('div', { id: 'loading', class: 'lf' }, 'Loading Zargoth…');
    this.err = el('div', { id: 'err', class: 'lf', hidden: '' });

    this.backBtn = el('button', { id: 'backBtn', class: 'lf btn ghost', hidden: '' }, '← Back');
    this.backBtn.addEventListener('click', () => h.back());
    // The touch controls editor: a scrim, and a bar with Done, the heading and Reset. The controls
    // themselves are in `#touch`, which sits above this layer so they take the drags.
    this.touchEdit = el(
      'div',
      { id: 'touchEdit', class: 'lf', hidden: '' },
      `<div class="bar"><button type="button" class="btn done">Done</button><h2>Move controls</h2><button type="button" class="btn ghost reset">Reset</button></div>
      <p class="hint">Drag a control to move it</p>`,
    );
    this.editReset = need(this.touchEdit, '.reset') as HTMLButtonElement;
    need(this.touchEdit, '.done').addEventListener('click', () => h.back());
    this.editReset.addEventListener('click', () => h.editReset());
    this.attractFade = el('div', { id: 'attractFade', hidden: '' });
    this.attractTag = el('div', { id: 'attractTag', class: 'lf', hidden: '' });
    this.root.append(
      this.attractFade,
      this.attractTag,
      this.hud,
      this.boss,
      this.prompt,
      this.toastEl,
      this.title,
      this.overlay,
      this.touchEdit,
      this.letterbox,
      this.dialogue,
      this.credits,
      this.stinger,
      this.backBtn,
      this.panelBtn,
      this.panel,
      this.loading,
      this.err,
      this.rotate,
    );
    this.relayout();
    this.refreshHints();
    this.unwatch = watchResize(() => this.relayout());
    // The wordmark is measured in the Fizz font, so measure again once it has loaded.
    void document.fonts?.ready.then(() => {
      if (!this.disposed) this.relayout();
    });
  }

  /** Stops listening to the window and cancels pending timers. */
  dispose(): void {
    this.disposed = true;
    this.unwatch();
    window.clearTimeout(this.toastTimer);
  }

  /** Sets the device and keyboard layout the hints are written for. */
  setHintContext(ctx: HintContext): void {
    if (ctx.device === this.ctx.device && ctx.layout === this.ctx.layout) return;
    this.ctx = ctx;
    this.refreshHints();
    if (this.touchMode) this.relayout();
  }

  private setKeys(into: HTMLElement, hints: string[]): void {
    into.replaceChildren(
      ...hints.map((h) => {
        const span = el('span');
        span.textContent = hintText(h);
        return span;
      }),
    );
  }

  private refreshHints(): void {
    this.setKeys(this.titleKeys, menuHints(this.titleKind, this.ctx));
    this.setKeys(this.overlayKeys, menuHints(this.overlayKind, this.ctx));
    this.renderControls();
  }

  /** The Controls table, with the column for the device in use picked out. */
  private renderControls(): void {
    const t = controlsTable(this.ctx, this.touchMode);
    const cell = (tag: string, col: number, text: string): string =>
      `<${tag}${col === t.on ? ' class="on"' : ''}>${hintText(text)}</${tag}>`;
    const line = (tag: string, cells: string[]): string =>
      `<tr>${cells.map((text, col) => cell(tag, col, text)).join('')}</tr>`;
    const html = `${line('th', t.head)}
      ${t.rows.map((r) => line('td', r)).join('\n      ')}`;
    const table = this.controls.querySelector('table');
    if (table) {
      table.innerHTML = html;
      need(this.controls, '.note').textContent = hintText(t.note);
      return;
    }
    this.controls.innerHTML = `<table>${html}</table>
    <p class="note">${hintText(t.note)}</p>`;
  }

  /** Sizes the overlay's pixel text from the window. Called on resize and when text size changes. */
  private relayout(): void {
    // The visual viewport shrinks and grows with a browser bar, so it is the height the player sees.
    const vv = window.visualViewport;
    applyLayout(
      document.documentElement,
      Math.round(vv?.width ?? window.innerWidth),
      Math.round(vv?.height ?? window.innerHeight),
      this.large,
      this.touchMode ? this.gutters : NO_GUTTERS,
    );
    if (this.touchMode) this.stage.dataset.hand = this.gutters.hand;
    else delete this.stage.dataset.hand;
    this.fitTitle();
    this.fitOverlay();
    this.fitRows();
  }

  /**
   * Chooses how the title is laid out on a phone. `split` puts the logo on the D-pad side above the
   * D-pad and the menu on the Jump side; `column` (the default) is the one-column title. Only a phone
   * (touch mode) shows the split; a desktop window is unchanged.
   */
  setTitleLayout(mode: TitleLayout): void {
    if (mode === this.titleLayout) return;
    this.titleLayout = mode;
    if (mode === 'split') this.stage.dataset.title = 'split';
    else delete this.stage.dataset.title;
    this.relayout();
  }

  /**
   * Sizes the split title's wordmark: the first candidate (largest first, one line then two) whose
   * right edge is at least 24 px from the menu and whose bottom is above the D-pad. When none fits (Large
   * text on a short phone), the title falls back to the column (`data-title-fit="column"`).
   */
  private fitTitle(): void {
    const t = this.title;
    t.style.removeProperty('--lf-n-logo');
    delete t.dataset.lines;
    delete this.stage.dataset.titleFit;
    const split = this.touchMode && this.titleLayout === 'split';
    if (!split || t.hidden || !this.controls.hidden || this.menuEl.hidden) return;
    const vv = window.visualViewport;
    const height = Math.round(vv?.height ?? window.innerHeight);
    const head = need(t, '.head');
    for (const c of titleCandidates(scaleSteps(pixelScale(height, this.large)))) {
      t.style.setProperty('--lf-n-logo', String(c.logo));
      t.dataset.lines = String(c.lines);
      if (this.headFits(head, this.menuEl)) return;
    }
    t.style.removeProperty('--lf-n-logo');
    delete t.dataset.lines;
    this.stage.dataset.titleFit = 'column';
  }

  /**
   * The split screens' fit test: the head is at least 24 px from the menu on the side away from the D-pad
   * and ends above the D-pad (which is where the controls on the head's side begin, 0 when none shows).
   */
  private headFits(head: HTMLElement, menu: HTMLElement): boolean {
    const g = this.gutters;
    const dpadOnLeft = g.hand === 'right';
    const limit = dpadOnLeft ? g.leftTop : g.rightTop;
    const h = head.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const beside = dpadOnLeft ? h.right <= m.left - 24 : h.left >= m.right + 24;
    return beside && (limit === 0 || h.bottom <= limit);
  }

  /**
   * Lays out the other menus (pause, Options, Touch controls, saves, the cards) in the split layout:
   * the heading on the D-pad side, the text and rows on the thumb side. Tries the heading scales
   * largest first (`headCandidates`) with the same test as the title; when none fits (Large text on a
   * short phone, a raised D-pad) the screen falls back to the column (`data-menu-fit="column"`).
   * It also tells the CSS what to keep clear of: the Back button's right edge (a Left-handed menu starts
   * after it), the bottom of the corner control above the heading (Back at the top left, or Pause at
   * the top right for a Left-handed heading), and the height of the hint bar, which wraps to a second line
   * on a narrow screen.
   */
  private fitOverlay(): void {
    const o = this.overlay;
    o.style.removeProperty('--lf-n-head');
    delete this.stage.dataset.menuFit;
    const rect = (e: Element | null): DOMRect | null => {
      const r = e?.getBoundingClientRect();
      return r && r.width > 0 ? r : null;
    };
    const back = this.backBtn.hidden ? null : rect(this.backBtn);
    const pause = rect(this.touchLayer.querySelector('[data-control="pause"] .face'));
    const corner = this.gutters.hand === 'right' ? back : pause;
    const px = (v: number): string => `${Math.ceil(v)}px`;
    o.style.setProperty('--lf-back-right', px(back?.right ?? 0));
    o.style.setProperty('--lf-head-clear', px(corner?.bottom ?? 0));
    o.style.setProperty('--lf-keys-h', px(rect(need(o, '.keys'))?.height ?? 0));
    if (!this.touchMode || this.titleLayout !== 'split' || o.hidden) return;
    const vv = window.visualViewport;
    const height = Math.round(vv?.height ?? window.innerHeight);
    const head = need(o, 'h2');
    const body = need(o, '.body');
    for (const n of headCandidates(scaleSteps(pixelScale(height, this.large)))) {
      o.style.setProperty('--lf-n-head', String(n));
      if (this.headFits(head, body) && head.scrollWidth <= head.clientWidth + 1) return;
    }
    o.style.removeProperty('--lf-n-head');
    this.stage.dataset.menuFit = 'column';
  }

  /** Sets how opaque the on-screen controls are in play, in percent (menus keep them solid). */
  setTouchOpacity(percent: number): void {
    this.touchLayer.style.setProperty('--lf-touch-opacity', String(percent / 100));
  }

  /** Sets the room the touch controls take on each side, so menus start right of the D-pad. */
  setTouchGutters(g: TouchGutters): void {
    const cur = this.gutters;
    if (
      g.left === cur.left &&
      g.right === cur.right &&
      g.leftTop === cur.leftTop &&
      g.rightTop === cur.rightTop &&
      g.hand === cur.hand
    )
      return;
    this.gutters = g;
    this.relayout();
  }

  /**
   * Lets a menu that does not fit its screen scroll inside its own area. Rows keep their height
   * (`--lf-menu-row` on touch, the glyph cell on a desktop window); when the menu runs the screen over,
   * the menu's height is cut by the overflow and it scrolls, while the head, the hint bar, the Back
   * button and the touch controls stay put. A "more rows" cue shows at each edge with rows past it, and
   * the selected row is kept in view. A menu that fits is left alone. Measured after the menu is drawn.
   */
  private fitRows(): void {
    for (const screen of [this.title, this.overlay]) {
      const menus = [...screen.querySelectorAll<HTMLElement>('.menu')];
      for (const m of menus) {
        m.style.removeProperty('max-height');
        delete m.dataset.scroll;
      }
      const shown = menus.find((m) => !m.hidden && m.offsetParent);
      if (screen.hidden || !shown || !shown.firstElementChild) {
        this.updateCues(screen, null);
        continue;
      }
      const keep = shown.scrollTop;
      const natural = shown.offsetHeight;
      const row = shown.firstElementChild.getBoundingClientRect().height;
      // The head and controls decide what is left; two rows is the least worth scrolling through.
      let view = menuViewport(natural, screen.scrollHeight - screen.clientHeight, row * 2);
      if (view !== null) {
        shown.style.maxHeight = `${view}px`;
        shown.dataset.scroll = '';
        // A grid or a wrapped slot can leave some overflow after the first cut; take the rest off too.
        const left = screen.scrollHeight - screen.clientHeight;
        if (left > 0) {
          view = menuViewport(view, left, row * 2);
          if (view !== null) shown.style.maxHeight = `${view}px`;
        }
      }
      this.revealSelected(shown, keep);
      this.updateCues(screen, shown);
    }
  }

  /** Scrolls `menu` (from `from`) just far enough to show its selected row, leaving room for the cue. */
  private revealSelected(menu: HTMLElement, from: number): void {
    if (!('scroll' in menu.dataset)) {
      menu.scrollTop = 0;
      return;
    }
    const row = menu.querySelector<HTMLElement>(`button[data-i="${menu.dataset.sel}"]`);
    menu.scrollTop = from;
    // A row the mouse chose by hovering is under the pointer already; moving it would chase the pointer.
    const hovered = this.hoverRow === Number(menu.dataset.sel);
    this.hoverRow = -1;
    if (!row || hovered) return;
    const top = row.getBoundingClientRect().top - menu.getBoundingClientRect().top + menu.scrollTop;
    const n = Number.parseFloat(getComputedStyle(this.stage).getPropertyValue('--lf-n')) || 2;
    menu.scrollTop = scrollToReveal(
      top,
      row.offsetHeight,
      menu.scrollTop,
      menu.clientHeight,
      menu.scrollHeight,
      Math.ceil(CHEVRON_SIZE.height * n) + 2,
    );
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
    // The cues stand in the bullet gutter at the left of the rows, clear of the text a row cut at the
    // edge still shows.
    const gut = menu.querySelector('.gut')?.getBoundingClientRect();
    for (const cue of [cues.up, cues.down]) {
      cue.style.left = `${m.left - s.left}px`;
      cue.style.width = `${gut?.width ?? m.width}px`;
    }
    cues.up.style.top = `${m.top - s.top}px`;
    cues.down.style.bottom = `${s.bottom - m.bottom}px`;
  }

  /** Makes the cue pair of a screen: one pointing up, one down, inert and hidden until a menu scrolls. */
  private makeCues(screen: HTMLElement, menu: HTMLElement): void {
    const cue = (dir: 'up' | 'down'): HTMLElement => {
      const c = el('div', { class: `more ${dir}`, 'aria-hidden': 'true', hidden: '' });
      c.append(el('img', { alt: '', src: this.chevronUrl }));
      return c;
    };
    const cues = { up: cue('up'), down: cue('down') };
    this.cues.set(screen, cues);
    screen.append(cues.up, cues.down);
    menu.addEventListener('scroll', () => this.updateCues(screen, menu), { passive: true });
  }

  /**
   * Handles a touch tap on a menu: one tap on a row chooses it (the browser's own hover-then-click
   * would take two on some phones), and a tap on a stepper changes the setting. A finger that moves
   * (a scroll) or is cancelled chooses nothing. The mouse keeps its hover and click.
   */
  private bindTaps(menu: HTMLElement): void {
    type Hit = { row: number; step: number };
    let press: (Hit & { id: number; x: number; y: number }) | null = null;
    const hitAt = (e: PointerEvent): Hit | null => {
      const at = document.elementFromPoint(e.clientX, e.clientY);
      const b = at?.closest<HTMLElement>('button[data-i]');
      if (!at || !b || !menu.contains(b) || b.classList.contains('dis')) return null;
      const step = at.closest<HTMLElement>('[data-step]');
      return { row: Number(b.dataset.i), step: step ? Number(step.dataset.step) : 0 };
    };
    menu.addEventListener('pointerdown', (e) => {
      press = null;
      if (e.pointerType === 'mouse') return;
      // Without the implicit capture, the lift is hit-tested where it lands, even if the row was redrawn.
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // Nothing was captured.
      }
      const hit = hitAt(e);
      if (hit) press = { ...hit, id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    menu.addEventListener('pointercancel', () => (press = null));
    menu.addEventListener('pointerup', (e) => {
      const p = press;
      press = null;
      if (!p || e.pointerId !== p.id || !isTap(e.clientX - p.x, e.clientY - p.y)) return;
      const hit = hitAt(e);
      if (!hit || hit.row !== p.row || hit.step !== p.step) return;
      this.tapUntil = performance.now() + 600;
      if (hit.step) this.h.menuStep(hit.row, hit.step);
      else this.choose.get(menu)?.(hit.row);
    });
  }

  /** Runs `fn` on a touch tap on `target` that is not on one of its buttons (they have their own). */
  private onTap(target: HTMLElement, fn: () => void): void {
    let press: { id: number; x: number; y: number } | null = null;
    target.addEventListener('pointerdown', (e) => {
      const onButton = (e.target as Element).closest('button');
      press =
        e.pointerType === 'mouse' || onButton
          ? null
          : { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    target.addEventListener('pointercancel', () => (press = null));
    target.addEventListener('pointerup', (e) => {
      const p = press;
      press = null;
      if (p && e.pointerId === p.id && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 12) fn();
    });
  }

  /** Switches between normal and large text (one step up), for Options › Text size. */
  setTextLarge(large: boolean): void {
    this.large = large;
    this.relayout();
  }

  /** Freezes the menu plate cycle and bullet bob, for reduced motion. */
  setReducedMotion(on: boolean): void {
    this.root.classList.toggle('rm', on);
  }

  /** Sets the Ben sprites used on the title: one image per pose. */
  setBenSprites(grids: Partial<Record<BenPose, Grid>>): void {
    for (const [pose, grid] of Object.entries(grids) as [BenPose, Grid][]) {
      const c = document.createElement('canvas');
      this.paintGrid(c, grid);
      this.benUrls[pose] = c.toDataURL();
    }
  }

  /** The size of the wordmark, so Ben can be placed against it. */
  logoBox(): { w: number; h: number } {
    return { w: this.heroEl.offsetWidth, h: this.heroEl.offsetHeight };
  }

  /** Draws Ben on the title: a pose at a pixel offset from the wordmark, `scale` pixels per sprite pixel. */
  setBen(f: BenFrame | null, scale = 2): void {
    const url = f ? this.benUrls[f.pose] : undefined;
    this.benEl.hidden = !f || !url;
    if (!f || !url) return;
    if (this.benEl.getAttribute('src') !== url) this.benEl.src = url;
    const s = this.benEl.style;
    s.width = `${16 * scale}px`;
    s.left = `${f.x}px`;
    s.bottom = `${f.y}px`;
    s.transform = `scaleX(${f.flip ? -1 : 1}) rotate(${f.rot}deg)`;
  }

  /** Shows the attract label and the black fade between levels, or hides both. */
  setAttract(v: { label: string; fade: number } | null): void {
    this.attractTag.hidden = !v;
    this.attractFade.hidden = !v || v.fade <= 0;
    if (!v) return;
    if (this.attractTag.textContent !== v.label) this.attractTag.textContent = v.label;
    this.attractFade.style.opacity = v.fade.toFixed(3);
  }

  /** Sets the menu bullet sprite: drawn once to a canvas and shown as a pixelated image. */
  setBullet(grid: Grid): void {
    const c = document.createElement('canvas');
    this.paintGrid(c, grid);
    this.bulletUrl = c.toDataURL();
    this.renderMenu(this.backMenu, [{ label: 'Back' }], 0, () => this.h.back());
  }

  private buildPanel(): void {
    const kv = (id: string, label: string): string =>
      `<div class="kv"><span>${label}</span><b id="pk-${id}">-</b></div>`;
    this.panel.innerHTML = `<h3>Engine <button class="btn ghost" id="pk-close" style="padding:2px 10px">Close</button></h3>
      ${kv('fps', 'Frame')}${kv('sim', 'Simulation')}${kv('inst', 'Instances')}${kv('world', 'World instances')}
      ${kv('calls', 'Draw calls')}${kv('lights', 'Lights')}${kv('zoom', 'Zoom')}${kv('pad', 'Gamepad')}
      <div class="tg" id="pk-zoom"></div><div class="tg" id="pk-toggles"></div>`;
    this.panel.querySelector('#pk-close')?.addEventListener('click', () => this.togglePanel());
    const zoom = need(this.panel, '#pk-zoom');
    for (const [label, f] of [
      ['Zoom in', 1.25],
      ['Zoom out', 0.8],
      ['Reset', 'reset' as const],
    ] as const) {
      const b = el('button', {}, label);
      b.addEventListener('click', () => this.h.zoom(f));
      zoom.append(b);
    }
    const tg = need(this.panel, '#pk-toggles');
    const defs: [OptionKey, string][] = [
      ['lighting', 'Lighting'],
      ['normals', 'Normals'],
      ['poster', 'Posterise'],
      ['culling', 'Culling'],
      ['stress', '50k stress'],
      ['captions', 'Captions'],
      ['night', 'Night'],
      ['music', 'Music'],
      ['sfx', 'Sound'],
    ];
    for (const [k, label] of defs) {
      const b = el('button', {}, label);
      b.addEventListener('click', () => this.h.toggle(k));
      this.toggles.set(k, b);
      tg.append(b);
    }
  }

  setToggle(k: OptionKey, on: boolean): void {
    this.toggles.get(k)?.classList.toggle('on', on);
  }

  /** Adds debug overlays (the sound lab) to the overlay layer. */
  mount(...nodes: HTMLElement[]): void {
    this.root.append(...nodes);
  }

  togglePanel(): void {
    this.panelOpen = !this.panelOpen;
    this.syncPanel();
  }

  /** The engine panel button is shown on the title and in play only. */
  allowPanel(allowed: boolean): void {
    this.panelVisibleAllowed = allowed;
    this.syncPanel();
  }

  private syncPanel(): void {
    this.panel.hidden = !(this.panelOpen && this.panelVisibleAllowed);
    this.panelBtn.hidden = this.panelOpen || !this.panelVisibleAllowed;
  }

  setSky(on: boolean): void {
    this.sky.hidden = !on;
  }

  setLoading(on: boolean): void {
    this.loading.hidden = !on;
  }

  showError(msg: string): void {
    this.err.hidden = false;
    this.err.innerHTML = '<div><h2>Ben’s saucer hit a snag</h2><p></p></div>';
    need(this.err, 'p').textContent = msg;
  }

  // ----- HUD, prompt, toast, boss -----

  /** Switches the HUD between the desktop panel and the phone's pills, and marks the stage as touch. */
  setTouchMode(on: boolean): void {
    if (on === this.touchMode) return;
    this.touchMode = on;
    this.stage.toggleAttribute('data-touch', on);
    this.renderControls();
    this.setHud(this.hudState);
    this.relayout();
  }

  /**
   * Shows the Back button, which closes a screen opened over the title or the pause menu (Controls,
   * Options, Saves). Only a phone shows it: a keyboard has Esc, and a gamepad has B.
   */
  setBack(on: boolean): void {
    this.backBtn.hidden = !(on && this.touchMode);
  }

  /**
   * Shows the touch controls editor (null hides it). `armed` is whether Reset has had its first tap.
   * Done is the Back handler, so it closes the editor the way the Back button closes any screen.
   */
  showTouchEditor(v: { armed: boolean } | null): void {
    this.touchEdit.hidden = !v || !this.touchMode;
    if (!v) return;
    const text = v.armed ? 'Tap again' : 'Reset';
    if (this.editReset.textContent !== text) this.editReset.textContent = text;
  }

  /** Shows or hides the "Rotate your phone" screen. */
  setRotate(on: boolean): void {
    this.rotate.hidden = !on;
  }

  /** A sprite grid as a PNG data URL, for an image the page draws at a whole-number size. */
  spriteUrl(grid: Grid): string {
    const c = document.createElement('canvas');
    this.paintGrid(c, grid);
    return c.toDataURL();
  }

  /** Sets the sprites on the phone HUD's pills (lives, snacks, fizz). */
  setHudIcons(grids: Record<PillIcon, Grid>): void {
    for (const [name, grid] of Object.entries(grids) as [PillIcon, Grid][]) {
      const c = document.createElement('canvas');
      this.paintGrid(c, grid);
      this.hudIcons[name] = c.toDataURL();
    }
    this.setHud(this.hudState);
  }

  setHud(s: HudState | null): void {
    this.hudState = s;
    this.hud.hidden = !s;
    this.hud.classList.toggle('pills', this.touchMode);
    if (!s) return;
    if (this.touchMode) return this.renderPills(s);
    this.hud.innerHTML = `<div class="row"><span class="lbl">Score</span><span class="lbl">Lives</span><span class="lbl">Fizz</span>
      <span class="num" style="color:#ffff55">${fmt(s.score)}</span>
      <span class="num" style="color:#55ff55">${Math.max(0, s.lives)}</span>
      <span class="num" style="color:#55ffff">${s.ammo}</span></div>
      <div class="badges"><span class="lbl">Next life at ${(Math.floor(s.score / 100) + 1) * 100}</span>
      ${s.red ? '<span class="badge" style="color:#ff5555">Red gumdrop</span>' : ''}
      ${s.blue ? '<span class="badge" style="color:#8888ff">Blue gumdrop</span>' : ''}
      ${s.green ? '<span class="badge" style="color:#55ff55">Green gumdrop</span>' : ''}
      ${s.usb ? '<span class="badge" style="color:#ffff55">Gold USB</span>' : ''}</div>`;
  }

  /** The phone HUD: an icon and a number per pill, then a chip for each key held. */
  private renderPills(s: HudState): void {
    const { pills, chips } = pillItems(s);
    const pillHtml = pills.map((p) => {
      const url = this.hudIcons[p.icon];
      const img = url ? `<img class="ico" src="${url}" alt="">` : '';
      return `<span class="pill" role="img" aria-label="${p.label}" style="color:${p.colour}">${img}<b>${p.value}</b></span>`;
    });
    const chipHtml = chips.map(
      (c) =>
        `<span class="chip" role="img" aria-label="${c.label}" style="background:${c.colour}"></span>`,
    );
    this.hud.innerHTML = `<div class="pillrow">${pillHtml.join('')}${chipHtml.join('')}</div>`;
  }

  setBoss(hp: number | null): void {
    this.boss.hidden = hp === null;
    if (hp === null) return;
    this.boss.innerHTML = `<span>Cocoa Colossus</span><span class="pips">${'●'.repeat(Math.max(0, hp))}${'○'.repeat(Math.max(0, 3 - hp))}</span>`;
  }

  setPrompt(p: Prompt | null): void {
    this.prompt.hidden = !p;
    if (!p) return;
    this.prompt.innerHTML = '<div class="t"></div><div class="d"></div><div class="a"></div>';
    need(this.prompt, '.t').textContent = p.title;
    need(this.prompt, '.d').textContent = p.text;
    need(this.prompt, '.a').textContent = p.action
      ? this.touchMode
        ? `Tap Jump or Fizz to ${p.action.toLowerCase()}`
        : `Jump, fire or Enter to ${p.action.toLowerCase()}`
      : '';
  }

  toast(text: string): void {
    window.clearTimeout(this.toastTimer);
    this.toastEl.hidden = false;
    this.toastEl.textContent = text;
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), 2800);
  }

  // ----- Menus -----

  private renderMenu(
    into: HTMLElement,
    items: MenuItem[],
    sel: number,
    onClick: (i: number) => void = (i) => this.h.menuClick(i),
  ): void {
    // Redrawing keeps the list where it was scrolled; `fitRows` brings the selected row into view.
    const scrolled = into.scrollTop;
    into.replaceChildren();
    into.dataset.sel = String(sel);
    this.choose.set(into, onClick);
    const click = (i: number) => (): void => {
      // A touch tap already chose the row on its lift; this is the browser's click that follows it.
      if (performance.now() < this.tapUntil) return;
      onClick(i);
    };
    const hover =
      (i: number) =>
      (e: PointerEvent): void => {
        if (e.pointerType !== 'mouse') return;
        this.hoverRow = i;
        this.h.menuHover(i);
      };
    items.forEach((it, i) => {
      const selected = i === sel && !it.disabled;
      const b = el('button', {
        class: `${selected ? 'sel' : ''} ${it.disabled ? 'dis' : ''}`.trim(),
        'data-i': String(i),
      });
      const gut = el('span', { class: 'gut' });
      if (this.bulletUrl) gut.append(el('img', { class: 'bullet', alt: '', src: this.bulletUrl }));
      const plate = el('span', { class: 'plate' });
      if (it.slot) {
        b.classList.add('slot');
        this.fillSlot(plate, it.slot);
        b.append(gut, plate);
        b.addEventListener('click', click(i));
        b.addEventListener('pointerenter', hover(i));
        into.append(b);
        return;
      }
      const l = el('span', { class: 'lbl' });
      l.textContent = it.label;
      plate.append(l);
      // On touch an Options row has its own ◄ and ► steppers, so a tap can go either way.
      const steppers = this.touchMode && !!it.kind;
      const stepper = (d: number): HTMLElement => {
        // A row the address fixes keeps the room of its steppers but offers none.
        if (it.disabled) {
          const gap = el('span', { class: 'step off', 'aria-hidden': 'true' });
          gap.textContent = d < 0 ? '◄' : '►';
          return gap;
        }
        const st = el('span', {
          class: 'step',
          'data-step': String(d),
          role: 'button',
          'aria-label': `${d < 0 ? 'Less' : 'More'} ${it.label}`,
        });
        st.textContent = d < 0 ? '◄' : '►';
        return st;
      };
      if (steppers) plate.append(stepper(-1));
      if (it.kind === 'meter') {
        const m = el('span', { class: 'meter' });
        for (let k = 0; k < 8; k++) m.append(el('i', { class: k < (it.meter ?? 0) ? 'on' : '' }));
        plate.append(m);
      } else if (it.value) {
        const v = el('span', { class: 'val' });
        v.textContent =
          it.kind === 'choice' && selected && !steppers ? `◄ ${it.value} ►` : it.value;
        plate.append(v);
      }
      if (steppers) plate.append(stepper(1));
      b.append(gut, plate);
      b.addEventListener('click', click(i));
      b.addEventListener('pointerenter', hover(i));
      into.append(b);
    });
    into.scrollTop = scrolled;
  }

  /** A save slot's content: thumbnail, two text lines and one pip per level. */
  private fillSlot(into: HTMLElement, s: SlotRow): void {
    const thumb = s.empty
      ? el('span', { class: 'thumb none' })
      : el('img', { class: 'thumb', alt: '', src: s.thumb });
    const text = el('span', { class: 'txt' });
    const l1 = el('span', { class: 'l1' });
    l1.textContent = s.title;
    const l2 = el('span', { class: 'l2 full' });
    l2.textContent = s.detail;
    const brief = el('span', { class: 'l2 brief' });
    brief.textContent = s.brief;
    text.append(l1, l2, brief);
    const pips = el('span', { class: 'pips-row' });
    for (let k = 0; k < s.total; k++) pips.append(el('i', { class: k < s.cleared ? 'on' : '' }));
    if (s.empty) pips.hidden = true;
    into.append(thumb, text, pips);
  }

  showTitle(items: MenuItem[] | null, sel: number, controls: boolean): void {
    this.titleKind = controls ? 'controls' : 'list';
    this.title.hidden = items === null && !controls;
    this.setKeys(this.titleKeys, menuHints(this.titleKind, this.ctx));
    if (items) this.renderMenu(this.menuEl, items, sel);
    this.menuEl.hidden = controls || items === null;
    this.controls.hidden = !controls;
    if (!this.title.hidden) {
      if (this.touchMode) this.fitTitle();
      this.fitRows();
    }
  }

  showOverlay(
    o: {
      title: string;
      text: string;
      note?: string;
      items: MenuItem[];
      sel: number;
      /** Which hints to show along the bottom. */
      screen: HintScreen;
      /** Use the side-fading scrim of the title screens instead of the flat pause scrim. */
      side?: boolean;
    } | null,
  ): void {
    this.overlay.hidden = !o;
    if (!o) return;
    this.overlayKind = o.screen;
    this.overlay.toggleAttribute('data-side', !!o.side);
    this.setKeys(this.overlayKeys, menuHints(o.screen, this.ctx));
    need(this.overlay, 'h2').textContent = o.title;
    const p = need(this.overlay, '.text');
    p.textContent = o.text;
    p.hidden = !o.text;
    this.overlayNote.textContent = o.note ?? '';
    this.overlayNote.hidden = !o.note;
    this.renderMenu(this.overlayMenu, o.items, o.sel);
    if (this.touchMode) this.fitOverlay();
    this.fitRows();
  }

  showLetterbox(
    o: {
      place: string;
      shown: string;
      hidden: string;
      pips: string;
      done: boolean;
      last: boolean;
      skip: boolean;
    } | null,
  ): void {
    this.letterbox.hidden = !o;
    if (!o) return;
    const q = (s: string): HTMLElement => need(this.letterbox, s);
    q('.place').textContent = o.place;
    q('.shown').textContent = o.shown;
    q('.hidden-text').textContent = o.hidden;
    q('.pips').textContent = o.pips;
    q('.next').textContent = !o.done ? 'Hurry' : o.last && o.skip ? 'Step out' : 'Continue';
    q('.skip').hidden = !o.skip;
  }

  showDialogue(o: { who: string; shown: string; hidden: string; done: boolean } | null): void {
    this.dialogue.hidden = !o;
    if (!o) return;
    const q = (s: string): HTMLElement => need(this.dialogue, s);
    q('.who').textContent = o.who;
    q('.shown').textContent = o.shown;
    q('.hidden-text').textContent = o.hidden;
    q('.next').textContent = o.done ? 'Continue' : 'Hurry';
  }

  // ----- Credits and stinger -----

  private buildCredits(c: CreditsContent): void {
    const blocks: HTMLElement[] = [];
    const title = el('div', { class: 'blk card' });
    title.innerHTML = '<span class="big"></span><span class="sub"></span>';
    need(title, '.big').textContent = c.title;
    need(title, '.sub').textContent = c.subtitle;
    blocks.push(title);
    for (const sec of c.sections) {
      const b = el('div', { class: 'blk section' });
      const head = el('span', { class: 'head' });
      head.textContent = sec.head;
      const lines = el('div', { class: 'lines' });
      for (const ln of sec.lines) {
        const row = el(
          'div',
          { class: 'ln' },
          '<span class="role"></span><span class="who"></span>',
        );
        need(row, '.role').textContent = ln.role;
        need(row, '.who').textContent = ln.name;
        lines.append(row);
      }
      b.append(head, lines);
      blocks.push(b);
    }
    const end = el('div', { class: 'blk end' });
    end.innerHTML =
      '<span class="thanks"></span><span class="line"></span><div class="echo"><span class="big"></span><span class="sub"></span><span class="ret"></span></div>';
    need(end, '.echo .big').textContent = c.title;
    need(end, '.echo .sub').textContent = c.subtitle;
    need(end, '.thanks').textContent = c.thanks;
    need(end, '.line').textContent = c.thanksLine;
    need(end, '.ret').textContent = c.returnLine;
    blocks.push(end);
    const track = el('div', { class: 'track' });
    track.append(...blocks);
    this.credits.replaceChildren();
    this.credits.innerHTML = '<div class="glow"></div><div class="stars"></div>';
    const stars = need(this.credits, '.stars');
    for (let i = 0; i < 30; i++) {
      const d = el('i');
      d.style.left = `${((i * 37 + 11) % 97) + 1}%`;
      d.style.top = `${((i * 53 + 7) % 93) + 2}%`;
      d.style.width = d.style.height = `${i % 5 === 0 ? 3 : 2}px`;
      d.style.opacity = String(0.25 + (i % 4) * 0.15);
      stars.append(d);
    }
    const foot = el('div', { class: 'foot' });
    foot.innerHTML = '<button class="hint skip"></button><span class="hint go"></span>';
    need(foot, '.skip').addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.creditsSkip();
    });
    this.credits.append(
      track,
      el('div', { class: 'fade top' }),
      el('div', { class: 'fade bot' }),
      foot,
    );
    this.creditsFor = c;
    this.creditsTrack = track;
    this.creditsEnd = end;
    this.creditsBlocks = blocks;
    this.creditsOffset = Number.NaN;
  }

  /** Shows, updates or hides the credits. Returns nothing; read `creditsMetrics` to lay out the roll. */
  showCredits(v: CreditsView | null): void {
    this.credits.hidden = !v;
    if (!v) {
      this.creditsFor = null;
      return;
    }
    if (this.creditsFor !== v.content) this.buildCredits(v.content);
    const root = this.credits;
    root.classList.toggle('reduced', v.reduced);
    root.classList.toggle('held', v.held);
    this.creditsBlocks.forEach((b, i) => b.classList.toggle('on', !v.reduced || i === v.page));
    const act = !v.reduced
      ? v.held
        ? 'Continue'
        : v.fast
          ? 'Normal speed'
          : 'Speed up'
      : v.held
        ? 'Continue'
        : 'Next';
    const [skip, go] = creditsHints(this.ctx, act) as [string, string];
    need(root, '.skip').textContent = hintText(skip);
    need(root, '.go').textContent = hintText(go);
    if (!v.reduced && this.creditsTrack && v.offset !== this.creditsOffset) {
      this.creditsOffset = v.offset;
      this.creditsTrack.style.transform = creditsTransform(root.clientHeight, v.offset);
    }
    if (v.reduced && this.creditsTrack) {
      this.creditsTrack.style.transform = 'none';
      this.creditsOffset = Number.NaN;
    }
  }

  /** Visible height and the distance the roll travels to centre the closing card, in pixels. */
  creditsMetrics(): { viewport: number; total: number } | null {
    const end = this.creditsEnd;
    if (!end || this.credits.hidden) return null;
    const viewport = this.credits.clientHeight;
    const target = viewport / 2 - (end.offsetTop + end.offsetHeight / 2);
    return { viewport, total: viewport - target };
  }

  private stingerFor: StingerContent | null = null;

  /** Shows, updates or hides the stinger scene. `grid` is the figure sprite, drawn once per scene. */
  showStinger(v: StingerView | null, grid?: Grid): void {
    this.stinger.hidden = !v;
    if (!v) {
      this.stingerFor = null;
      return;
    }
    const root = this.stinger;
    if (this.stingerFor !== v.content) {
      this.stingerFor = v.content;
      need(root, '.name').textContent = v.content.name;
      need(root, '.place').textContent = v.content.place;
      need(root, '.sound').textContent = v.content.caption;
      const canvas = need(root, '.figure') as HTMLCanvasElement;
      canvas.setAttribute('aria-label', v.content.name);
      if (grid) this.paintGrid(canvas, grid);
    }
    root.dataset.phase = v.phase;
    root.classList.toggle('typed', v.done);
    need(root, '.sound').hidden = !(v.caption && v.phase === 'slit');
    need(root, '.shown').textContent = v.shown;
    need(root, '.hidden-text').textContent = v.hidden;
    const [skip, go] = stingerHints(this.ctx) as [string, string];
    need(root, '.skip').textContent = hintText(skip);
    need(root, '.go-text').textContent = hintText(go);
  }

  private paintGrid(canvas: HTMLCanvasElement, grid: Grid): void {
    canvas.width = grid.w;
    canvas.height = grid.h;
    const g = canvas.getContext('2d');
    if (!g) return;
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const c = grid.at(x, y);
        if (!c) continue;
        g.fillStyle = EGA[c];
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  // ----- Captions and stats -----

  /** A floating sound caption at a screen position (CSS pixels). */
  caption(x: number, y: number, text: string, colour: string): void {
    const d = el('div', { class: 'cap' });
    d.textContent = text;
    d.style.color = colour;
    this.fx.append(d);
    const at = captionPosition(x, y, d.offsetWidth, d.offsetHeight);
    d.style.left = `${at.left}px`;
    d.style.top = `${at.top}px`;
    const { keyframes, options } = captionAnimation();
    const a = d.animate(keyframes, options);
    a.onfinish = () => d.remove();
  }

  setStats(s: Stats): void {
    if (this.panel.hidden) return;
    const set = (id: string, v: string): void => {
      const e = this.panel.querySelector(`#pk-${id}`);
      if (e) e.textContent = v;
    };
    set('fps', `${s.fps} fps · ${s.ms} ms`);
    set('sim', `60 Hz · tick ${fmt(s.tick)}`);
    set('inst', `${fmt(s.inst)} / 120,000`);
    set('world', fmt(s.world));
    set('calls', String(s.calls));
    set('lights', `${s.lights} / 16 point`);
    set(
      'zoom',
      `${s.zoom.toFixed(2)}× · ${s.tall.toFixed(1)} tiles${s.scale ? ` · ${s.scale}× pixels` : ''}`,
    );
    set('pad', s.pad ? 'Connected' : 'None');
  }
}
