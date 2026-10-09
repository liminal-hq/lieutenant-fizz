// Game shell that wires the sim, renderer, input, audio, UI and screen flow together.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { CreditsRoll, creditsPageCount } from '@lieutenant-fizz/engine/credits';
import { buildAtlas, type Atlas } from '@lieutenant-fizz/engine/atlas';
import { GameAudio } from '@lieutenant-fizz/engine/audio';
import type { AudioTune, TuneReport } from '@lieutenant-fizz/engine/audio-tune';
import { noneBackend, vibrateBackend } from '@lieutenant-fizz/engine/haptic-backends';
import { GameHaptics, onScreen } from '@lieutenant-fizz/engine/haptics';
import { BackGuard } from '@lieutenant-fizz/engine/back-guard';
import { placeSound, resolveAudioMode, type AudioMode } from '@lieutenant-fizz/engine/sound-field';
import { StingerScene, type StingerContent } from '@lieutenant-fizz/engine/stinger';
import {
  Input as Bits,
  InputManager,
  type Command,
  type InputDevice,
} from '@lieutenant-fizz/engine/input';
import { FixedStepper, InstanceWriter } from '@lieutenant-fizz/engine/instances';
import type { Grid } from '@lieutenant-fizz/engine/pen';
import { InstancedRenderer } from '@lieutenant-fizz/engine/renderer';
import { frameView, type FrameView } from '@lieutenant-fizz/engine/view-scale';
import { HeldRepeat } from '@lieutenant-fizz/engine/repeat';
import { TouchControls, type EditHooks } from '@lieutenant-fizz/engine/touch-ui';
import {
  readTouchSettings,
  resetPositions,
  touchSpec,
  withPosition,
  writeTouchSettings,
  type TouchSettings,
} from '@lieutenant-fizz/engine/touch-settings';
import simUrl from './wasm/sim.wasm?url';
import { captureState, labItems } from './audio/lab';
import { MIX, mixFor, mixNameFor, type MixName } from './audio/mix';
import { MUSIC, PATTERNS, SFX } from './audio/patterns';
import { ROOMS, roomFor, roomProfile, type RoomName } from './audio/rooms';
import { FIZZ_HAPTICS } from './haptics/fizz-haptics';
import { attractFade, attractLabel, nextAttract } from './attract';
import { backAction, backEnabled } from './back';
import { Cinematic, CINE_TALL } from './cine';
import { isPortrait, watchResize, type TouchGutters } from './layout';
import { touchFaces, type ShellScreen, type SubScreen, type TouchFaces } from './touch-menus';
import { EPISODE } from './episode';
import {
  DEFAULT_OPTIONS,
  LAYOUTS,
  METER_BLOCKS,
  MOTIONS,
  readOptions,
  reducedMotion,
  stepOption,
  TEXT_SIZES,
  volumeOf,
  writeOptions,
  type Options,
  type SettingKey,
} from './options';
import {
  isStepRow,
  resetArmed,
  resetTouch,
  stepTouch,
  touchItems,
  touchRowOf,
  touchRows,
  RESET_ARM_MS,
  type TouchRow,
} from './touch-options';
import {
  applyProgress,
  captureProgress,
  newestSlot,
  readSlot,
  readSlots,
  safeStorage,
  SLOT_IDS,
  writeProgress,
  writeSlot,
  type SlotId,
} from './save';
import {
  areaName,
  slotBrief,
  slotDetail,
  slotName,
  slotTitle,
  summarise,
  type SlotSummary,
} from './slots';
import { thumbDataUrl } from './thumb';
import { SoundLab } from './ui/sound-lab';
import { Ev, Mode, Out, RenderFlag, State, STEP, Table } from './sim/protocol';
import { Sim } from './sim/sim';
import { defineSprites } from './sprites/catalog';
import { CINE, CINE_TRACK, DIALOGUE, END, LEVELS, SAUCER_ID, SIGNS, type Line } from './story';
import { MORTIMER_STINGER } from './stinger';
import { BEN_LOOK, BEN_WAVE, benFrame, benScale, type BenPose } from './titleBen';
import {
  Ui,
  type HudState,
  type TitleLayout,
  type MenuItem,
  type OptionKey,
  type Prompt,
  type SlotRow,
} from './ui';

export type Screen = ShellScreen;

/** Options the host page passes in (from the query string). */
export interface GameOptions {
  /** Shows the Mortimer stinger after the credits, though Episode 1 does not ship one. */
  previewStinger?: boolean;
  /** Forces the reduced-motion credits; otherwise the system preference decides. */
  reducedMotion?: boolean;
  /** Pins touch mode on (the on-screen controls and the phone HUD), for development on a desktop. */
  touch?: boolean;
  /**
   * `sharp` draws at a whole pixel scale and `soft` keeps the fractional scale. Left out, touch
   * devices (and `touch`) are Sharp and everything else is Soft.
   */
  pixels?: 'sharp' | 'soft';
  /**
   * `classic` is the sound as it has always been; `enhanced` places sound effects in the stereo
   * field by where they happen on screen. Left out, the game plays `AUDIO_DEFAULT` (Enhanced).
   */
  audio?: AudioMode;
  /** `split` tries the phone title with the logo and the menu on opposite sides; the default is one column. */
  title?: TitleLayout;
  /** Takes the browser's Back button in an ordinary tab too (`?back`), to try it without fullscreen. */
  back?: boolean;
  /** Turns on haptics (`?haptics`), which are still being tried: the phone's vibrator, in Chrome for Android. */
  haptics?: boolean;
}

/** The `display-mode` values an installed app runs in. */
const INSTALLED_MODES = ['standalone', 'fullscreen', 'minimal-ui'];

