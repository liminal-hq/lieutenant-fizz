// Game shell that wires the sim, renderer, input, audio, UI and screen flow together.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  buildAtlas,
  FixedStepper,
  GameAudio,
  InputManager,
  InstanceWriter,
  InstancedRenderer,
  Input as Bits,
  type Atlas,
  type Command,
} from '@lieutenant-fizz/engine';
import simUrl from './wasm/sim.wasm?url';
import { PATTERNS } from './audio/patterns';
import { Cinematic, CINE_TALL } from './cine';
import { applyProgress, captureProgress, readProgress, safeStorage, writeProgress } from './save';
import { Ev, Mode, Out, RenderFlag, State, STEP, Table } from './sim/protocol';
import { Sim } from './sim/sim';
import { defineSprites } from './sprites';
import { CINE, CINE_TRACK, CLEARED_TEXT, DIALOGUE, END, LEVELS, type Line } from './story';
import { Ui, type HudState, type MenuItem, type OptionKey, type Prompt } from './ui';

export type Screen =
  'loading' | 'title' | 'cine' | 'play' | 'pause' | 'card' | 'dialogue' | 'ending';

interface Card {
  title: string;
  text: string;
  primaryLabel: string;
  primary: () => void;
  secondaryLabel?: string;
  secondary?: () => void;
}

const PAUSE_NOTE =
  'Saves stay on this device. The map also saves automatically each time you return to it.';

const TALL = { level: 13, map: 12, cine: CINE_TALL };

/** The Episode 1 game shell: boots the engine, runs the loop and drives the screen flow. */
export class Game {
  screen: Screen = 'loading';
  private readonly sim: Sim;
  private readonly atlas: Atlas;
  private readonly renderer: InstancedRenderer;
  private readonly input: InputManager;
  private readonly audio: GameAudio;
  private readonly ui: Ui;
  private readonly cine = new Cinematic();
  private readonly writer: InstanceWriter;
  private readonly stepper = new FixedStepper(STEP);
  private readonly store = safeStorage();
  private captionNames: string[] = [];
  private toastNames: string[] = [];
  private readonly capSeen = new Map<number, number>();

  private raf = 0;
  private last = 0;
  private disposed = false;
  private zoom = 1;
  private alpha = 1;
  private halfW = 10;
  private halfH = 6.5;
  private statT = 0;
  private fpsE = 60;
  private lastBits = 0;
  private cineIdx = 0;
  private endIdx = 0;
  private dlg: Line[] | null = null;
  private dlgId: 'bossIntro' | 'bossDefeated' | null = null;
  private dlgI = 0;
  private typed = 0;
  private card: Card | null = null;
  private menuIdx = 0;
  private sub: 'controls' | null = null;
  private bossHp: number | null = null;
  private prompt: Prompt | null = null;
  private hasSave = false;
  private visible = true;
  private levelSeconds = 0;
  private completeTimer = 0;
  private readonly opts = {
    lighting: true,
    normals: true,
    poster: false,
    culling: true,
    stress: false,
    captions: true,
    night: false,
  };

