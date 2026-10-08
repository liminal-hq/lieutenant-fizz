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
  rowHeight,
  titleCandidates,
  TOUCH_ROW,
  watchResize,
  type TouchGutters,
} from './layout';
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
  backFromControls(): void;
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
    this.renderMenu(this.backMenu, [{ label: 'Back' }], 0, () => h.backFromControls());
    this.controls.append(this.backMenu);
    this.bindTaps(this.menuEl);
    this.bindTaps(this.backMenu);
    this.titleKeys = el('div', { class: 'keys' });
    this.title.append(this.menuEl, this.controls, this.titleKeys);

    this.overlay = el('div', { id: 'overlay', class: 'lf screen', hidden: '' });
    const box = el('div', { class: 'box' });
    box.innerHTML = '<h2></h2><p class="text"></p>';
    this.overlayMenu = el('div', { class: 'menu' });
    this.bindTaps(this.overlayMenu);
    this.overlayNote = el('p', { class: 'note' });
    box.append(this.overlayMenu, this.overlayNote);
    this.overlayKeys = el('div', { class: 'keys' });
    this.overlay.append(box, this.overlayKeys);
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
      this.letterbox,
      this.dialogue,
      this.credits,
      this.stinger,
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
    const t = controlsTable(this.ctx);
    const cell = (tag: string, col: number, text: string): string =>
      `<${tag}${col === t.on ? ' class="on"' : ''}>${hintText(text)}</${tag}>`;
    const line = (tag: string, cells: string[]): string =>
      `<tr>${cells.map((text, col) => cell(tag, col, text)).join('')}</tr>`;
    const html = `${line('th', t.head)}
      ${t.rows.map((r) => line('td', r)).join('\n      ')}`;
    const table = this.controls.querySelector('table');
    if (table) {
      table.innerHTML = html;
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
    const g = this.gutters;
    const dpadOnLeft = g.hand === 'right';
    const limit = dpadOnLeft ? g.leftTop : g.rightTop;
    for (const c of titleCandidates(scaleSteps(pixelScale(height, this.large)))) {
      t.style.setProperty('--lf-n-logo', String(c.logo));
      t.dataset.lines = String(c.lines);
      const h = head.getBoundingClientRect();
      const m = this.menuEl.getBoundingClientRect();
      const beside = dpadOnLeft ? h.right <= m.left - 24 : h.left >= m.right + 24;
      if (beside && (limit === 0 || h.bottom <= limit)) return;
    }
    t.style.removeProperty('--lf-n-logo');
    delete t.dataset.lines;
    this.stage.dataset.titleFit = 'column';
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
   * On touch, makes each menu row 48 px tall where the screen has room, and as tall as fits where it
   * does not, so a short phone never scrolls the menu. Measured after the menu is drawn.
   */
  private fitRows(): void {
    for (const screen of [this.title, this.overlay]) {
      const menus = [...screen.querySelectorAll<HTMLElement>('.menu')];
      if (!this.touchMode || screen.hidden) {
        for (const m of menus) m.style.removeProperty('--lf-row-h');
        continue;
      }
      const shown = menus.find((m) => !m.hidden && m.offsetParent);
      const rows = shown?.querySelectorAll('button');
      const first = rows?.[0];
      if (!rows || !first) continue;
      for (const m of menus) m.style.setProperty('--lf-row-h', `${TOUCH_ROW}px`);
      const overflow = screen.scrollHeight - screen.clientHeight;
      const glyph = Math.round(Number.parseFloat(getComputedStyle(first).fontSize));
      const h = rowHeight(overflow, rows.length, glyph);
      for (const m of menus) m.style.setProperty('--lf-row-h', `${h}px`);
    }
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
      if (!p || e.pointerId !== p.id || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) return;
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
    this.renderMenu(this.backMenu, [{ label: 'Back' }], 0, () => this.h.backFromControls());
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
    this.setHud(this.hudState);
    this.relayout();
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
    into.replaceChildren();
    this.choose.set(into, onClick);
    const click = (i: number) => (): void => {
      // A touch tap already chose the row on its lift; this is the browser's click that follows it.
      if (performance.now() < this.tapUntil) return;
      onClick(i);
    };
    const hover =
      (i: number) =>
      (e: PointerEvent): void => {
        if (e.pointerType === 'mouse') this.h.menuHover(i);
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
    if (this.touchMode && !this.title.hidden) {
      this.fitTitle();
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
    if (this.touchMode) this.fitRows();
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