/** Whether the canvas should be whole-pixel: decided once at boot and kept for the session. */
function wantsSharp(options: GameOptions): boolean {
  if (options.pixels) return options.pixels === 'sharp';
  if (options.touch) return true;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

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
  private readonly touchUi: TouchControls;
  /** The player's touch settings, read at start and kept up to date as they change. */
  private touchSettings: TouchSettings;
  /** `?touch`: touch mode stays on whatever device is used. */
  private readonly forcedTouch: boolean;
  /**
   * Whether this device has a touch screen: `?touch`, a coarse pointer at start, or any touch so far. It
   * only ever turns on, so the Options rows never shift while the screen is open.
   */
  private touchCapable = false;
  /** The Touch controls rows; Haptics is there only when the device can vibrate. */
  private readonly touchRowList: TouchRow[] = touchRows({
    haptics: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  });
  /** When Reset had its first tap (in `performance.now()` milliseconds), or null. */
  private resetAt: number | null = null;
  /** What the editor reports as controls are moved: every drop is saved. */
  private readonly editHooks: EditHooks = {
    pick: () => this.haptics.ui('move'),
    drop: (id, off) => {
      this.haptics.ui('select');
      this.applyTouchSettings(withPosition(this.touchSettings, id, off));
    },
  };
  private resetTimer = 0;
  /** Whether the on-screen controls and the phone HUD are showing (it follows the device in use). */
  private touchMode = false;
  /** Whether the phone is held upright, so the Rotate screen is showing. */
  private rotated = false;
  /** The Jump and Pogo faces' text, swapped between play and the menus. */
  private faceText: { jump: HTMLElement; pogo: HTMLElement; pogoIcon: HTMLElement | null } | null =
    null;
  /** Held directions repeat in menus (keys, pad and the touch D-pad alike). */
  private readonly repeat = new HeldRepeat(Bits.LEFT | Bits.RIGHT | Bits.UP | Bits.DOWN);
  /** The menu the last frame's input went to, so a direction held into a new one waits for a release. */
  private menuKey = '';
  private unwatchViewport: () => void = () => {};
  /** Holds the one history entry that lets the browser's Back button reach the game. */
  private readonly backGuard = new BackGuard(() => this.back(), window.history, window);
  /** `?back`: the browser's Back button is the game's whatever the display mode. */
  private readonly forcedBack: boolean;
  private unwatchBack: () => void = () => {};
  private readonly audio: GameAudio;
  /** Whether `GameOptions.audio` chose the audio mode, rather than the default applying. */
  private readonly audioForced: boolean;
  /** The room the sound is in, and whether the speaker is a phone's (shorter rooms, lower sends). */
  private roomName: RoomName = 'neutral';
  /** What the sound lab holds in place of the game's choice; null follows the game. */
  private labRoom: RoomName | null = null;
  private labMix: MixName | null = null;
  private labMusic = false;
  private lab: SoundLab | null = null;
  private coarseSpeaker = false;
  private readonly haptics: GameHaptics;
  /** Whether pogo was on last frame, so a toggle can be felt (it raises no event). */
  private pogoOn = false;
  private readonly ui: Ui;
  private readonly cine = new Cinematic();
  private readonly writer: InstanceWriter;
  private readonly stepper = new FixedStepper(STEP);
  private readonly store = safeStorage();
  private captionNames: string[] = [];
  private toastNames: string[] = [];
  private readonly previewStinger: boolean;
  private reducedMotion = false;
  /** Set by `GameOptions.reducedMotion`; overrides the Motion option when present. */
  private readonly reducedForced: boolean | undefined;
  private settings: Options = { ...DEFAULT_OPTIONS };
  private played = 0;
  private attractIdx = 0;
  private readonly benT0 = performance.now() / 1000;
  private benWaveUntil = 0;
  private benLookUntil = 0;
  private titleAction = 0;
  private roll: CreditsRoll | null = null;
  private rollViewport = 0;
  private scene: StingerScene | null = null;
  private stingerGrid: Grid | null = null;
  private readonly capSeen = new Map<number, number>();

  private raf = 0;
  private last = 0;
  private disposed = false;
  private zoom = 1;
  private alpha = 1;
  private halfW = 10;
  private halfH = 6.5;
  /** The whole pixel scale in canvas pixels, or 0 while the view is Soft. */
  private pixelScale = 0;
  private readonly view: FrameView = { halfW: 10, halfH: 6.5, scale: 0 };
  private viewKey = [0, 0, 0, 0, 0, 0, 0];
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
  /** A screen opened from the title or pause menu; the menu underneath keeps its place. */
  private sub: SubScreen = null;
  /** The screens underneath `sub`, each with the row to put the selection back on, innermost last. */
  private subStack: { sub: SubScreen; idx: number }[] = [];
  private saveMode: 'save' | 'load' = 'load';
  private slotRows = new Map<SlotId, { summary: SlotSummary; thumb: string }>();
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

  private constructor(
    sim: Sim,
    atlas: Atlas,
    ui: Ui,
    renderer: InstancedRenderer,
    options: GameOptions,
  ) {
    this.previewStinger = options.previewStinger ?? false;
    this.reducedForced = options.reducedMotion;
    this.sim = sim;
    this.atlas = atlas;
    this.ui = ui;
    this.renderer = renderer;
    this.input = new InputManager(ui.stage);
    this.forcedTouch = options.touch ?? false;
    this.forcedBack = options.back ?? false;
    this.touchSettings = readTouchSettings(this.store);
    this.touchUi = new TouchControls(ui.touchLayer, this.input, {
      labels: { dpad: 'Move', jump: 'Jump', pogo: 'Pogo', fire: 'Fizz', pause: 'Pause' },
      editLabels: { dpad: 'Move D-pad' },
      spec: touchSpec(this.touchSettings),
    });
    ui.setTouchOpacity(this.touchSettings.opacity);
    this.audio = new GameAudio({ ...PATTERNS, mix: MIX });
    this.audioForced = options.audio !== undefined;
    this.audio.setMode(resolveAudioMode(options.audio));
    this.coarseSpeaker = !!window.matchMedia?.('(pointer: coarse)').matches;
    this.haptics = new GameHaptics(FIZZ_HAPTICS, performance);
    this.haptics.setBackend(options.haptics ? vibrateBackend(navigator) : noneBackend);
    this.settings = readOptions(this.store);
    this.applySettings();
    this.input.onDevice(() => this.syncHints());
    // Touch mode follows the device in use: a touch turns it on, a key or a gamepad turns it off.
    this.input.onDevice((d) => this.setTouchMode(this.forcedTouch || d === 'touch'));
    window.addEventListener('pointerdown', this.onTouchPointer, { capture: true, passive: true });
    ui.stage.addEventListener('contextmenu', this.onContextMenu);
    this.unwatchViewport = watchResize(() => this.onViewport());
    this.touchCapable = this.forcedTouch || !!window.matchMedia?.('(pointer: coarse)').matches;
    if (this.touchCapable) this.input.noteTouch();
    if (this.forcedTouch) this.setTouchMode(true);
    this.writer = new InstanceWriter(sim.instanceBuffer, atlas.rects);
    this.captionNames = sim.names(Table.CAPTIONS);
    this.toastNames = sim.names(Table.TOASTS);
    this.input.onCommand((c) => this.onCommand(c));
    this.unwatchBack = this.watchBack();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onVisibility);
  }

  /** Builds the atlas, loads the WASM sim and starts the loop on the title screen. */
  static async start(host: HTMLElement, options: GameOptions = {}): Promise<Game> {
    let game: Game | null = null;
    const ui = new Ui(host, {
      menuClick: (i) => game?.activate(i),
      menuHover: (i) => game?.hover(i),
      menuStep: (i, d) => game?.stepRow(i, d),
      advance: () => game?.primary(),
      skipCine: () => game?.skipCine(),
      toggle: (k) => game?.toggle(k),
      zoom: (f) => game?.setZoom(f),
      back: () => game?.backFromSub(),
      editReset: () => game?.tapEditReset(),
      creditsPress: () => game?.primary(),
      creditsSkip: () => game?.skipEnding(),
      stingerPress: () => game?.primary(),
      stingerSkip: () => game?.skipEnding(),
    });
    try {
      const [sim] = await Promise.all([Sim.load(simUrl)]);
      const sprites = defineSprites();
      const soda = sprites.find((d) => d.name === 'soda');
      if (soda) ui.setBullet(soda.grid);
      const ben: Partial<Record<BenPose, Grid>> = {};
      for (const pose of ['stand', 'jump', 'shoot', 'pogo', 'pogo2'] as const) {
        const def = sprites.find((d) => d.name === `ben_${pose}`);
        if (def) ben[pose] = def.grid;
      }
      ui.setBenSprites(ben);
      const grid = (name: string): Grid | undefined => sprites.find((d) => d.name === name)?.grid;
      const [lives, snacks, fizz] = [grid('ben_stand'), grid('cookie'), grid('soda')];
      if (lives && snacks && fizz) ui.setHudIcons({ lives, snacks, fizz });
      const atlas = buildAtlas(sprites);
      sim.setSprites(atlas.rects);
      const renderer = new InstancedRenderer(ui.gl, atlas, wantsSharp(options));
      game = new Game(sim, atlas, ui, renderer, options);
      if (options.title) ui.setTitleLayout(options.title);
      game.initTouchFaces(grid('ben_pogo'), grid('soda'));
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
    this.loadAttract(0);
    this.hasSave = newestSlot(this.store) !== null;
    this.screen = 'title';
    this.ui.setLoading(false);
    for (const k of Object.keys(this.opts) as (keyof Game['opts'])[])
      this.ui.setToggle(k, this.opts[k]);
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
    window.removeEventListener('pointerdown', this.onTouchPointer, { capture: true });
    this.ui.stage.removeEventListener('contextmenu', this.onContextMenu);
    this.unwatchViewport();
    this.unwatchBack();
    this.backGuard.dispose();
    this.touchUi.dispose();
    window.clearTimeout(this.titleAction);
    window.clearTimeout(this.resetTimer);
    this.input.dispose();
    this.audio.dispose();
    this.haptics.dispose();
    this.ui.dispose();
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
    const r = this.renderer;
    const k = this.viewKey;
    const sharp = r.pixelGrid ? 1 : 0;
    if (
      k[0] !== r.canvasWidth ||
      k[1] !== r.canvasHeight ||
      k[2] !== r.width ||
      k[3] !== r.height ||
      k[4] !== tall ||
      k[5] !== this.zoom ||
      k[6] !== sharp
    ) {
      k[0] = r.canvasWidth;
      k[1] = r.canvasHeight;
      k[2] = r.width;
      k[3] = r.height;
      k[4] = tall;
      k[5] = this.zoom;
      k[6] = sharp;
      frameView(this.view, {
        cssW: r.width,
        cssH: r.height,
        devW: r.canvasWidth,
        devH: r.canvasHeight,
        target: tall,
        zoom: this.zoom,
        sharp: r.pixelGrid,
      });
      this.halfW = this.view.halfW;
      this.halfH = this.view.halfH;
      this.pixelScale = this.view.scale;
    }
    sim.x.set_view(this.halfW, this.halfH);

    const bits = this.input.peek();
    this.menuInput(bits);
    this.lastBits = bits;
    // The sim samples touch presses in play; a menu has no step, so it marks them seen itself.
    if (screen !== 'play') this.input.markTouchSeen();

    // Gameplay haptics follow the level only: the title's attract loop raises captions too.
    this.haptics.setGameplay(screen === 'play');
    if (screen === 'play' || screen === 'title') {
      this.alpha = this.stepper.advance(dt, () => {
        sim.step(screen === 'play' ? this.input.poll() : 0);
      });
      if (screen === 'play') {
        this.levelSeconds += dt;
        this.played += dt;
        // Toggling pogo raises no event, so the lit state is read each frame (it writes on a change only).
        if (this.touchMode) this.touchUi.setLit(sim.get(State.POGO_ON) === 1);
        const pogo = sim.get(State.POGO_ON) === 1;
        if (pogo !== this.pogoOn) this.haptics.cue(pogo ? 'pogoOn' : 'pogoOff');
        this.pogoOn = pogo;
      } else this.pogoOn = sim.get(State.POGO_ON) === 1;
      this.handleEvents();
    } else if (screen === 'credits') {
      this.stepper.reset();
      this.alpha = 1;
      sim.drainEvents().forEach((e) => this.onEvent(e));
      this.tickCredits(dt);
    } else if (screen === 'stinger') {
      this.stepper.reset();
      this.alpha = 1;
      sim.drainEvents().forEach((e) => this.onEvent(e));
      this.tickStinger(dt);
    } else if (screen === 'cine') {
      this.alpha = this.stepper.advance(dt, () => this.cine.tick(STEP));
    } else {
      this.stepper.reset();
      this.alpha = 1;
      sim.drainEvents().forEach((e) => this.onEvent(e));
    }
    if (this.touchMode) this.touchUi.frame(performance.now());
    this.haptics.flush();
    this.tickTypewriter(dt);
    this.tickTitle();
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
        scale: this.pixelScale,
        pad: this.input.padConnected,
      });
    }
  }

  private lastCount = 0;
  /** Test hook: draws without lighting, so sprite colours are flat. */
  private flatDraw = false;
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
    let lighting = (o[Out.LIGHTING] ?? 0) > 0.5 && this.opts.lighting && !this.flatDraw;
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
        this.pogoOn = sim.get(State.POGO_ON) === 1;
        this.ui.toast(LEVELS[e.a]?.name ?? '');
        this.syncUi();
        break;
      case Ev.LEVEL_COMPLETE: {
        const id = e.a;
        if (id >= SAUCER_ID) {
          // The saucer has no goal: walking out of it just goes back to the map.
          this.enterMap();
          break;
        }
        window.clearTimeout(this.completeTimer);
        this.completeTimer = window.setTimeout(() => {
          if (this.disposed || this.screen !== 'play') return;
          this.showCard({
            title: `${LEVELS[id]?.name ?? 'Level'} cleared`,
            text: LEVELS[id]?.cleared ?? '',
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
        this.haptics.cue('gameOver');
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
        // Each hit already raised ZZZAP; only the last one gets the long fade.
        if (e.a <= 0) this.haptics.cue('bossDown');
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
        this.prompt = this.promptFor(e.a, e.b, e.c);
        this.syncUi();
        break;
      default:
        break;
    }
    void sim;
  }

  /**
   * Builds the map prompt for a sim event. `extra` is the cleared flag for levels (1) and
   * teleporters (2), and the locked level's own id for a locked level (4).
   */
  private promptFor(type: number, id: number, extra: number): Prompt | null {
    if (type === 1) {
      const info = LEVELS[id];
      return info
        ? {
            title: info.name,
            text: (extra === 1 ? 'Cleared · ' : '') + info.blurb,
            action: 'Enter',
          }
        : null;
    }
    if (type === 4) {
      const info = LEVELS[extra];
      return info
        ? {
            title: info.name,
            text: `Locked until you clear ${LEVELS[id]?.name ?? 'another level'}.`,
            action: null,
          }
        : null;
    }
    if (type === 2) {
      const req = LEVELS[id]?.name ?? 'a level';
      return extra === 1
        ? { title: 'Teleporter', text: 'Humming and ready.', action: 'Teleport' }
        : { title: 'Teleporter', text: `Quiet for now. Clear ${req} to power it.`, action: null };
    }
    if (type === 5) {
      return {
        title: 'A dormant teleporter',
        text: 'Humming faintly, and going nowhere. Somewhere, something is hiding its other half.',
        action: null,
      };
    }
    if (type === 6) {
      return { title: 'Sign', text: SIGNS[id] ?? '', action: null };
    }
    if (type === 3) {
      return {
        title: 'Spaghetti with meatballs flying saucer',
        text: 'Parked and steaming gently. Step inside for a look around.',
        action: 'Enter',
      };
    }
    return null;
  }

  private caption(x: number, y: number, id: number): void {
    const text = this.captionNames[id];
    if (!text) return;
    // Only Enhanced places a sound; Classic gets no position at all, so it cannot change.
    const at =
      this.audio.mode === 'enhanced'
        ? placeSound(x, y, this.sim.camera, { w: this.halfW, h: this.halfH })
        : undefined;
    this.audio.caption(text, at);
    // Out in the level, a world cue is felt only when it is on screen (and with Captions off too).
    this.haptics.caption(text, onScreen(x, y, this.sim.camera, this.halfW, this.halfH));
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
      green: s.get(State.KEY_GREEN) === 1,
      usb: s.get(State.HAS_USB) === 1,
    };
    this.hud = hud;
    this.touchUi.setCount(String(hud.ammo));
    this.syncUi();
  }
  private hud: HudState | null = null;

  // ---------- Title: attract loop and Ben ----------

  /** Loads one level of the attract loop, with the camera held still under reduced motion. */
  private loadAttract(idx: number): void {
    this.attractIdx = idx;
    this.sim.x.load_attract(idx, this.reducedMotion ? 1 : 0);
  }

  /** Advances the attract loop, fades between levels, and animates Ben on the title. */
  private tickTitle(): void {
    if (this.screen !== 'title') {
      this.ui.setAttract(null);
      this.ui.setBen(null);
      return;
    }
    const sim = this.sim;
    const ticks = sim.get(State.ATTRACT_T);
    const period = sim.get(State.ATTRACT_PERIOD);
    if (!this.reducedMotion && ticks >= period) {
      this.loadAttract(nextAttract(this.attractIdx));
    }
    this.ui.setAttract({
      label: attractLabel(this.attractIdx),
      fade: attractFade(ticks, period, this.reducedMotion),
    });
    if (this.sub) {
      this.ui.setBen(null);
      return;
    }
    const now = performance.now() / 1000;
    const scale = benScale(window.innerHeight);
    const box = this.ui.logoBox();
    this.ui.setBen(
      benFrame({ logoW: box.w, logoH: box.h, width: 16 * scale }, now - this.benT0, {
        reduced: this.reducedMotion,
        waveLeft: Math.max(0, this.benWaveUntil - now),
        looking: this.benLookUntil > now,
      }),
      scale,
    );
  }

  /** Ben turns to face the menu for a moment, as the selection moves. */
  private benLook(): void {
    this.benLookUntil = performance.now() / 1000 + BEN_LOOK;
  }

  // ---------- Input: menus, commands ----------

  /**
   * Menus read the same bits from every source, so the touch controls drive them as a gamepad does.
   * Choosing and going back need a fresh press (a button held as a screen opens chooses nothing until
   * it is pressed again); a held direction moves once, then repeats after a delay.
   */
  private menuInput(bits: number): void {
    const edge = bits & ~this.lastBits;
    const s = this.screen;
    const key = `${s}:${this.sub ?? ''}`;
    if (key !== this.menuKey) {
      this.menuKey = key;
      this.repeat.hold(bits);
    }
    const move = this.repeat.update(bits, performance.now());
    if (s === 'title' || s === 'pause' || s === 'card') {
      if (this.sub !== 'controls') {
        if (move & Bits.UP) this.nav(-1);
        if (move & Bits.DOWN) this.nav(1);
      }
      if (this.sub === 'options' || this.sub === 'touch') {
        if (move & Bits.LEFT) this.adjust(-1);
        if (move & Bits.RIGHT) this.adjust(1);
      }
      // B (the pogo button) goes back from a screen opened over a menu.
      if (this.sub && edge & Bits.POGO) this.closeSub();
    }
    if (
      s === 'cine' ||
      s === 'dialogue' ||
      s === 'ending' ||
      s === 'credits' ||
      s === 'stinger' ||
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
        } else if (this.sub && (this.screen === 'pause' || this.screen === 'title'))
          this.closeSub();
        else if (this.screen === 'pause') this.resume();
        else if (this.screen === 'cine') this.skipCine();
        else if (this.screen === 'credits' || this.screen === 'stinger') this.skipEnding();
        break;
      case 'quickSave':
        this.quickSave();
        break;
      case 'quickLoad':
        this.quickLoad();
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
    if (k === 'music' || k === 'sfx') {
      // The engine panel switches a channel between silent and full; Options holds the levels.
      this.settings = { ...this.settings, [k]: this.settings[k] > 0 ? 0 : METER_BLOCKS };
      this.applySettings();
      return;
    }
    if (k === 'captions') {
      this.settings = { ...this.settings, captions: !this.settings.captions };
      this.applySettings();
      return;
    }
    this.opts[k] = !this.opts[k];
    this.ui.setToggle(k, this.opts[k]);
  }

  /** Applies the options to audio, captions, text size, motion and hints, and saves them. */
  private applySettings(save = true): void {
    const o = this.settings;
    this.audio.setMusicVolume(volumeOf(o.music));
    this.audio.setMusic(o.music > 0);
    this.audio.setSfxVolume(volumeOf(o.sfx));
    this.audio.setSfx(o.sfx > 0);
    this.opts.captions = o.captions;
    const before = this.reducedMotion;
    this.reducedMotion =
      this.reducedForced ??
      reducedMotion(o, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.ui.setReducedMotion(this.reducedMotion);
    this.haptics.setCalm(this.reducedMotion);
    if (before !== this.reducedMotion && this.screen === 'title') this.loadAttract(this.attractIdx);
    this.ui.setTextLarge(o.text === 1);
    this.ui.setToggle('music', o.music > 0);
    this.ui.setToggle('sfx', o.sfx > 0);
    this.ui.setToggle('captions', o.captions);
    this.syncHints();
    if (save) writeOptions(this.store, o);
  }

  private syncHints(): void {
    const device: InputDevice = this.input.device;
    this.ui.setHintContext({ device, layout: this.settings.layout });
  }

  private readonly onVisibility = (): void => {
    this.visible = document.visibilityState === 'visible';
    this.audio.setActive(this.visible);
    this.haptics.setActive(this.visible);
    if (!this.visible) this.autoPause();
  };

  /** Pauses a level in play, for when the page hides or the phone is turned upright. */
  private autoPause(): void {
    if (this.screen !== 'play') return;
    this.screen = 'pause';
    this.menuIdx = 0;
    this.syncUi();
  }

  // ---------- Touch ----------

  /** A real touch anywhere switches to touch mode, even before a control has been touched. */
  private readonly onTouchPointer = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    this.input.noteTouch();
    if (!this.touchCapable) {
      this.touchCapable = true;
      // The Touch controls row appears before Back, so a selection on Back moves down with it.
      if (this.sub === 'options' && this.menuIdx >= Game.OPTION_ROWS.length) this.menuIdx++;
      if (this.sub === 'options') this.syncUi();
    }
  };

  /** A long press on the controls must not open the browser's menu. */
  private readonly onContextMenu = (e: Event): void => {
    if (this.touchMode) e.preventDefault();
  };

  /** Puts the icons inside the touch buttons (the engine builds the buttons, the episode draws on them). */
  private initTouchFaces(pogo: Grid | undefined, soda: Grid | undefined): void {
    const text = (id: 'jump' | 'pogo', label: string): HTMLElement => {
      const t = document.createElement('span');
      t.className = 'lbl';
      t.textContent = label;
      this.touchUi.face(id).append(t);
      return t;
    };
    const icon = (id: 'pogo' | 'fire', grid: Grid | undefined): HTMLElement | null => {
      if (!grid) return null;
      const img = document.createElement('img');
      img.src = this.ui.spriteUrl(grid);
      img.alt = '';
      img.draggable = false;
      this.touchUi.face(id).prepend(img);
      return img;
    };
    const jump = text('jump', 'Jump');
    const pogoIcon = icon('pogo', pogo);
    // Pogo shows its icon in play and the word Back in a menu.
    const pogoText = text('pogo', '');
    pogoText.hidden = true;
    this.faceText = { jump, pogo: pogoText, pogoIcon };
    icon('fire', soda);
    const bars = document.createElement('span');
    bars.className = 'bars';
    this.touchUi.face('pause').append(bars);
  }

  /** Switches the on-screen controls and the phone HUD on or off. */
  private setTouchMode(on: boolean): void {
    if (on === this.touchMode) return;
    this.touchMode = on;
    this.ui.setTouchMode(on);
    if (this.hud) this.touchUi.setCount(String(this.hud.ammo));
    this.onViewport();
    this.syncUi();
  }

  /** The room the shown controls take around the menus: the gutters, where content must stop above them, the hand. */
  private touchGutters(): TouchGutters {
    const tops = this.touchUi.tops();
    return {
      ...this.touchUi.gutters(),
      leftTop: tops.left,
      rightTop: tops.right,
      hand: this.touchUi.hand(),
    };
  }

  /** The window changed size or the phone turned: place the controls and show Rotate if upright. */
  private onViewport(): void {
    const rotate = this.touchMode && isPortrait(window.innerWidth, window.innerHeight);
    if (rotate !== this.rotated) {
      this.rotated = rotate;
      this.ui.setRotate(rotate);
      if (rotate) this.autoPause();
      this.syncUi();
    }
    this.touchUi.relayout();
    this.ui.setTouchGutters(this.touchGutters());
  }

  /**
   * Shows the on-screen controls on every screen but loading and Rotate, with the set and the labels
   * the screen uses. Touch input counts exactly while they show; hiding them drops every finger.
   */
  private syncTouch(): void {
    const s = this.screen;
    const on = this.touchMode && s !== 'loading' && !this.rotated;
    const faces: TouchFaces = touchFaces(s, this.sub);
    const edit = on && !!faces.edit;
    this.touchUi.setVisible(on);
    // In the editor a finger moves a control, so it presses nothing.
    this.input.setTouchEnabled(on && !edit);
    this.touchUi.setEditing(edit, this.editHooks);
    this.ui.touchLayer.dataset.mode = faces.edit ? 'edit' : faces.play ? 'play' : 'menu';
    this.touchUi.setDeferred(!faces.play);
    this.touchUi.setShown(faces.shown);
    this.touchUi.setName('jump', faces.jump);
    this.touchUi.setName('pogo', faces.pogo);
    const t = this.faceText;
    if (t) {
      if (t.jump.textContent !== faces.jump) t.jump.textContent = faces.jump;
      if (t.pogo.textContent !== faces.pogo) t.pogo.textContent = faces.pogo;
      t.pogo.hidden = faces.play;
      if (t.pogoIcon) t.pogoIcon.hidden = !faces.play;
    }
    if (!faces.play) this.touchUi.setLit(false);
    this.ui.setTouchGutters(this.touchGutters());
  }

  // ---------- Menus ----------

  /** The Options rows, in order, and the setting each one changes. */
  private static readonly OPTION_ROWS: { label: string; key: SettingKey }[] = [
    { label: 'Music', key: 'music' },
    { label: 'Sound', key: 'sfx' },
    { label: 'Captions', key: 'captions' },
    { label: 'Controls', key: 'layout' },
    { label: 'Text size', key: 'text' },
    { label: 'Motion', key: 'motion' },
  ];

  private optionItems(): MenuItem[] {
    const o = this.settings;
    const text = (key: SettingKey): string =>
      key === 'captions'
        ? o.captions
          ? 'On'
          : 'Off'
        : key === 'layout'
          ? (LAYOUTS[o.layout] ?? '')
          : key === 'text'
            ? (TEXT_SIZES[o.text] ?? '')
            : (MOTIONS[o.motion] ?? '');
    const rows: MenuItem[] = Game.OPTION_ROWS.map(({ label, key }) =>
      key === 'music' || key === 'sfx'
        ? { id: `opt:${key}`, label, kind: 'meter', meter: o[key] }
        : { id: `opt:${key}`, label, kind: 'choice', value: text(key) },
    );
    if (this.touchCapable) rows.push({ id: 'touch', label: 'Touch controls' });
    return [...rows, { id: 'back', label: 'Back' }];
  }

  /** One row per save slot, then Back. In save mode the autosave cannot be chosen. */
  private slotItems(): MenuItem[] {
    const rows = SLOT_IDS.map((id): MenuItem => {
      const entry = this.slotRows.get(id);
      const summary = entry?.summary ?? summarise(id, null, '');
      const slot: SlotRow = {
        title: slotTitle(summary),
        detail: slotDetail(summary, this.saveMode),
        brief: slotBrief(summary, this.saveMode),
        thumb: entry?.thumb ?? '',
        empty: summary.empty,
        cleared: summary.cleared,
        total: summary.total,
      };
      return {
        id: `slot:${id}`,
        label: summary.name,
        slot,
        disabled: this.saveMode === 'save' && summary.readOnly,
      };
    });
    return [...rows, { id: 'back', label: 'Back' }];
  }

  private menuItems(): MenuItem[] {
    if (this.sub === 'options') return this.optionItems();
    if (this.sub === 'touch')
      return touchItems(
        this.touchSettings,
        this.touchRowList,
        resetArmed(this.resetAt, performance.now()),
      );
    if (this.sub === 'saves') return this.slotItems();
    if (this.sub === 'touchEdit') return [];
    if (this.screen === 'title') {
      if (this.sub === 'controls') return [];
      const newest = newestSlot(this.store);
      return [
        { id: 'new', label: 'New Game' },
        {
          id: 'continue',
          label: 'Continue',
          disabled: !this.hasSave,
          ...(newest ? { value: slotName(newest) } : {}),
        },
        { id: 'load', label: 'Load game', disabled: !this.hasSave },
        { id: 'options', label: 'Options' },
        { id: 'controls', label: 'Controls' },
      ];
    }
    if (this.screen === 'pause') {
      const items: MenuItem[] = [
        { id: 'resume', label: 'Resume' },
        // F5 and F9 are keyboard shortcuts, so a touch screen leaves them out.
        { id: 'save', label: 'Save game', ...(this.touchMode ? {} : { value: 'F5' }) },
        { id: 'load', label: 'Load game', ...(this.touchMode ? {} : { value: 'F9' }) },
        { id: 'options', label: 'Options' },
      ];
      if (this.sim.x.mode() === Mode.LEVEL) items.push({ id: 'leave', label: 'Leave level' });
      return [...items, { id: 'quit', label: 'Quit to title' }];
    }
    if (this.screen === 'card' && this.card) {
      const items: MenuItem[] = [{ id: 'primary', label: this.card.primaryLabel }];
      if (this.card.secondaryLabel)
        items.push({ id: 'secondary', label: this.card.secondaryLabel });
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
    this.disarmReset();
    this.haptics.ui('move');
    this.menuIdx = i;
    this.benLook();
    this.syncUi();
  }

  private hover(i: number): void {
    if (this.menuItems()[i]?.disabled || this.menuIdx === i) return;
    this.disarmReset();
    this.menuIdx = i;
    this.benLook();
    this.syncUi();
  }

  /** Opens a screen over the title or pause menu, remembering which row opened it. */
  private openSub(sub: NonNullable<SubScreen>, menuIdx = 0): void {
    this.subStack.push({ sub: this.sub, idx: this.menuIdx });
    this.sub = sub;
    this.menuIdx = menuIdx;
    this.syncUi();
  }

  /** Closes the screen opened over a menu and puts the selection back on the row that opened it. */
  private closeSub(): void {
    if (!this.sub) return;
    this.audio.play('click');
    this.haptics.ui('back');
    this.disarmReset();
    const under = this.subStack.pop();
    this.sub = under?.sub ?? null;
    this.menuIdx = under?.idx ?? 0;
    this.syncUi();
  }

  private openSaves(mode: 'save' | 'load'): void {
    this.saveMode = mode;
    this.refreshSlots();
    const newest = newestSlot(this.store);
    // Save mode starts on Slot 1 (the autosave is read-only); load mode on the newest save.
    const idx = mode === 'save' ? 1 : Math.max(0, SLOT_IDS.indexOf(newest ?? 'auto'));
    this.openSub('saves', idx);
  }

  /** Reads every slot and draws its thumbnail. Done when the screen opens and after a save. */
  private refreshSlots(): void {
    const thumb = this.sim.overworldThumb();
    this.slotRows.clear();
    for (const { id, save } of readSlots(this.store)) {
      const map = save?.progress.map;
      const place = areaName(map ? this.sim.areaOf(map.x, map.y) : 0);
      this.slotRows.set(id, {
        summary: summarise(id, save, place),
        thumb: save ? thumbDataUrl(thumb, save.progress.doneMask, map) : '',
      });
    }
  }

  /** Left or right on an Options or Touch controls row. */
  private adjust(d: number): void {
    if (this.sub === 'touch') {
      this.stepTouchRow(this.touchRowList[this.menuIdx] ?? null, d, false);
      return;
    }
    if (this.sub !== 'options') return;
    const row = Game.OPTION_ROWS[this.menuIdx];
    if (!row) return;
    this.step(row.key, d, false);
  }

  private step(key: SettingKey, d: number, wrapMeter: boolean): void {
    const next = stepOption(this.settings, key, d, wrapMeter);
    if (next[key] === this.settings[key]) return;
    this.settings = next;
    this.audio.play('menu');
    const value = next[key];
    this.haptics.ui(typeof value === 'boolean' ? (value ? 'toggleOn' : 'toggleOff') : 'move');
    this.applySettings();
    this.syncUi();
  }

  /** A tap on an Options row's stepper: selects the row and steps its setting down or up. */
  private stepRow(i: number, d: number): void {
    if (this.sub === 'touch') {
      if (!isStepRow(this.touchRowList[i] ?? null)) return;
    } else if (this.sub !== 'options' || !Game.OPTION_ROWS[i]) return;
    if (this.menuIdx !== i) {
      this.menuIdx = i;
      this.syncUi();
    }
    this.adjust(d);
  }

  /** Steps a Touch controls setting; Size and Left-handed show at once on the controls behind the menu. */
  private stepTouchRow(row: TouchRow | null, d: number, wrap: boolean): void {
    if (!row) return;
    const s = this.touchSettings;
    const next = stepTouch(s, row, d, wrap);
    const changed =
      next.size !== s.size ||
      next.opacity !== s.opacity ||
      next.leftHanded !== s.leftHanded ||
      next.haptics !== s.haptics;
    if (!changed) return;
    this.disarmReset();
    this.audio.play('menu');
    this.haptics.ui(
      next.haptics !== s.haptics
        ? next.haptics
          ? 'toggleOn'
          : 'toggleOff'
        : next.leftHanded !== s.leftHanded
          ? next.leftHanded
            ? 'toggleOn'
            : 'toggleOff'
          : 'move',
    );
    this.applyTouchSettings(next);
    this.syncUi();
  }

  /** Puts new touch settings to use now (the controls, their opacity and the room they take) and saves them. */
  private applyTouchSettings(next: TouchSettings): void {
    this.touchSettings = next;
    this.touchUi.setSpec(touchSpec(next));
    this.ui.setTouchOpacity(next.opacity);
    this.ui.setTouchGutters(this.touchGutters());
    writeTouchSettings(this.store, next);
  }

  /** Reset asks twice: the first tap arms it for a few seconds, the second puts every touch setting back. */
  private tapReset(): void {
    if (resetArmed(this.resetAt, performance.now())) {
      this.disarmReset();
      this.applyTouchSettings(resetTouch());
      this.syncUi();
      return;
    }
    this.armReset();
  }

  /** The first tap of a two-tap Reset: it waits a few seconds for the second. */
  private armReset(): void {
    this.resetAt = performance.now();
    window.clearTimeout(this.resetTimer);
    this.resetTimer = window.setTimeout(() => this.disarmReset(), RESET_ARM_MS);
    this.syncUi();
  }

  /** Cancels a Reset waiting for its second tap, and redraws if it was showing. */
  private disarmReset(): void {
    window.clearTimeout(this.resetTimer);
    if (this.resetAt === null) return;
    this.resetAt = null;
    if (this.sub === 'touch' || this.sub === 'touchEdit') this.syncUi();
  }

  /** Reset in the editor puts the controls back where they start (the other settings stay), after two taps. */
  tapEditReset(): void {
    if (this.sub !== 'touchEdit') return;
    if (resetArmed(this.resetAt, performance.now())) {
      this.disarmReset();
      this.audio.play('click');
      this.haptics.ui('select');
      this.applyTouchSettings(resetPositions(this.touchSettings));
      this.syncUi();
      return;
    }
    this.haptics.ui('select');
    this.armReset();
  }

  /** Activates a menu item by index (mouse click or keyboard). */
  activate(idx?: number): void {
    // The Controls screen has no rows of its own; Enter, jump or fire on it goes back.
    if (this.sub === 'controls') {
      this.closeSub();
      return;
    }
    // The editor has no rows; Enter, jump or fire on it is Done.
    if (this.sub === 'touchEdit') {
      this.closeSub();
      return;
    }
    const items = this.menuItems();
    const i = idx ?? Math.min(this.menuIdx, items.length - 1);
    const it = items[i];
    if (!it) return;
    if (it.disabled) {
      this.haptics.ui('reject');
      return;
    }
    // A tap chooses the row it lands on, so the screen it opens returns to that row.
    this.menuIdx = i;
    this.audio.play('click');
    const id = it.id ?? '';
    if (id !== 'back') this.haptics.ui('select');
    if (this.sub === 'touch') {
      const row = touchRowOf(id);
      if (row === 'back') this.closeSub();
      else if (row === 'reset') this.tapReset();
      else if (row === 'move') {
        this.disarmReset();
        this.openSub('touchEdit');
      } else {
        this.stepTouchRow(row, 1, true);
      }
      return;
    }
    if (this.sub === 'options') {
      if (id === 'back') this.closeSub();
      else if (id === 'touch') this.openSub('touch');
      else if (id.startsWith('opt:')) {
        const key = id.slice(4) as SettingKey;
        this.step(key, 1, true);
      }
      return;
    }
    if (this.sub === 'saves') {
      if (id === 'back') this.closeSub();
      else if (id.startsWith('slot:')) {
        const raw = id.slice(5);
        this.pickSlot(raw === 'auto' ? 'auto' : (Number(raw) as SlotId));
      }
      return;
    }
    if (this.screen === 'title') {
      // Ben waves for a moment before the choice takes effect, unless motion is reduced.
      const run = (): void => {
        this.titleAction = 0;
        if (this.screen !== 'title') return;
        if (id === 'new') this.newGame();
        else if (id === 'continue') this.continueGame();
        else if (id === 'load') this.openSaves('load');
        else if (id === 'options') this.openSub('options');
        else if (id === 'controls') this.openSub('controls');
      };
      if (this.titleAction) return;
      if (this.reducedMotion) run();
      else {
        this.benWaveUntil = performance.now() / 1000 + BEN_WAVE;
        this.titleAction = window.setTimeout(run, 650);
      }
    } else if (this.screen === 'pause') {
      if (id === 'resume') this.resume();
      else if (id === 'save') this.openSaves('save');
      else if (id === 'load') this.openSaves('load');
      else if (id === 'options') this.openSub('options');
      else if (id === 'leave') this.enterMap();
      else if (id === 'quit') this.quitToTitle();
    } else if (this.screen === 'card' && this.card) {
      if (id === 'primary') this.card.primary();
      else this.card.secondary?.();
    }
  }

  /** The Back button: closes the screen opened over the title or the pause menu. */
  private backFromSub(): void {
    this.closeSub();
  }

  /**
   * The browser's Back button, or a native one (a Tauri predictive-back plugin will call this): does
   * what Back means on the screen showing, as `backAction` says.
   */
  back(): void {
    switch (backAction(this.screen, this.sub)) {
      case 'close':
        this.closeSub();
        break;
      case 'pause':
        this.screen = 'pause';
        this.menuIdx = 0;
        this.syncUi();
        break;
      case 'resume':
        this.resume();
        break;
      case 'skip':
        if (this.screen === 'cine') this.skipCine();
        else this.skipEnding();
        break;
      default:
        break;
    }
  }

  /** Whether the game is in fullscreen or an installed app, where it takes the browser's Back button. */
  private backOn(): boolean {
    const mq = (q: string): boolean => {
      try {
        return window.matchMedia?.(q).matches ?? false;
      } catch {
        return false;
      }
    };
    return backEnabled({
      standalone:
        INSTALLED_MODES.some((m) => mq(`(display-mode: ${m})`)) ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
      fullscreen: document.fullscreenElement !== null,
      forced: this.forcedBack,
    });
  }

  /** Holds the Back guard entry only while the screen has an answer to Back and the mode allows it. */
  private syncBack(): void {
    this.backGuard.set(this.backOn() && backAction(this.screen, this.sub) !== null);
  }

  /** Re-checks Back when the game enters or leaves fullscreen or an installed display mode. */
  private watchBack(): () => void {
    const sync = (): void => this.syncBack();
    document.addEventListener('fullscreenchange', sync);
    const lists: MediaQueryList[] = [];
    for (const m of INSTALLED_MODES) {
      try {
        const list = window.matchMedia?.(`(display-mode: ${m})`);
        list?.addEventListener?.('change', sync);
        if (list) lists.push(list);
      } catch {
        /* no media queries here */
      }
    }
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      for (const l of lists) l.removeEventListener('change', sync);
    };
  }

  /** Enter / jump / fire: finish the typewriter, then advance whatever is on screen. */
  primary(): void {
    const s = this.screen;
    if (s === 'cine') this.typeOrNext(() => this.nextCine());
    else if (s === 'dialogue') this.typeOrNext(() => this.nextLine());
    else if (s === 'ending') this.typeOrNext(() => this.nextEnd());
    else if (s === 'credits') this.pressCredits();
    else if (s === 'stinger') this.pressStinger();
    else if (s === 'title' || s === 'pause' || s === 'card') {
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
    this.played = 0;
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
    this.ui.toast('Find Billy. Start at the Crater Fields, along the path to the east.');
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
    if (writeProgress(this.store, captureProgress(this.sim, Math.floor(this.played)))) {
      this.hasSave = true;
    }
    this.syncUi();
  }

  /** Continues from the most recent save, whichever slot it is in. */
  continueGame(): void {
    const id = newestSlot(this.store);
    if (id === null) {
      this.ui.toast('No save on this device yet');
      return;
    }
    this.loadSlot(id);
  }

  /** Loads a slot and goes to the map. Returns false when the slot is empty or unreadable. */
  private loadSlot(id: SlotId): boolean {
    const save = readSlot(this.store, id);
    if (!save) {
      this.ui.toast('That slot is empty');
      return false;
    }
    this.sim.x.game_new();
    applyProgress(this.sim, save.progress);
    this.played = save.progress.played;
    this.sub = null;
    this.subStack = [];
    this.enterMap();
    this.ui.toast(`Loaded ${slotName(id)}`);
    return true;
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
    this.startCredits();
  }

  // ---------- Credits and stinger ----------

  private startCredits(): void {
    const content = EPISODE.credits;
    this.roll = new CreditsRoll({
      reduced: this.reducedMotion,
      pages: creditsPageCount(content),
    });
    this.rollViewport = 0;
    this.screen = 'credits';
    this.syncUi();
    this.layoutCredits();
  }

  /** Measures the rendered credits and hands the geometry to the roll. */
  private layoutCredits(): void {
    const m = this.ui.creditsMetrics();
    if (!m || !this.roll) return;
    this.rollViewport = m.viewport;
    this.roll.layout(m.viewport, m.total);
  }

  private tickCredits(dt: number): void {
    const roll = this.roll;
    if (!roll) return;
    if (!roll.reduced && this.ui.creditsMetrics()?.viewport !== this.rollViewport) {
      this.layoutCredits();
    }
    const wasHeld = roll.held;
    roll.tick(dt);
    this.showCredits();
    if (roll.held !== wasHeld) this.syncUi();
  }

  private showCredits(): void {
    const roll = this.roll;
    if (!roll) return;
    this.ui.showCredits({
      content: EPISODE.credits,
      reduced: roll.reduced,
      page: roll.page,
      held: roll.held,
      fast: roll.sped,
      offset: roll.offset,
    });
  }

  private pressCredits(): void {
    if (!this.roll) return;
    if (this.roll.press() === 'finish') this.finishCredits();
    else this.showCredits();
  }

  /** Leaves the credits for the stinger when the episode has one (or previews one), else the card. */
  private finishCredits(): void {
    this.roll = null;
    const stinger = EPISODE.stinger ?? (this.previewStinger ? MORTIMER_STINGER : null);
    if (stinger) this.startStinger(stinger);
    else this.showScoreCard();
  }

  private startStinger(content: StingerContent): void {
    this.scene = new StingerScene(content);
    this.stingerGrid = defineSprites().find((d) => d.name === content.sprite)?.grid ?? null;
    this.screen = 'stinger';
    this.syncUi();
  }

  private tickStinger(dt: number): void {
    const scene = this.scene;
    if (!scene) return;
    if (scene.tick(dt)) this.audio.caption(scene.content.caption);
    this.showStinger();
  }

  private showStinger(): void {
    const scene = this.scene;
    if (!scene) return;
    const text = scene.content.text;
    this.ui.showStinger(
      {
        content: scene.content,
        phase: scene.phase,
        shown: text.slice(0, scene.typed),
        hidden: text.slice(scene.typed),
        done: scene.done,
        caption: this.opts.captions,
      },
      this.stingerGrid ?? undefined,
    );
  }

  private pressStinger(): void {
    if (this.scene?.press() === 'finish') this.finishStinger();
  }

  private finishStinger(): void {
    this.scene = null;
    this.showScoreCard();
  }

  /** Esc, Start or the Skip control: leaves the credits or the stinger straight away. */
  skipEnding(): void {
    if (this.screen === 'credits') this.finishCredits();
    else if (this.screen === 'stinger') this.finishStinger();
  }

  private showScoreCard(): void {
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

  /** The slot F5 saves to: the newest manual slot, or Slot 1 when none has been used. */
  private quickSlot(): SlotId {
    let best: { id: SlotId; at: number } | null = null;
    for (const { id, save } of readSlots(this.store)) {
      if (id !== 'auto' && save && (!best || save.at >= best.at)) best = { id, at: save.at };
    }
    return best?.id ?? 1;
  }

  /** Writes the current progress to a manual slot and says where it went. */
  private saveToSlot(id: SlotId): boolean {
    const ok = writeSlot(this.store, id, captureProgress(this.sim, Math.floor(this.played)));
    this.hasSave ||= ok;
    this.ui.toast(ok ? `Saved to ${slotName(id)}` : "Couldn't save: storage is full or blocked");
    return ok;
  }

  private quickSave(): void {
    if (this.screen !== 'play' && this.screen !== 'pause') return;
    this.saveToSlot(this.quickSlot());
  }

  private quickLoad(): void {
    if (this.screen !== 'play' && this.screen !== 'pause') return;
    if (newestSlot(this.store) === null) this.ui.toast('No save yet. Press F5 to make one.');
    else this.continueGame();
  }

  /** A slot chosen on the saves screen: save into it, or load it. */
  private pickSlot(id: SlotId): void {
    if (this.saveMode === 'save') {
      if (id === 'auto') return;
      if (this.saveToSlot(id)) {
        this.refreshSlots();
        this.closeSub();
      }
      return;
    }
    this.loadSlot(id);
  }

  private quitToTitle(): void {
    window.clearTimeout(this.completeTimer);
    window.clearTimeout(this.titleAction);
    this.titleAction = 0;
    this.loadAttract(0);
    this.screen = 'title';
    this.card = null;
    this.sub = null;
    this.subStack = [];
    this.prompt = null;
    this.bossHp = null;
    this.hasSave = newestSlot(this.store) !== null;
    this.menuIdx = this.hasSave ? 1 : 0;
    this.stepper.reset();
    this.syncUi();
  }

  // ---------- Overlay + music sync ----------

  private syncUi(): void {
    const s = this.screen;
    const ui = this.ui;
    // The pause and card screens fill the viewport with a left-aligned column, so the HUD steps aside.
    const hudScreens: Screen[] = ['play', 'dialogue'];
    ui.setHud(hudScreens.includes(s) ? this.hud : null);
    ui.setBoss(this.bossHp !== null && this.bossHp > 0 && s === 'play' ? this.bossHp : null);
    ui.setPrompt(s === 'play' ? this.prompt : null);
    ui.allowPanel(!this.touchMode && (s === 'play' || s === 'title'));
    if (s !== 'credits') ui.showCredits(null);
    else this.showCredits();
    if (s !== 'stinger') ui.showStinger(null);
    else this.showStinger();

    // Before the menus are drawn, so they are laid out around the controls this screen shows.
    this.syncTouch();
    const items = this.menuItems();
    const sel = Math.min(this.menuIdx, Math.max(0, items.length - 1));
    const onTitle = s === 'title';
    const over = this.sub === 'options' || this.sub === 'saves' || this.sub === 'touch';
    ui.showTitle(onTitle && !this.sub ? items : null, sel, onTitle && this.sub === 'controls');
    const editing = this.sub === 'touchEdit' && (onTitle || s === 'pause');
    ui.setBack(this.touchMode && !!this.sub && !editing && (onTitle || s === 'pause'));
    ui.showTouchEditor(editing ? { armed: resetArmed(this.resetAt, performance.now()) } : null);
    if (onTitle && this.sub === 'controls') ui.showTitle(null, 0, true);
    if (editing) {
      ui.showOverlay(null);
    } else if (over && (onTitle || s === 'pause')) {
      const saves = this.sub === 'saves';
      ui.showOverlay({
        title: saves
          ? this.saveMode === 'save'
            ? 'Save game'
            : 'Load game'
          : this.sub === 'touch'
            ? 'Touch controls'
            : 'Options',
        text: '',
        items,
        sel,
        screen: saves ? 'saves' : 'options',
        side: true,
      });
    } else {
      ui.showOverlay(
        s === 'pause'
          ? { title: 'Paused', text: '', note: PAUSE_NOTE, items, sel, screen: 'pause' }
          : s === 'card' && this.card
            ? { title: this.card.title, text: this.card.text, items, sel, screen: 'list' }
            : null,
      );
    }

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
    this.syncMix();
    this.updateMusic();
    this.syncBack();
    this.updateRoom();
  }

  /** Moves the sound to the room of the screen or level it is now on (Enhanced; Classic only remembers it). */
  private updateRoom(force = false): void {
    const mode = this.sim.x.mode();
    const level = this.sim.get(State.LEVEL_ID);
    const name = this.labRoom ?? roomFor(this.screen, mode, level);
    if (name === this.roomName && !force) return;
    this.roomName = name;
    this.audio.setRoom(roomProfile(name, this.coarseSpeaker));
  }

  /** Tells the audio how the music should be heard on this screen (muffled on pause, ducked under speech). */
  private syncMix(): void {
    this.audio.setMix(
      this.labMix ? { ...MIX[this.labMix] } : mixFor(this.screen, this.sub, this.coarseSpeaker),
    );
  }

  private musicFor(): string | null {
    const s = this.screen;
    if (s === 'title' || s === 'loading') return 'title';
    if (s === 'cine') return CINE_TRACK[this.cineIdx] ?? 'cine';
    if (s === 'ending' || s === 'credits') return 'ending';
    if (s === 'stinger') return null;
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
    if (this.labMusic) return;
    const t = this.musicFor();
    if (t !== null || this.screen !== 'pause') this.audio.playMusic(t);
  }

  // ---------- Debug hooks (only exposed with ?debug) ----------

  /** Test hook: jumps straight into the credits, as if the ending panels had just finished. */
  debugStartCredits(): void {
    this.sim.x.game_new();
    this.sim.x.enter_none();
    this.startCredits();
  }

  /** Test hook: jumps straight into a level. */
  debugEnterLevel(id: number): void {
    if (!LEVELS[id]) return;
    this.sim.x.game_new();
    this.sim.x.enter_level(id);
    this.handleEvents();
  }

  /**
   * Test hook: reads (and, given a mode, sets) the audio mode, so Classic and Enhanced can be
   * compared by ear on a phone. `emitters` counts the sounds placed since the page loaded, and
   * `room` is the room the sound is in (see `audio/rooms.ts`).
   */
  debugAudio(mode?: AudioMode): {
    room: RoomName;
    mode: AudioMode;
    forced: boolean;
    backend: string;
    emitters: number;
    masterBuilt: boolean;
    ctxState: string;
    mix: { lpf: number; gain: number; applied: boolean };
  } {
    if (mode) this.audio.setMode(mode);
    return {
      room: this.roomName,
      mode: this.audio.mode,
      forced: this.audioForced,
      backend: this.audio.backend,
      emitters: this.audio.emitters,
      masterBuilt: this.audio.masterBuilt,
      ctxState: this.audio.ctxState,
      mix: this.audio.mixState,
    };
  }

  /**
   * Test hook: tunes the Enhanced sound live, so it can be set by ear on a phone or headphones. Any
   * part of `MASTER` (`master`), `FIELD` (`field`) and `PART_PAN` (`partPan`) can change, for example
   * `__lf.debugAudioTune({ master: { trim: 0.7, comp: { ratio: 3 } }, partPan: { bell: 0.2 } })`.
   * `mix` changes the mix states by name (`open`, `pause`, `pauseCoarse`, `card`, `dialogue`, `cine`),
   * for example `{ mix: { pause: { lpf: 700, gain: 0.6 } } }`; the current screen takes the change
   * at once. `rooms` changes a room by name, for example `{ rooms: { cave: { sfxSend: 0.15, seconds: 2.2 } } }`.
   * Returns which values were set and which were refused. See `AudioTune`.
   */
  debugAudioTune(tune: AudioTune): TuneReport {
    const report = this.audio.tune(tune, ROOMS);
    if (tune.mix) this.syncMix();
    if (tune.rooms) this.updateRoom(true);
    return report;
  }

  /**
   * Test hook: adds the sound lab (a "Lab" button and its overlay) and opens it if asked, for
   * `?debug` and `?debug&lab`. Auditioning never touches the saved options: it plays through the
   * audio directly and holds a room, a mix state or a track only until "Follow" is chosen again.
   */
  debugLab(open = false): void {
    if (!this.lab) {
      this.lab = new SoundLab({
        sfx: labItems(Object.keys(SFX)),
        music: labItems(Object.keys(MUSIC)),
        rooms: labItems(Object.keys(ROOMS)),
        mixes: labItems(Object.keys(MIX)),
        playSfx: (name, at) => this.audio.play(name, at),
        playMusic: (name) => {
          this.labMusic = true;
          this.audio.playMusic(name, true);
        },
        followGame: () => {
          this.labMusic = false;
          this.updateMusic();
        },
        mode: () => this.audio.mode,
        setMode: (m) => this.audio.setMode(m),
        room: () => ({ held: this.labRoom, current: this.roomName }),
        setRoom: (name) => {
          this.labRoom = name as RoomName | null;
          this.updateRoom(true);
        },
        mix: () => ({
          held: this.labMix,
          current: mixNameFor(this.screen, this.coarseSpeaker),
        }),
        setMix: (name) => {
          this.labMix = name as MixName | null;
          this.syncMix();
        },
        tune: (patch) => void this.debugAudioTune(patch),
        state: () => captureState(),
        status: () => {
          const a = this.audio;
          const ctx = a.ctxState === 'none' ? 'tap anywhere to start audio' : a.ctxState;
          const off = [
            a.music ? '' : 'music is off in Options',
            a.sfx ? '' : 'sound is off in Options',
          ];
          return [ctx, a.mode, ...off].filter(Boolean).join(' · ');
        },
        copy: async (text) => {
          try {
            await navigator.clipboard.writeText(text);
            return true;
          } catch {
            return false;
          }
        },
      });
      this.ui.mount(this.lab.button, this.lab.root);
    }
    if (open) this.lab.open();
  }

  /** Test hook: what haptics last played, what each compiled to, and what the backend can do. */
  debugHaptics(): ReturnType<GameHaptics['report']> {
    return this.haptics.report();
  }

  /** Test hook: changes haptic cues, compiler constants or the budget; returns what was applied and refused. */
  debugHapticsTune(patch: unknown): ReturnType<GameHaptics['tune']> {
    return this.haptics.tune(patch);
  }

  /** Test hook: switches the phone title between its two layouts. */
  debugTitle(mode: TitleLayout): void {
    this.ui.setTitleLayout(mode);
  }

  /** Test hook: opens a screen directly, so layout checks can visit each one. */
  debugShow(
    what:
      | 'title'
      | 'controls'
      | 'options'
      | 'touch'
      | 'touchEdit'
      | 'saves'
      | 'play'
      | 'map'
      | 'pause'
      | 'card'
      | 'cine'
      | 'dialogue'
      | 'credits',
  ): void {
    if (what === 'credits') return this.debugStartCredits();
    if (what === 'card') {
      // The level-cleared card, as it appears over Crater Fields.
      this.debugEnterLevel(0);
      return this.showCard({
        title: `${LEVELS[0]?.name ?? 'Level'} cleared`,
        text: LEVELS[0]?.cleared ?? '',
        primaryLabel: 'Back to the map',
        primary: () => this.enterMap(),
      });
    }
    if (what === 'map') {
      this.sim.x.game_new();
      this.sim.x.enter_map();
      this.handleEvents();
      this.screen = 'play';
      return this.syncUi();
    }
    if (what === 'play') {
      // Entering the level raises LEVEL_START, which switches to the play screen.
      this.debugEnterLevel(0);
      return this.syncUi();
    }
    if (what === 'cine') return this.newGame();
    if (what === 'pause' || what === 'dialogue') {
      this.debugEnterLevel(0);
      this.screen = what;
      if (what === 'dialogue') {
        this.dlg = DIALOGUE.bossIntro;
        this.dlgId = 'bossIntro';
        this.dlgI = 0;
        this.typed = 1e6;
      }
      this.menuIdx = 0;
      return this.syncUi();
    }
    this.quitToTitle();
    if (what === 'touch' || what === 'touchEdit') {
      // Title, then Options on its Touch controls row, then the screen, as a player gets there.
      this.touchCapable = true;
      this.openSub('options');
      this.menuIdx = Game.OPTION_ROWS.length;
      this.openSub('touch');
      if (what === 'touchEdit') {
        this.menuIdx = Math.max(0, this.touchRowList.indexOf('move'));
        this.openSub('touchEdit');
      }
      return;
    }
    if (what === 'saves') return this.openSaves('load');
    this.sub = what === 'title' ? null : what;
    this.syncUi();
  }

  /** Test hook: how the view is drawn (the pixel scale, tile count, canvas and device sizes). */
  get debugView(): Record<string, unknown> {
    const r = this.renderer;
    return {
      sharp: this.pixelScale > 0,
      scale: this.pixelScale,
      tiles: this.halfH * 2,
      k: r.divisor,
      pixelGrid: r.pixelGrid,
      budgeted: r.budgeted,
      dpr: r.dpr,
      deviceW: r.deviceWidth,
      deviceH: r.deviceHeight,
      canvasW: r.canvasWidth,
      canvasH: r.canvasHeight,
      cssW: r.width,
      cssH: r.height,
    };
  }

  /**
   * Test hook: draws a frame and reads a rectangle of the canvas back as RGBA (top row first).
   * Keep the rectangle to a strip; reading a whole large buffer is slow in software GL.
   */
  debugPixels(
    rect: { x: number; y: number; w: number; h: number },
    opts: { lighting?: boolean } = {},
  ): number[] {
    this.flatDraw = opts.lighting === false;
    try {
      this.draw();
      return Array.from(this.renderer.readPixels(rect.x, rect.y, rect.w, rect.h));
    } finally {
      this.flatDraw = false;
    }
  }

  /** Test hook: where the touch controls are placed (null while they are hidden). */
  get debugTouch(): unknown {
    return this.touchUi.placed;
  }

  /** Test hook: the touch settings in use. */
  get debugTouchSettings(): TouchSettings {
    return this.touchSettings;
  }

  get debugState(): Record<string, unknown> {
    return {
      screen: this.screen,
      sub: this.sub,
      menu: this.menuIdx,
      mode: this.sim.x.mode(),
      level: this.sim.get(State.LEVEL_ID),
      score: this.sim.get(State.SCORE),
      lives: this.sim.get(State.LIVES),
      px: this.sim.get(State.PLAYER_X),
      py: this.sim.get(State.PLAYER_Y),
      pogo: this.sim.get(State.POGO_ON),
      ammo: this.sim.get(State.AMMO),
      bits: this.lastBits,
      touch: this.touchMode,
      custom: this.touchUi.placed?.custom ?? false,
      back: { enabled: this.backOn(), armed: this.backGuard.armed },
      instances: this.lastCount,
      atlas: this.atlas.size,
    };
  }
}