  private constructor(sim: Sim, atlas: Atlas, ui: Ui, renderer: InstancedRenderer) {
    this.sim = sim;
    this.atlas = atlas;
    this.ui = ui;
    this.renderer = renderer;
    this.input = new InputManager(ui.stage);
    this.audio = new GameAudio(PATTERNS);
    this.writer = new InstanceWriter(sim.instanceBuffer, atlas.rects);
    this.captionNames = sim.names(Table.CAPTIONS);
    this.toastNames = sim.names(Table.TOASTS);
    this.input.onCommand((c) => this.onCommand(c));
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onVisibility);
  }

  /** Builds the atlas, loads the WASM sim and starts the loop on the title screen. */
  static async start(host: HTMLElement): Promise<Game> {
    let game: Game | null = null;
    const ui = new Ui(host, {
      menuClick: (i) => game?.activate(i),
      menuHover: (i) => game?.hover(i),
      advance: () => game?.primary(),
      skipCine: () => game?.skipCine(),
      toggle: (k) => game?.toggle(k),
      zoom: (f) => game?.setZoom(f),
      backFromControls: () => game?.backFromControls(),
    });
    try {
      const [sim] = await Promise.all([Sim.load(simUrl)]);
      const atlas = buildAtlas(defineSprites());
      sim.setSprites(atlas.rects);
      const renderer = new InstancedRenderer(ui.gl, atlas);
      game = new Game(sim, atlas, ui, renderer);
    } catch (e) {
      console.error(e);
      ui.setLoading(false);
      ui.showError(e instanceof Error ? e.message : String(e));
      throw e;
    }
    game.boot();
    return game;
  }

  private boot(): void {
    this.sim.x.load_attract();
    this.hasSave = readProgress(this.store) !== null;
    this.screen = 'title';
    this.ui.setLoading(false);
    for (const k of Object.keys(this.opts) as (keyof Game['opts'])[])
      this.ui.setToggle(k, this.opts[k]);
    this.ui.setToggle('music', true);
    this.ui.setToggle('sfx', true);
    this.syncUi();
    this.last = performance.now();
    const loop = (t: number): void => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onVisibility);
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }

  // ---------- Frame ----------

  private frame(t: number): void {
    const dt = Math.max(0, (t - this.last) / 1000);
    this.last = t;
    const sim = this.sim;
    const screen = this.screen;

    const mode = sim.x.mode();
    const tall = screen === 'cine' ? TALL.cine : mode === Mode.MAP ? TALL.map : TALL.level;
    this.halfH = tall / 2 / this.zoom;
    this.halfW = (this.halfH * this.renderer.width) / this.renderer.height;
    sim.x.set_view(this.halfW, this.halfH);

    const bits = this.input.peek();
    this.menuInput(bits);
    this.lastBits = bits;

    if (screen === 'play' || screen === 'title') {
      this.alpha = this.stepper.advance(dt, () => {
        sim.step(screen === 'play' ? this.input.poll() : 0);
      });
      if (screen === 'play') this.levelSeconds += dt;
      this.handleEvents();
    } else if (screen === 'cine') {
      this.alpha = this.stepper.advance(dt, () => this.cine.tick(STEP));
    } else {
      this.stepper.reset();
      this.alpha = 1;
      sim.drainEvents().forEach((e) => this.onEvent(e));
    }
    this.tickTypewriter(dt);
    this.draw();

    if (dt > 0) this.fpsE += (1 / dt - this.fpsE) * 0.05;
    this.statT += dt;
    if (this.statT > 0.25) {
      this.statT = 0;
      this.ui.setStats({
        fps: Math.round(this.fpsE),
        ms: (1000 / this.fpsE).toFixed(1),
        tick: sim.get(State.TICK),
        inst: this.lastCount,
        world: sim.out[Out.WORLD] ?? 0,
        calls: this.lastCalls,
        lights: sim.out[Out.LIGHTS] ?? 0,
        zoom: this.zoom,
        tall: this.halfH * 2,
        pad: this.input.padConnected,
      });
    }
  }

  private lastCount = 0;
  private lastCalls = 0;

  private draw(): void {
    const sim = this.sim;
    let flags = 0;
    if (this.opts.night) flags |= RenderFlag.NIGHT;
    if (this.opts.culling) flags |= RenderFlag.CULLING;
    if (this.opts.stress) flags |= RenderFlag.STRESS;
    sim.render(this.alpha, flags);
    const o = sim.out;
    let count = o[Out.COUNT] ?? 0;
    let camX = o[Out.CAM_X] ?? 0;
    let camY = o[Out.CAM_Y] ?? 0;
    let clear: [number, number, number, number] = [
      o[Out.CLEAR_R] ?? 0,
      o[Out.CLEAR_G] ?? 0,
      o[Out.CLEAR_B] ?? 0,
      o[Out.CLEAR_A] ?? 1,
    ];
    let ambient: [number, number, number] = [
      o[Out.AMB_R] ?? 1,
      o[Out.AMB_G] ?? 1,
      o[Out.AMB_B] ?? 1,
    ];
    let lighting = (o[Out.LIGHTING] ?? 0) > 0.5 && this.opts.lighting;
    let lightCount = o[Out.LIGHTS] ?? 0;
    let sky = (o[Out.SKY_GLOW] ?? 0) > 0.5;
    const buf = sim.instanceBuffer;
    if (this.screen === 'cine') {
      this.writer.rebind(buf);
      this.writer.reset();
      this.cine.draw(this.writer);
      count = this.writer.n;
      camX = 0;
      camY = 0;
      clear = [0, 0, 0, 1];
      ambient = [1, 1, 1];
      lighting = false;
      lightCount = 0;
      sky = false;
    }
    this.ui.setSky(sky);
    const info = this.renderer.render({
      instances: buf,
      count,
      camX,
      camY,
      halfW: this.halfW,
      halfH: this.halfH,
      clear,
      ambient,
      lighting,
      normals: this.opts.normals,
      poster: this.opts.poster,
      lightCount,
      lightPos: sim.lightPos,
      lightCol: sim.lightCol,
    });
    this.lastCount = info.instances;
    this.lastCalls = info.calls;
  }

  // ---------- Events from the sim ----------

  private handleEvents(): void {
    for (const e of this.sim.drainEvents()) this.onEvent(e);
  }

  private onEvent(e: { kind: number; a: number; b: number; c: number }): void {
    const sim = this.sim;
    switch (e.kind) {
      case Ev.CAPTION:
        this.caption(e.a, e.b, e.c);
        break;
      case Ev.HUD:
        this.refreshHud();
        break;
      case Ev.TOAST:
        this.ui.toast(this.toastNames[e.a] ?? '');
        break;
      case Ev.LEVEL_START:
        this.screen = 'play';
        this.prompt = null;
        this.bossHp = null;
        this.levelSeconds = 0;
        this.ui.toast(LEVELS[e.a]?.name ?? '');
        this.syncUi();
        break;
      case Ev.LEVEL_COMPLETE: {
        const id = e.a;
        window.clearTimeout(this.completeTimer);
        this.completeTimer = window.setTimeout(() => {
          if (this.disposed || this.screen !== 'play') return;
          this.showCard({
            title: `${LEVELS[id]?.name ?? 'Level'} cleared`,
            text: CLEARED_TEXT[id] ?? '',
            primaryLabel: 'Back to the map',
            primary: () => this.enterMap(),
          });
        }, 700);
        break;
      }
      case Ev.DIED: {
        const lives = e.a;
        this.showCard({
          title: 'Ben took a tumble',
          text: `${LEVELS[e.b]?.name ?? 'The level'} sends you back to the map. ${lives} ${lives === 1 ? 'life' : 'lives'} left — every 100 snack points earns another.`,
          primaryLabel: 'Back to the map',
          primary: () => this.enterMap(),
        });
        break;
      }
      case Ev.GAME_OVER:
        this.showCard({
          title: 'Out of lives',
          text: `You finished with ${e.a} snack points. Your last save is still on this device.`,
          primaryLabel: 'Load last save',
          primary: () => this.continueGame(),
          secondaryLabel: 'Title screen',
          secondary: () => this.quitToTitle(),
        });
        break;
      case Ev.DIALOGUE:
        this.dlgId = e.a === 0 ? 'bossIntro' : 'bossDefeated';
        this.dlg = DIALOGUE[this.dlgId];
        this.dlgI = 0;
        this.typed = 0;
        this.screen = 'dialogue';
        this.syncUi();
        break;
      case Ev.BOSS_HP:
        this.bossHp = e.a;
        this.syncUi();
        break;
      case Ev.ENDING:
        this.screen = 'ending';
        this.endIdx = 0;
        this.typed = 0;
        this.bossHp = null;
        this.syncUi();
        break;
      case Ev.MAP_PROMPT:
        this.prompt = this.promptFor(e.a, e.b, e.c === 1);
        this.syncUi();
        break;
      default:
        break;
    }
    void sim;
  }

  private promptFor(type: number, id: number, flag: boolean): Prompt | null {
    if (type === 1) {
      const info = LEVELS[id];
      return info
        ? { title: info.name, text: (flag ? 'Cleared · ' : '') + info.blurb, action: 'Enter' }
        : null;
    }
    if (type === 2) {
      const req = LEVELS[id]?.name ?? 'a level';
      return flag
        ? { title: 'Teleporter', text: 'Humming and ready.', action: 'Teleport' }
        : { title: 'Teleporter', text: `Quiet for now. Clear ${req} to power it.`, action: null };
    }
    if (type === 3) {
      return {
        title: 'Spaghetti with meatballs flying saucer',
        text: 'Parked and steaming gently. Billy first.',
        action: null,
      };
    }
    return null;
  }

  private caption(x: number, y: number, id: number): void {
    const text = this.captionNames[id];
    if (!text) return;
    this.audio.caption(text);
    const colour = this.sim.captionColour(id);
    if (!this.opts.captions || colour === 0) return;
    const now = performance.now();
    const seen = this.capSeen.get(id);
    if (seen !== undefined && now - seen < 180) return;
    this.capSeen.set(id, now);
    const cam = this.sim.camera;
    const ppu = this.renderer.pixelsPerUnit(this.halfH);
    const sx = (x - cam.x) * ppu + this.renderer.width / 2;
    const sy = this.renderer.height / 2 - (y - cam.y) * ppu;
    const w = this.renderer.width;
    const h = this.renderer.height;
    if (sx < -50 || sy < -50 || sx > w + 50 || sy > h + 50) return;
    this.ui.caption(sx, sy, text, `#${colour.toString(16).padStart(6, '0')}`);
  }

  private refreshHud(): void {
    const s = this.sim;
    const hud: HudState = {
      score: s.get(State.SCORE),
      lives: s.get(State.LIVES),
      ammo: s.get(State.AMMO),
      red: s.get(State.KEY_RED) === 1,
      blue: s.get(State.KEY_BLUE) === 1,
      usb: s.get(State.HAS_USB) === 1,
    };
    this.hud = hud;
    this.syncUi();
  }
  private hud: HudState | null = null;

  // ---------- Input: menus, commands ----------

  private menuInput(bits: number): void {
    const edge = bits & ~this.lastBits;
    const s = this.screen;
    if (s === 'title' || s === 'pause' || s === 'card') {
      if (!this.sub) {
        if (edge & Bits.UP) this.nav(-1);
        if (edge & Bits.DOWN) this.nav(1);
      }
    }
    if (
      s === 'cine' ||
      s === 'dialogue' ||
      s === 'ending' ||
      s === 'title' ||
      s === 'pause' ||
      s === 'card'
    ) {
      if (edge & (Bits.JUMP | Bits.FIRE)) this.primary();
    }
  }

  private onCommand(c: Command): void {
    switch (c.type) {
      case 'confirm':
        if (this.screen !== 'play') this.input.discardLatched();
        this.primary();
        break;
      case 'pause':
        if (this.screen === 'play') {
          this.screen = 'pause';
          this.menuIdx = 0;
          this.syncUi();
        } else if (this.screen === 'pause') this.resume();
        else if (this.screen === 'cine') this.skipCine();
        else if (this.screen === 'title' && this.sub) this.backFromControls();
        break;
      case 'quickSave':
        this.saveGame();
        break;
      case 'quickLoad':
        this.loadGame();
        break;
      case 'togglePanel':
        this.ui.togglePanel();
        break;
      case 'zoom':
        this.setZoom(c.factor);
        break;
      case 'zoomReset':
        this.setZoom('reset');
        break;
    }
  }

  setZoom(f: number | 'reset'): void {
    this.zoom = f === 'reset' ? 1 : Math.max(0.05, Math.min(3, this.zoom * f));
  }

  private toggle(k: OptionKey): void {
    if (k === 'music') {
      const on = !this.audio.music;
      this.audio.setMusic(on);
      this.ui.setToggle('music', on);
      this.syncUi();
      return;
    }
    if (k === 'sfx') {
      const on = !this.audio.sfx;
      this.audio.setSfx(on);
      this.ui.setToggle('sfx', on);
      this.syncUi();
      return;
    }
    this.opts[k] = !this.opts[k];
    this.ui.setToggle(k, this.opts[k]);
  }

  private readonly onVisibility = (): void => {
    this.visible = document.visibilityState === 'visible';
    this.audio.setActive(this.visible);
    if (!this.visible && this.screen === 'play') {
      this.screen = 'pause';
      this.menuIdx = 0;
      this.syncUi();
    }
  };

  // ---------- Menus ----------

  private menuItems(): MenuItem[] {
    const mus: MenuItem = { label: 'Music', value: this.audio.music ? 'On' : 'Off' };
    const sfx: MenuItem = { label: 'Sound', value: this.audio.sfx ? 'On' : 'Off' };
    if (this.screen === 'title') {
      if (this.sub === 'controls') return [];
      return [
        { label: 'New Game' },
        { label: 'Continue', disabled: !this.hasSave },
        { label: 'Controls' },
        mus,
        sfx,
      ];
    }
    if (this.screen === 'pause') {
      const items: MenuItem[] = [
        { label: 'Resume' },
        { label: 'Save game', value: 'F5' },
        { label: 'Load game', value: 'F9' },
      ];
      if (this.sim.x.mode() === Mode.LEVEL) items.push({ label: 'Leave level' });
      return [...items, mus, sfx, { label: 'Quit to title' }];
    }
    if (this.screen === 'card' && this.card) {
      const items: MenuItem[] = [{ label: this.card.primaryLabel }];
      if (this.card.secondaryLabel) items.push({ label: this.card.secondaryLabel });
      return items;
    }
    return [];
  }

  private nav(d: number): void {
    const items = this.menuItems();
    const n = items.length;
    if (!n) return;
    let i = Math.min(this.menuIdx, n - 1);
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      if (!items[i]?.disabled) break;
    }
    this.audio.play('menu');
    this.menuIdx = i;
    this.syncUi();
  }

  private hover(i: number): void {
    if (this.menuItems()[i]?.disabled || this.menuIdx === i) return;
    this.menuIdx = i;
    this.syncUi();
  }

  /** Activates a menu item by index (mouse click or keyboard). */
  activate(idx?: number): void {
    const items = this.menuItems();
    const i = idx ?? Math.min(this.menuIdx, items.length - 1);
    const it = items[i];
    if (!it || it.disabled) return;
    this.audio.play('click');
    const label = it.label;
    if (this.screen === 'title') {
      if (label === 'New Game') this.newGame();
      else if (label === 'Continue') this.continueGame();
      else if (label === 'Controls') {
        this.sub = 'controls';
        this.menuIdx = 0;
        this.syncUi();
      } else if (label === 'Music') this.toggle('music');
      else if (label === 'Sound') this.toggle('sfx');
    } else if (this.screen === 'pause') {
      if (label === 'Resume') this.resume();
      else if (label === 'Save game') this.saveGame();
      else if (label === 'Load game') this.loadGame();
      else if (label === 'Leave level') this.enterMap();
      else if (label === 'Music') this.toggle('music');
      else if (label === 'Sound') this.toggle('sfx');
      else if (label === 'Quit to title') this.quitToTitle();
    } else if (this.screen === 'card' && this.card) {
      if (i === 0) this.card.primary();
      else this.card.secondary?.();
    }
  }

  private backFromControls(): void {
    this.audio.play('click');
    this.sub = null;
    this.menuIdx = 2;
    this.syncUi();
  }

  /** Enter / jump / fire: finish the typewriter, then advance whatever is on screen. */
  primary(): void {
    const s = this.screen;
    if (s === 'cine') this.typeOrNext(() => this.nextCine());
    else if (s === 'dialogue') this.typeOrNext(() => this.nextLine());
    else if (s === 'ending') this.typeOrNext(() => this.nextEnd());
    else if (s === 'title' || s === 'pause' || s === 'card') {
      if (s === 'title' && this.sub) return this.backFromControls();
      this.activate();
    }
  }

  private curText(): string {
    if (this.screen === 'cine') return CINE[this.cineIdx]?.text ?? '';
    if (this.screen === 'ending') return END[this.endIdx]?.text ?? '';
    if (this.screen === 'dialogue' && this.dlg) return this.dlg[this.dlgI]?.[1] ?? '';
    return '';
  }

  private typeOrNext(next: () => void): void {
    const len = this.curText().length;
    if (this.typed < len) {
      this.typed = len;
      this.syncUi();
      return;
    }
    next();
  }

  private tickTypewriter(dt: number): void {
    const len = this.curText().length;
    if (!len || this.typed >= len) return;
    const before = Math.floor(this.typed);
    this.typed = Math.min(len, this.typed + dt * 83);
    if (Math.floor(this.typed) !== before || this.typed >= len) this.syncUi();
  }

  // ---------- Flow ----------

  newGame(): void {
    this.sim.x.game_new();
    this.sim.x.enter_none();
    this.screen = 'cine';
    this.cineIdx = 0;
    this.typed = 0;
    this.cine.start(0);
    this.syncUi();
  }

  private nextCine(): void {
    const n = this.cineIdx + 1;
    if (n >= CINE.length) return this.skipCine();
    this.cineIdx = n;
    this.typed = 0;
    this.cine.start(n);
    this.syncUi();
  }

  skipCine(): void {
    this.enterMap();
    this.ui.toast('Find Billy. Start at the Crater Fields, up the path to the north.');
  }

  /** Starts (or returns to) the overworld and autosaves progress. */
  enterMap(): void {
    window.clearTimeout(this.completeTimer);
    this.sim.x.enter_map();
    this.screen = 'play';
    this.card = null;
    this.bossHp = null;
    this.prompt = null;
    this.stepper.reset();
    if (writeProgress(this.store, captureProgress(this.sim))) this.hasSave = true;
    this.syncUi();
  }

  continueGame(): void {
    const p = readProgress(this.store);
    if (!p) {
      this.ui.toast('No save on this device yet');
      return;
    }
    this.sim.x.game_new();
    applyProgress(this.sim, p);
    this.enterMap();
  }

  private nextLine(): void {
    const n = this.dlgI + 1;
    if (!this.dlg || n >= this.dlg.length) {
      const intro = this.dlgId === 'bossIntro';
      this.dlg = null;
      this.dlgId = null;
      this.screen = 'play';
      this.bossHp = intro ? 3 : null;
    } else {
      this.dlgI = n;
      this.typed = 0;
    }
    this.syncUi();
  }

  private nextEnd(): void {
    const n = this.endIdx + 1;
    if (n < END.length) {
      this.endIdx = n;
      this.typed = 0;
      this.syncUi();
      return;
    }
    const score = this.sim.get(State.SCORE);
    const lives = this.sim.get(State.LIVES);
    this.showCard({
      title: 'The end of Episode 1',
      text: `Billy's home, the cocoa's back, and you finished with ${score} snack points and ${lives} ${lives === 1 ? 'life' : 'lives'} to spare. Mildred will be back.`,
      primaryLabel: 'Play Again',
      primary: () => this.quitToTitle(),
    });
  }

  private showCard(c: Card): void {
    this.card = c;
    this.screen = 'card';
    this.menuIdx = 0;
    this.syncUi();
  }

  private resume(): void {
    this.screen = 'play';
    this.syncUi();
  }

  private saveGame(): void {
    if (this.screen !== 'play' && this.screen !== 'pause') return;
    const ok = writeProgress(this.store, captureProgress(this.sim));
    this.hasSave ||= ok;
    this.ui.toast(
      ok ? 'Progress saved to this device' : "Couldn't save: storage is full or blocked",
    );
  }

  private loadGame(): void {
    if (readProgress(this.store)) {
      this.continueGame();
      this.ui.toast('Loaded your saved progress');
    } else this.ui.toast('No save yet. Press F5 to make one.');
  }

  private quitToTitle(): void {
    window.clearTimeout(this.completeTimer);
    this.sim.x.load_attract();
    this.screen = 'title';
    this.card = null;
    this.sub = null;
    this.prompt = null;
    this.bossHp = null;
    this.hasSave = readProgress(this.store) !== null;
    this.menuIdx = this.hasSave ? 1 : 0;
    this.stepper.reset();
    this.syncUi();
  }

  // ---------- Overlay + music sync ----------

  private syncUi(): void {
    const s = this.screen;
    const ui = this.ui;
    const hudScreens: Screen[] = ['play', 'pause', 'dialogue', 'card'];
    ui.setHud(hudScreens.includes(s) ? this.hud : null);
    ui.setBoss(this.bossHp !== null && this.bossHp > 0 && s === 'play' ? this.bossHp : null);
    ui.setPrompt(s === 'play' ? this.prompt : null);
    ui.allowPanel(s === 'play' || s === 'title');

    const items = this.menuItems();
    const sel = Math.min(this.menuIdx, Math.max(0, items.length - 1));
    ui.showTitle(
      s === 'title' && !this.sub ? items : null,
      sel,
      s === 'title' && this.sub === 'controls',
    );
    if (s === 'title' && this.sub === 'controls') ui.showTitle(null, 0, true);
    ui.showOverlay(
      s === 'pause'
        ? { title: 'Paused', text: '', note: PAUSE_NOTE, items, sel }
        : s === 'card' && this.card
          ? { title: this.card.title, text: this.card.text, items, sel }
          : null,
    );

    const text = this.curText();
    const typed = Math.min(text.length, Math.floor(this.typed));
    if (s === 'cine' || s === 'ending') {
      const panels = s === 'cine' ? CINE : END;
      const i = s === 'cine' ? this.cineIdx : this.endIdx;
      ui.showLetterbox({
        place: panels[i]?.place ?? '',
        shown: text.slice(0, typed),
        hidden: text.slice(typed),
        pips: '●'.repeat(i + 1) + '○'.repeat(panels.length - i - 1),
        done: typed >= text.length,
        last: i === panels.length - 1,
        skip: s === 'cine',
      });
    } else ui.showLetterbox(null);
    const line = this.dlg?.[this.dlgI];
    ui.showDialogue(
      s === 'dialogue' && line
        ? {
            who: line[0],
            shown: text.slice(0, typed),
            hidden: text.slice(typed),
            done: typed >= text.length,
          }
        : null,
    );
    this.updateMusic();
  }

  private musicFor(): string | null {
    const s = this.screen;
    if (s === 'title' || s === 'loading') return 'title';
    if (s === 'cine') return CINE_TRACK[this.cineIdx] ?? 'cine';
    if (s === 'ending') return 'ending';
    if (s === 'card' && this.card?.title.startsWith('The end of Episode')) return 'ending';
    if (s === 'pause') return null;
    const mode = this.sim.x.mode();
    if (mode === Mode.MAP) return 'map';
    if (mode === Mode.LEVEL) {
      if (this.bossHp !== null && this.bossHp > 0) return 'boss';
      return LEVELS[this.sim.get(State.LEVEL_ID)]?.track ?? 'crater';
    }
    return null;
  }

  private updateMusic(): void {
    const t = this.musicFor();
    if (t !== null || this.screen !== 'pause') this.audio.playMusic(t);
  }

  // ---------- Debug hooks (only exposed with ?debug) ----------

  /** Test hook: jumps straight into a level. */
  debugEnterLevel(id: number): void {
    this.sim.x.game_new();
    this.sim.x.enter_level(id);
    this.handleEvents();
  }

  get debugState(): Record<string, unknown> {
    return {
      screen: this.screen,
      mode: this.sim.x.mode(),
      level: this.sim.get(State.LEVEL_ID),
      score: this.sim.get(State.SCORE),
      lives: this.sim.get(State.LIVES),
      px: this.sim.get(State.PLAYER_X),
      py: this.sim.get(State.PLAYER_Y),
      instances: this.lastCount,
      atlas: this.atlas.size,
    };
  }
}
