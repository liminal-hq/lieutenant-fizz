// Game shell that wires the sim, renderer, input, audio, UI and screen flow together.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { CreditsRoll, creditsPageCount } from '@lieutenant-fizz/engine/credits';
import { BeatCursor, type BeatScene } from '@lieutenant-fizz/engine/story-beats';
import type { StoryMeasure } from './story-measure';
import { buildAtlas, type Atlas } from '@lieutenant-fizz/engine/atlas';
import { FrameStats } from '@lieutenant-fizz/engine/frame-stats';
import { GameAudio } from '@lieutenant-fizz/engine/audio';
import type { AudioTune, TuneReport } from '@lieutenant-fizz/engine/audio-tune';
import { gamepadBackend, vibrateBackend } from '@lieutenant-fizz/engine/haptic-backends';
import { GameHaptics, onScreen, routeFor } from '@lieutenant-fizz/engine/haptics';
import type { HostBackend } from '@lieutenant-fizz/engine/host';
import { BackGuard } from '@lieutenant-fizz/engine/back-guard';
import {
  webFullscreenBackend,
  type FullscreenBackend,
} from '@lieutenant-fizz/engine/fullscreen-backend';
import type { KeyboardLockLike } from '@lieutenant-fizz/engine/keyboard-lock';
import {
  noKeepAwake,
  webWakeLock,
  type FullscreenResult,
  type KeepAwakeBackend,
} from '@lieutenant-fizz/engine/lifecycle';
import {
  backGuardAllowed,
  chromeHidden,
  detectCaps,
  fullscreenButton,
  isInstalled,
  isAppHost,
  isIdle,
  lifecyclePolicy,
  onGesture,
  pauseFor,
  type Caps,
  type FullscreenScreen,
  type Gesture,
  type GesturePlan,
  type Host,
  type Want,
} from '@lieutenant-fizz/engine/lifecycle-policy';
import { placeSound, type AudioMode } from '@lieutenant-fizz/engine/sound-field';
import { StingerScene, type StingerContent } from '@lieutenant-fizz/engine/stinger';
import {
  durable,
  type FlushableStorage,
  type KeyValueStorage,
  type StorageKind,
} from '@lieutenant-fizz/engine/storage';
import {
  Input as Bits,
  InputManager,
  type Command,
  type InputDevice,
} from '@lieutenant-fizz/engine/input';
import { FixedStepper, InstanceWriter } from '@lieutenant-fizz/engine/instances';
import type { Grid } from '@lieutenant-fizz/engine/pen';
import { InstancedRenderer } from '@lieutenant-fizz/engine/renderer';
import { frameView, type FrameView, type PixelMode } from '@lieutenant-fizz/engine/view-scale';
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
import { MIX, mixFor, mixNameFor, type MixName } from './audio/mix';
import { MUSIC, PATTERNS, SFX } from './audio/patterns';
import { ROOMS, roomFor, roomProfile, type RoomName } from './audio/rooms';
import { FIZZ_HAPTICS } from './haptics/fizz-haptics';
import { attractFade, attractLabel, nextAttract } from './attract';
import { backAction, backEnabled, escAction, pauseAction } from './back';
import { CURSOR_UI_SELECTOR, cursorHidden } from './cursor';
import { gestureFor, isLive } from './lifecycle-rules';
import { Cinematic, CINE_TALL } from './cine';
import { viewPoint } from './map-panel';
import { isPortrait, watchResize, type TouchGutters } from './layout';
import { FullscreenControl, glyphGrid, type FullscreenPlace } from './fullscreen-button';
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
import { densityRow } from './menu-density';
import {
  displayItems,
  displayLinkValue,
  displayRowOf,
  displayRows,
  displayShown,
  effectiveFullscreen,
  effectiveWake,
  isDisplayStepRow,
  stepDisplay,
  type DisplayCaps,
  type DisplayRow,
} from './display-options';
import {
  effectiveScale,
  hapticsFeel,
  hapticsItems,
  hapticsLinkValue,
  hapticsRowOf,
  hapticsRows,
  hapticsSettings,
  isHapticsStepRow,
  resetHaptics,
  stepHaptics,
  type HapticsRow,
  type HapticsSettings,
} from './haptics-options';
import {
  isStepRow,
  resetTouch,
  stepTouch,
  touchItems,
  touchRowOf,
  touchRows,
  type TouchRow,
} from './touch-options';
import {
  effectiveAudio,
  isSoundStepRow,
  PREVIEW_DELAY_MS,
  resetSound,
  soundItems,
  soundPreview,
  soundRowOf,
  soundRows,
  stepSound,
  styleName,
  type SoundRow,
} from './sound-options';
import {
  QUIT_GAME_ID,
  QUIT_LAUNCHER_ID,
  closeApp,
  withQuitRows,
  type QuitCapabilities,
} from './quit';
import { RESET_ARM_MS, resetArmed } from './two-tap';
import { firstEnabled, type HapticsUrl, type UrlLocks, type WakeUrl } from './url-lock';
import {
  applyProgress,
  captureProgress,
  confirmWrite,
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
import type { HapticsLab } from './ui/haptics-lab';
import type { LabId, LabShell } from './ui/lab-shell';
import type { SoundLab } from './ui/sound-lab';
import { Ev, Mode, Out, RenderFlag, State, STEP, Table } from './sim/protocol';
import { Sim } from './sim/sim';
import { defineSprites } from './sprites/catalog';
import {
  CINE,
  CINE_TRACK,
  DIALOGUE,
  END,
  LEVELS,
  LIFTOFF_BEAT,
  SAUCER_ID,
  SIGNS,
  type Line,
} from './story';
import { MORTIMER_STINGER } from './stinger';
import { BEN_LOOK, BEN_WAVE, benFrame, benScale, type BenPose } from './titleBen';
import {
  Ui,
  type HudState,
  type MapAnchor,
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
   * `sharp` draws at a whole pixel scale and `soft` keeps the fractional scale. `fast` shows the
   * Sharp view with one canvas pixel per sprite pixel, which the browser scales up. Left out, touch
   * devices (and `touch`) are Sharp and everything else is Soft.
   */
  pixels?: PixelMode;
  /**
   * `classic` is the sound as it has always been; `enhanced` places sound effects in the stereo
   * field by where they happen on screen. Left out, the game plays `AUDIO_DEFAULT` (Enhanced).
   */
  audio?: AudioMode;
  /** `split` tries the phone title with the logo and the menu on opposite sides; the default is one column. */
  title?: TitleLayout;
  /** Takes the browser's Back button in an ordinary tab too (`?back`), to try it without fullscreen. */
  back?: boolean;
  /**
   * `on` (`?haptics`, bare or `=on`) forces haptics on at the saved strength, `off` (`?haptics=off`)
   * forces them off. Left out, the Haptics screen decides. Either way the link is never saved.
   */
  haptics?: HapticsUrl;
  /**
   * Fullscreen: `on` (`?fullscreen`) asks for it on every device when a run starts or resumes, `off` never does.
   * Left out, it is Auto: touch devices only.
   */
  fullscreen?: Want;
  /** `app` (`?debug&host=app`) pretends to be the native app, where the web fullscreen and Back guard step aside. */
  host?: Host;
  /** `off` (`?wake=off`) never keeps the screen on, `on` (`?wake`) does while playing or watching; the default is on. */
  wake?: 'on' | 'off';
  /** What keeps the screen on in the app, given by the app; the web build uses the browser's wake lock. */
  keepAwake?: KeepAwakeBackend;
  /** What enters and leaves fullscreen and says whether Esc reaches the page; the web build uses the browser's. */
  fullscreenBackend?: FullscreenBackend;
  /** What the host can do beyond the page: `quit` (the desktop app) adds Quit game and `quitToLauncher` (the desktop and Android apps) adds Quit to launcher, both to the title and pause menus. */
  hostBackend?: HostBackend;
  /** Where saves and settings are kept, chosen at boot by `createStorage`; left out, the browser's `localStorage`. */
  storage?: KeyValueStorage;
}

/** The `display-mode` values an installed app runs in. */
const INSTALLED_MODES = ['standalone', 'fullscreen', 'minimal-ui'];

/** How the canvas is drawn: decided once at boot and kept for the session. */
function pixelMode(options: GameOptions): PixelMode {
  if (options.pixels) return options.pixels;
  if (options.touch) return 'sharp';
  try {
    return window.matchMedia('(pointer: coarse)').matches ? 'sharp' : 'soft';
  } catch {
    return 'soft';
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
/** Ben's body on the map is this many world units across (`Body::new(x, y, 0.6, 0.6)` in the game crate). */
const BEN_BODY = 0.6;

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
  /** Fullscreen as it stands: the link, else the saved choice (Auto on touch devices, when a run starts or resumes). */
  private get fullscreenWant(): Want {
    return effectiveFullscreen(this.fullscreenUrl, this.settings);
  }

  /** Whether the screen is kept on while playing: the link, else the saved choice. */
  private get wakeWant(): WakeUrl {
    return effectiveWake(this.wakeUrl, this.settings);
  }

  /** What this page can do for fullscreen and orientation, and whether it is the native app. */
  private readonly caps: Caps;
  /** What `?fullscreen` and `?wake` asked for, which win over the saved settings and are never saved. */
  private readonly fullscreenUrl: Want | undefined;
  private readonly wakeUrl: WakeUrl | undefined;
  /** Keeps the screen on while `lifecyclePolicy` asks for it. */
  private readonly keepAwake: KeepAwakeBackend;
  /** Whether the screen is being kept on (what the policy last asked for). */
  private awake = false;
  /** When the last input came, and whether that is long enough ago to let the screen go. */
  private idleAt = performance.now();
  private idle = false;
  /** How the last fullscreen request went, and the pixel scale around it (for trying it on a phone). */
  private lastFs: FullscreenResult | null = null;
  /** The Fullscreen button: a pill in the top-right corner, and the `F` key does the same. */
  private readonly fsControl: FullscreenControl;
  private scaleBefore: number | null = null;
  private scaleAfter: number | null = null;
  /** Fullscreen as the shell sees it: the browser's, with Esc held by the Keyboard Lock; the app can inject its own. */
  private readonly fs: FullscreenBackend;
  /** The host's extras: Quit game exists when it has `quit`. */
  private readonly hostBackend: HostBackend | undefined;
  /** The Touch controls rows. */
  private readonly touchRowList: TouchRow[] = touchRows();
  /** What `?haptics` asked for, which wins over the saved strength and is never saved. */
  private readonly hapticsUrl: HapticsUrl | undefined;
  /**
   * Whether a pad with a vibration actuator has been seen this session. It only ever turns on, so the
   * Rumble row never shifts the Haptics screen while it is open.
   */
  private padSeen = false;
  /** The Tauri haptics plugin reported a vibrator and is the phone's backend. */
  private pluginVibrator = false;
  /** When Reset had its first tap (in `performance.now()` milliseconds), or null. */
  private resetAt: number | null = null;
  /** Which quit row the armed confirm belongs to (Quit to launcher or Quit game). */
  private quitArmedId: string | null = null;
  /** The screen and sub-screen that Reset (or Quit game) was armed on: leaving them disarms it. */
  private resetWhere = '';
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
  /** The mode `?audio=` chose, which wins over the saved Style and is never saved. */
  private readonly audioUrl: AudioMode | undefined;
  /** The Sound screen's rows. */
  private readonly soundRowList: SoundRow[] = soundRows();
  /** The pending Sound preview (one timer for the wait, one per sound after it). */
  private previewTimers: number[] = [];
  /** The room the sound is in, and whether the speaker is a phone's (shorter rooms, lower sends). */
  private roomName: RoomName = 'neutral';
  /** What the sound lab holds in place of the game's choice; null follows the game. */
  private labRoom: RoomName | null = null;
  private labMix: MixName | null = null;
  private labMusic = false;
  /** The Lab button and the switch between the labs; null while neither lab is wanted. */
  private labShell: LabShell | null = null;
  private soundLab: SoundLab | null = null;
  private hapticsLab: HapticsLab | null = null;
  /** `?debug` was given, so both labs are there whatever the Sound lab and Haptics lab options say. */
  private labForced = false;
  /** The shell is loading, and which lab to open when it is ready. */
  private labLoading = false;
  private labOpenWhenReady: LabId | null = null;
  private coarseSpeaker = false;
  private readonly haptics: GameHaptics;
  /** Whether pogo was on last frame, so a toggle can be felt (it raises no event). */
  private pogoOn = false;
  private readonly ui: Ui;
  private readonly cine = new Cinematic();
  private readonly writer: InstanceWriter;
  private readonly stepper = new FixedStepper(STEP);
  /** Where saves and settings go; null when nothing durable is available, so saving reports a failure. */
  private readonly store: KeyValueStorage | null;
  /** Which backend `store` came from (`memory` when the game runs without durable storage). */
  private readonly storageKind: StorageKind;
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
  /** When the mouse last moved (the clock of `frame`), whether it was over the overlay controls, and whether the cursor is hidden. */
  private mouseMovedAt = Number.NEGATIVE_INFINITY;
  private mouseOverUi = false;
  private cursorIsHidden = false;
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
  /** Frame-time statistics, kept only under `?debug` (null otherwise, so a normal run does nothing). */
  private perf: FrameStats | null = null;
  private lastBits = 0;
  /** The scene and beat of the opening cinematic or the ending, whichever is showing. */
  private readonly story = new BeatCursor(CINE);
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
    const storage = options.storage ?? safeStorage();
    this.store = durable(storage);
    this.storageKind = storage?.kind ?? 'memory';
    this.reducedForced = options.reducedMotion;
    this.sim = sim;
    this.atlas = atlas;
    this.ui = ui;
    this.renderer = renderer;
    this.input = new InputManager(ui.stage);
    this.forcedTouch = options.touch ?? false;
    this.forcedBack = options.back ?? false;
    this.fullscreenUrl = options.fullscreen;
    this.caps = detectCaps({
      doc: document,
      orientation: screen.orientation,
      nav: navigator as Navigator & { standalone?: boolean },
      isSecureContext: window.isSecureContext,
      matchMedia: window.matchMedia?.bind(window),
      host: options.host ?? (isAppHost(window) ? 'app' : 'web'),
    });
    this.fsControl = new FullscreenControl({
      press: () => this.toggleFullscreen(),
      glyphUrl: (g) => ui.spriteUrl(glyphGrid(g)),
    });
    ui.mount(this.fsControl.el);
    this.fs =
      options.fullscreenBackend ??
      webFullscreenBackend({
        doc: document,
        orientation: screen.orientation,
        keyboard: (navigator as Navigator & { keyboard?: KeyboardLockLike }).keyboard,
        secure: window.isSecureContext,
        touch: () => this.touchCapable,
      });
    this.hostBackend = options.hostBackend;
    this.wakeUrl = options.wake;
    this.keepAwake =
      this.caps.host === 'app'
        ? (options.keepAwake ?? noKeepAwake)
        : this.caps.wakeLock
          ? webWakeLock(navigator, document)
          : noKeepAwake;
    this.touchSettings = readTouchSettings(this.store);
    this.touchUi = new TouchControls(ui.touchLayer, this.input, {
      labels: { dpad: 'Move', jump: 'Jump', pogo: 'Pogo', fire: 'Fizz', pause: 'Pause' },
      editLabels: { dpad: 'Move D-pad' },
      spec: touchSpec(this.touchSettings, undefined, this.chromeless()),
    });
    ui.setTouchOpacity(this.touchSettings.opacity);
    // The app's WebView allows autoplay, so its audio starts at boot; the web waits for a gesture.
    this.audio = new GameAudio({ ...PATTERNS, mix: MIX }, undefined, {
      unlockAtBoot: isAppHost(window),
    });
    this.audioForced = options.audio !== undefined;
    this.audioUrl = options.audio;
    this.coarseSpeaker = !!window.matchMedia?.('(pointer: coarse)').matches;
    this.hapticsUrl = options.haptics;
    this.haptics = new GameHaptics(FIZZ_HAPTICS, performance);
    this.haptics.setBackends({
      device: vibrateBackend(navigator),
      controller: gamepadBackend(() => this.input.activePad()),
    });
    // Inside the app the plugin's vibrator (amplitudes, primitives, envelopes) replaces `navigator.vibrate`
    // once it reports one. The web never creates it, and never downloads its compiler: it is its own chunk,
    // imported only here. Until it has loaded and adopted, cues take the `navigator.vibrate` backend above.
    if (isAppHost(window)) {
      void import('@lieutenant-fizz/engine/haptic-plugin')
        .then(({ adoptPlugin, pluginBackend }) => {
          const plugin = pluginBackend();
          if (this.disposed) {
            plugin.dispose();
            return false;
          }
          return adoptPlugin(this.haptics, plugin, true);
        })
        .then((adopted) => {
          if (adopted) this.keepRow(() => (this.pluginVibrator = true));
        })
        .catch(() => {});
    }
    this.haptics.setRoute(routeFor(this.input.device));
    this.input.onDevice((d) => this.haptics.setRoute(routeFor(d)));
    this.settings = readOptions(this.store);
    this.applySettings();
    this.input.onDevice(() => this.syncHints());
    // Touch mode follows the device in use: a touch turns it on, a key or a gamepad turns it off.
    this.input.onDevice((d) => this.setTouchMode(this.forcedTouch || d === 'touch'));
    window.addEventListener('pointerdown', this.onTouchPointer, { capture: true, passive: true });
    ui.stage.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onMouseMove);
    this.unwatchViewport = watchResize(() => this.onViewport());
    this.touchCapable = this.forcedTouch || !!window.matchMedia?.('(pointer: coarse)').matches;
    if (this.touchCapable) this.input.noteTouch();
    this.applyHaptics();
    if (this.forcedTouch) this.setTouchMode(true);
    this.writer = new InstanceWriter(sim.instanceBuffer, atlas.rects);
    this.captionNames = sim.names(Table.CAPTIONS);
    this.toastNames = sim.names(Table.TOASTS);
    this.input.onCommand((c) => this.onCommand(c));
    this.input.onPadLost(() => {
      if (pauseFor('padLost', { playing: this.screen === 'play' })) this.autoPause();
    });
    window.addEventListener('blur', this.onBlur);
    if (this.fs.kind === 'native') window.addEventListener('keydown', this.onNativeKey);
    for (const t of ['keydown', 'pointerdown', 'touchstart'] as const) {
      window.addEventListener(t, this.onInputEvent, { capture: true, passive: true });
    }
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
      storyLayout: () => game?.repackStory(),
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
      const renderer = new InstancedRenderer(ui.gl, atlas, pixelMode(options));
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
    this.startFullscreen();
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
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onNativeKey);
    for (const t of ['keydown', 'pointerdown', 'touchstart'] as const) {
      window.removeEventListener(t, this.onInputEvent, { capture: true });
    }
    this.keepAwake.dispose();
    this.fsControl.dispose();
    window.removeEventListener('pointerdown', this.onTouchPointer, { capture: true });
    this.ui.stage.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onMouseMove);
    this.unwatchViewport();
    this.unwatchBack();
    this.fs.dispose();
    this.backGuard.dispose();
    this.touchUi.dispose();
    window.clearTimeout(this.titleAction);
    window.clearTimeout(this.resetTimer);
    this.cancelPreview();
    this.input.dispose();
    this.audio.dispose();
    this.haptics.dispose();
    this.ui.dispose();
    this.renderer.dispose();
  }

  // ---------- Frame ----------

  private frame(t: number): void {
    this.perf?.frame(t);
    const dt = Math.max(0, (t - this.last) / 1000);
    this.last = t;
    const sim = this.sim;
    const screen = this.screen;

    const hide = cursorHidden(screen, t - this.mouseMovedAt, this.mouseOverUi ? 'ui' : 'game');
    if (hide !== this.cursorIsHidden) {
      this.cursorIsHidden = hide;
      if (hide) this.ui.stage.dataset.cursor = 'hidden';
      else delete this.ui.stage.dataset.cursor;
    }

    const mode = sim.x.mode();
    const tall = screen === 'cine' ? TALL.cine : mode === Mode.MAP ? TALL.map : TALL.level;
    const r = this.renderer;
    // Fast picks its backing from the screen's target, so tell the renderer before the view is read.
    r.setTarget(tall);
    const k = this.viewKey;
    const sharp = (r.pixelGrid ? 1 : 0) + (r.fast ? 2 : 0);
    if (
      k[0] !== r.canvasWidth ||
      k[1] !== r.canvasHeight ||
      k[2] !== r.canvasCssW ||
      k[3] !== r.canvasCssH ||
      k[4] !== tall ||
      k[5] !== this.zoom ||
      k[6] !== sharp
    ) {
      k[0] = r.canvasWidth;
      k[1] = r.canvasHeight;
      k[2] = r.canvasCssW;
      k[3] = r.canvasCssH;
      k[4] = tall;
      k[5] = this.zoom;
      k[6] = sharp;
      frameView(this.view, {
        cssW: r.canvasCssW,
        cssH: r.canvasCssH,
        devW: r.canvasWidth,
        devH: r.canvasHeight,
        target: tall,
        zoom: this.zoom,
        sharp: r.pixelGrid,
        minScale: r.fast ? 1 : 2,
      });
      this.halfW = this.view.halfW;
      this.halfH = this.view.halfH;
      this.pixelScale = this.view.scale;
    }
    sim.x.set_view(this.halfW, this.halfH);

    this.watchPad();
    const bits = this.input.peek();
    this.menuInput(bits);
    this.lastBits = bits;
    // Input from a pad or a held key keeps the idle clock fresh; the screen is let go when it crosses five minutes.
    if (bits !== 0) this.noteInput(t);
    else if (isIdle(t - this.idleAt) !== this.idle) this.syncLifecycle();
    // The sim samples touch presses in play; a menu has no step, so it marks them seen itself.
    if (screen !== 'play') this.input.markTouchSeen();

    // Gameplay haptics follow the level only; the title's attract loop raises captions too and gets its own rule below.
    this.haptics.setGameplay(screen === 'play');
    // The attract loop is felt, quietly, only where it is on show: the bare title, not behind a sub-screen.
    this.haptics.setAttract(screen === 'title' && !this.sub && this.visible);
    if (screen === 'play' || screen === 'title') {
      this.alpha = this.stepper.advance(dt, () => {
        sim.step(screen === 'play' ? this.input.poll() : 0);
      });
      if (screen === 'play') {
        this.levelSeconds += dt;
        this.played += dt;
        // Toggling pogo raises no event, so the lit state is read each frame (it writes on a change only).
        if (this.touchMode) this.touchUi.setLit(sim.get(State.POGO_ON) === 1);
        // Only Ben in a level pogoes: coming back to the map resets the flag without a pogo being toggled.
        const pogo = sim.get(State.POGO_ON) === 1;
        if (pogo !== this.pogoOn && sim.x.mode() === Mode.LEVEL)
          this.haptics.cue(pogo ? 'pogoOn' : 'pogoOff');
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
    this.camDrawn.x = camX;
    this.camDrawn.y = camY;
    if (this.touchMode && this.ui.promptShown) {
      this.ui.dockPrompt(this.benAnchor(camX, camY), this.touchUi.boxes());
    }
  }

  private readonly camDrawn = { x: 0, y: 0 };

  /** Where Ben is on screen on the map (the middle of his body), for the map panel to dock away from him. */
  private benAnchor(camX: number, camY: number): MapAnchor | null {
    if (this.sim.x.mode() !== Mode.MAP) return null;
    const r = this.renderer;
    const ppu = r.pixelsPerUnit(this.halfH);
    // The canvas holds the camera's view, and under Fast it overhangs the host, so measure from its box.
    const { x, y } = viewPoint(
      this.sim.get(State.PLAYER_X) + BEN_BODY / 2,
      this.sim.get(State.PLAYER_Y) + BEN_BODY / 2,
      camX,
      camY,
      ppu,
      r.canvasCssW,
      r.canvasCssH,
    );
    return { x, y, ppu };
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
        this.haptics.cue('levelStart');
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
        this.startStory(END);
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
    // The canvas, not the host, holds the camera's view: under Fast it overhangs the host a little.
    const w = this.renderer.canvasCssW;
    const h = this.renderer.canvasCssH;
    const sx = (x - cam.x) * ppu + w / 2;
    const sy = h / 2 - (y - cam.y) * ppu;
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
      if (
        this.sub === 'options' ||
        this.sub === 'sound' ||
        this.sub === 'haptics' ||
        this.sub === 'display' ||
        this.sub === 'touch'
      ) {
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
        switch (
          c.esc
            ? escAction(this.screen, this.sub, this.fs)
            : pauseAction(this.screen, this.sub, !!c.leave)
        ) {
          case 'exitFullscreen':
            void this.fs.exit();
            break;
          case 'pause':
            this.screen = 'pause';
            this.menuIdx = 0;
            this.syncUi();
            break;
          case 'close':
            this.closeSub();
            break;
          case 'leaveToGame':
            this.leaveSubs();
            this.resume();
            break;
          case 'leaveToTitle':
            this.leaveSubs();
            break;
          case 'resume':
            this.resume();
            break;
          case 'skipCine':
            this.skipCine();
            break;
          case 'skipEnding':
            this.skipEnding();
            break;
          case null:
            break;
        }
        break;
      case 'fullscreen':
        this.toggleFullscreen();
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
    this.audio.setMode(effectiveAudio(this.audioUrl, o));
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
    this.story.setReduced(this.reducedMotion);
    this.haptics.setCalm(this.reducedMotion);
    this.applyHaptics();
    if (before !== this.reducedMotion && this.screen === 'title') this.loadAttract(this.attractIdx);
    this.ui.setTextLarge(o.text === 1);
    this.ui.setMenuRow(densityRow(o.density));
    this.ui.setToggle('music', o.music > 0);
    this.ui.setToggle('sfx', o.sfx > 0);
    this.ui.setToggle('captions', o.captions);
    this.syncHints();
    if (save) writeOptions(this.store, o);
    void this.syncLab();
  }

  /**
   * Puts the haptic strengths to use. The phone's strength is a touch setting and the controller's is an
   * option; `?haptics` overrides both without saving. The phone is left silent where nothing can vibrate
   * (a desktop without a touch screen), unless the link asked for haptics.
   */
  private applyHaptics(): void {
    const url = this.hapticsUrl;
    const phone = this.touchCapable || url === 'on';
    this.haptics.setScale(
      phone ? effectiveScale(url, this.touchSettings.hapticStrength) : 0,
      effectiveScale(url, this.settings.rumble),
    );
  }

  /** The haptics settings, wherever each one is kept. */
  private hapticsNow(): HapticsSettings {
    return hapticsSettings(this.touchSettings, this.settings);
  }

  /** What the address fixes this session. */
  private urlLocks(): UrlLocks {
    return {
      audio: this.audioUrl,
      haptics: this.hapticsUrl,
      fullscreen: this.fullscreenUrl,
      wake: this.wakeUrl,
      debug: this.labForced,
    };
  }

  /**
   * Whether the game can go fullscreen and says so (the Display row, the `F` key and its hint): in a browser page
   * where the browser allows it, or in the desktop app, whose backend is the native window. The button is the web's.
   */
  private fullscreenOffered(): boolean {
    return this.fs.kind === 'native' || (this.caps.fullscreen && this.caps.host === 'web');
  }

  /** Whether the on-screen Fullscreen button exists: a browser page has it, the desktop app hides it and uses `F` and `F11`. */
  private fullscreenButtonOffered(): boolean {
    return this.fs.kind !== 'native' && this.caps.fullscreen && this.caps.host === 'web';
  }

  /** What the Display screen can offer here: fullscreen in a browser page, and anything that can hold the screen on. */
  private displayCaps(): DisplayCaps {
    return {
      fullscreen: this.fullscreenOffered(),
      keepAwake: this.keepAwake.kind !== 'none',
      touch: this.touchCapable,
    };
  }

  /** The rows of the Display screen. */
  private displayRowList(): DisplayRow[] {
    return displayRows(this.displayCaps());
  }

  /** Whether the phone can probably vibrate: the browser has the call and the device has a touch screen. */
  private vibratorLikely(): boolean {
    return (
      this.touchCapable &&
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    );
  }

  /** Whether the Haptics screen has anything to offer: a vibrator, a pad that rumbles, or a link asking for it. */
  private hapticsShown(): boolean {
    return (
      this.vibratorLikely() || this.pluginVibrator || this.padSeen || this.hapticsUrl !== undefined
    );
  }

  /** The rows of the Haptics screen. */
  private hapticsRowList(): HapticsRow[] {
    return hapticsRows({ pad: this.padSeen });
  }

  /**
   * Notes a pad that can rumble the first time one is seen. The Options rows and the Haptics screen gain
   * a row at that moment, so the selection follows the row it was on.
   */
  private watchPad(): void {
    if (this.padSeen || !this.input.activePad()?.vibrationActuator) return;
    this.keepRow(() => (this.padSeen = true));
  }

  /** Runs a change that adds menu rows and keeps the selection on the row it was on. */
  private keepRow(change: () => void): void {
    const id = this.menuItems()[this.menuIdx]?.id;
    change();
    const items = this.menuItems();
    const at = id === undefined ? -1 : items.findIndex((i) => i.id === id);
    if (at >= 0) this.menuIdx = at;
    if (this.sub === 'options' || this.sub === 'haptics') this.syncUi();
  }

  private syncHints(): void {
    const device: InputDevice = this.input.device;
    this.ui.setHintContext({
      device,
      layout: this.settings.layout,
      fullscreen: this.fullscreenOffered(),
      fullscreenButton: this.fullscreenButtonOffered(),
      escExitsFullscreen:
        this.escLeavesFullscreen() && (this.screen === 'title' || this.screen === 'pause'),
    });
  }

  /**
   * Whether Esc reaches the page in fullscreen, so it can leave fullscreen itself: the lock is held and
   * the page is fullscreen. Without the lock the browser takes the key and the page never sees it, so this
   * stays false and Esc keeps its ordinary meaning.
   */
  private escLeavesFullscreen(): boolean {
    return this.fs.isFullscreen() && this.fs.escapeCaptured;
  }

  private readonly onVisibility = (): void => {
    this.visible = document.visibilityState === 'visible';
    this.audio.setActive(this.visible);
    this.haptics.setActive(this.visible);
    if (!this.visible) this.autoPause();
    this.syncLifecycle();
  };

  /** F11 in the desktop app, where nothing else handles it: the same toggle as `F`. */
  private readonly onNativeKey = (e: KeyboardEvent): void => {
    if (e.code !== 'F11' || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    this.toggleFullscreen();
  };

  /** The window lost focus (alt-tab, a notification shade, a system dialog): a level in play pauses. */
  private readonly onBlur = (): void => {
    if (pauseFor('blur', { playing: this.screen === 'play' })) this.autoPause();
  };

  /** A key, mouse or touch press counts as input for the idle clock. */
  private readonly onInputEvent = (): void => this.noteInput(performance.now());

  private noteInput(now: number): void {
    this.idleAt = now;
    if (this.idle) this.syncLifecycle();
  }

  /**
   * Keeps the screen on exactly while the policy wants it. Called from `syncUi()` and the visibility
   * handler, and by the frame when the idle clock crosses five minutes; it only tells the backend on a change.
   */
  private syncLifecycle(): void {
    const now = performance.now();
    this.idle = isIdle(now - this.idleAt);
    const { awake } = lifecyclePolicy(
      {
        live: isLive(this.screen, this.sub),
        playing: this.screen === 'play',
        visible: this.visible,
        rotated: this.rotated,
        fullscreen: this.fs.isFullscreen(),
        idleMs: now - this.idleAt,
        touchCapable: this.touchCapable,
        fullscreenWant: this.fullscreenWant,
        wakeWant: this.wakeWant,
      },
      this.caps,
    );
    if (awake === this.awake) return;
    this.awake = awake;
    this.keepAwake.set(awake);
  }

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
      // The Touch controls and Haptics rows appear, so a selection moves down with its row.
      this.keepRow(() => (this.touchCapable = true));
      this.applyHaptics();
    }
  };

  /** A long press on the controls must not open the browser's menu. */
  /** A moving mouse shows the cursor again; touch never does. */
  private readonly onMouseMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    this.mouseMovedAt = e.timeStamp;
    this.mouseOverUi = e.target instanceof Element && e.target.closest(CURSOR_UI_SELECTOR) !== null;
  };

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
    // The canvas re-places itself when fullscreen comes or goes; the last scale seen after a request is kept.
    if (this.scaleBefore !== null && this.fs.isFullscreen()) {
      this.scaleAfter = this.pixelScale;
    }
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

  /**
   * The Options rows, in order. A row with a `link` opens its own screen (Sound, Haptics); the others
   * change the setting `key` names. Haptics appears only where there is something to feel, and Touch
   * controls only on a touch device; neither goes away once shown.
   */
  private optionRows(): { id: string; label: string; key?: SettingKey }[] {
    const row = (
      label: string,
      key: SettingKey,
    ): { id: string; label: string; key: SettingKey } => ({
      id: `opt:${key}`,
      label,
      key,
    });
    return [
      { id: 'sound', label: 'Sound' },
      ...(this.hapticsShown() ? [{ id: 'haptics', label: 'Haptics' }] : []),
      ...(displayShown(this.displayCaps()) ? [{ id: 'display', label: 'Display' }] : []),
      row('Captions', 'captions'),
      row('Controls', 'layout'),
      row('Text size', 'text'),
      row('Motion', 'motion'),
      ...(this.touchCapable ? [{ id: 'touch', label: 'Touch controls' }] : []),
      { id: 'back', label: 'Back' },
    ];
  }

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
    return this.optionRows().map(({ id, label, key }): MenuItem => {
      if (id === 'sound') return { id, label, value: styleName(effectiveAudio(this.audioUrl, o)) };
      if (id === 'haptics')
        return {
          id,
          label,
          value: hapticsLinkValue(this.urlLocks(), this.touchSettings.hapticStrength),
        };
      if (id === 'display') return { id, label, value: displayLinkValue(this.urlLocks(), o) };
      return key ? { id, label, kind: 'choice', value: text(key) } : { id, label };
    });
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
    if (this.sub === 'sound')
      return soundItems(
        this.settings,
        this.urlLocks(),
        this.soundRowList,
        resetArmed(this.resetAt, performance.now()),
      );
    if (this.sub === 'haptics')
      return hapticsItems(
        this.hapticsNow(),
        this.urlLocks(),
        this.hapticsRowList(),
        resetArmed(this.resetAt, performance.now()),
      );
    if (this.sub === 'display')
      return displayItems(this.settings, this.urlLocks(), this.displayRowList());
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
      const rows: MenuItem[] = [
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
      return withQuitRows(rows, this.quitCaps(), false, null);
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
      items.push({ id: 'quit', label: 'Quit to title' });
      const armed = resetArmed(this.resetAt, performance.now()) ? this.quitArmedId : null;
      return withQuitRows(items, this.quitCaps(), true, armed);
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
    this.cancelPreview();
    const under = this.subStack.pop();
    this.sub = under?.sub ?? null;
    this.menuIdx = under?.idx ?? 0;
    this.syncUi();
  }

  /**
   * Leaves every screen opened over the menu at once (the on-screen Pause button): the stack is
   * dropped, and over the title the selection goes back to the row that opened the first one.
   */
  private leaveSubs(): void {
    if (!this.sub) return;
    this.audio.play('click');
    this.haptics.ui('select');
    this.disarmReset();
    this.cancelPreview();
    const first = this.subStack[0];
    this.sub = null;
    this.subStack = [];
    this.menuIdx = first?.idx ?? 0;
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
    if (this.sub === 'sound') {
      this.stepSoundRow(this.soundRowList[this.menuIdx] ?? null, d, false);
      return;
    }
    if (this.sub === 'haptics') {
      this.stepHapticsRow(this.hapticsRowList()[this.menuIdx] ?? null, d, false);
      return;
    }
    if (this.sub === 'display') {
      this.stepDisplayRow(this.displayRowList()[this.menuIdx] ?? null, d);
      return;
    }
    if (this.sub !== 'options') return;
    const key = this.optionRows()[this.menuIdx]?.key;
    if (key) this.step(key, d, false);
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
    } else if (this.sub === 'sound') {
      if (!isSoundStepRow(this.soundRowList[i] ?? null) || this.menuItems()[i]?.disabled) return;
    } else if (this.sub === 'haptics') {
      if (!isHapticsStepRow(this.hapticsRowList()[i] ?? null) || this.menuItems()[i]?.disabled)
        return;
    } else if (this.sub === 'display') {
      if (!isDisplayStepRow(this.displayRowList()[i] ?? null) || this.menuItems()[i]?.disabled)
        return;
    } else if (this.sub !== 'options' || !this.optionRows()[i]?.key) return;
    if (this.menuIdx !== i) {
      this.menuIdx = i;
      this.syncUi();
    }
    this.adjust(d);
  }

  /**
   * Steps a Sound setting. Music and Effects take the new level at once; Style switches the mode. Then a
   * short preview plays so the change can be heard.
   */
  private stepSoundRow(row: SoundRow | null, d: number, wrap: boolean): void {
    if (!row || this.menuItems()[this.menuIdx]?.disabled) return;
    const o = this.settings;
    const next = stepSound(o, row, d, wrap);
    if (
      next.audio === o.audio &&
      next.music === o.music &&
      next.sfx === o.sfx &&
      next.lab === o.lab
    )
      return;
    this.disarmReset();
    this.settings = next;
    // Style and Effects are heard in their previews; Music and the Sound lab row play the menu blip.
    if (row === 'music' || row === 'lab') this.audio.play('menu');
    this.applySettings();
    this.syncUi();
    this.schedulePreview(row);
  }

  /** Plays a row's preview a moment after the last step, so a held key plays one and not one per step. */
  private schedulePreview(row: SoundRow): void {
    this.cancelPreview();
    const list = soundPreview(row, this.settings);
    if (!list.length) return;
    this.previewTimers.push(
      window.setTimeout(() => {
        this.previewTimers = list.map((p) =>
          window.setTimeout(() => this.audio.play(p.name, p.at), p.delayMs),
        );
      }, PREVIEW_DELAY_MS),
    );
  }

  private cancelPreview(): void {
    for (const t of this.previewTimers) window.clearTimeout(t);
    this.previewTimers = [];
  }

  /** Opens the Sound screen, on the first row the address has not fixed (Music when `?audio=` fixes Style). */
  private openSound(): void {
    this.openSub(
      'sound',
      firstEnabled(soundItems(this.settings, this.urlLocks(), this.soundRowList, false)),
    );
  }

  /** Opens the Haptics screen, on the first row the address has not fixed. */
  private openHaptics(): void {
    this.openSub(
      'haptics',
      firstEnabled(hapticsItems(this.hapticsNow(), this.urlLocks(), this.hapticsRowList(), false)),
    );
  }

  /** Opens the Display screen, on the first row the address has not fixed. */
  private openDisplay(): void {
    this.openSub(
      'display',
      firstEnabled(displayItems(this.settings, this.urlLocks(), this.displayRowList())),
    );
  }

  /**
   * Steps a Display setting and saves it. A row the address fixes does not step. Turning Keep screen on
   * off lets the screen go at once; turning Fullscreen off never leaves fullscreen, only stops asking. Row spacing resizes the menu rows
   * at once, the open screen included.
   */
  private stepDisplayRow(row: DisplayRow | null, d: number): void {
    if (!row || this.menuItems()[this.menuIdx]?.disabled) return;
    const next = stepDisplay(this.settings, row, d, this.urlLocks());
    if (
      next.fullscreen === this.settings.fullscreen &&
      next.awake === this.settings.awake &&
      next.density === this.settings.density
    )
      return;
    this.settings = next;
    this.audio.play('menu');
    if (row === 'awake') this.haptics.ui(next.awake ? 'toggleOn' : 'toggleOff');
    else this.haptics.ui('move');
    this.applySettings();
    this.syncUi();
  }

  /**
   * Steps a Haptics setting. Strength buzzes the phone with a jump at the new level and Rumble rumbles the
   * pad with a bonk, so the change is felt; the lab row toggles. A row the address fixes does not step.
   */
  private stepHapticsRow(row: HapticsRow | null, d: number, wrap: boolean): void {
    if (!row || this.menuItems()[this.menuIdx]?.disabled) return;
    const before = this.hapticsNow();
    const next = stepHaptics(before, row, d, wrap, this.urlLocks());
    const feel = hapticsFeel(before, next, row);
    if (!feel) return;
    this.disarmReset();
    this.audio.play('menu');
    this.setHaptics(next);
    if (feel.kind === 'phone') this.haptics.preview('jump', 'device');
    else if (feel.kind === 'pad') this.haptics.preview('bonk', 'controller');
    else this.haptics.ui(feel.on ? 'toggleOn' : 'toggleOff');
    this.syncUi();
  }

  /** Saves new haptics settings (the phone's strength with the touch settings, the rest with the options) and puts them to use. */
  private setHaptics(h: HapticsSettings): void {
    if (h.strength !== this.touchSettings.hapticStrength) {
      this.touchSettings = { ...this.touchSettings, hapticStrength: h.strength };
      writeTouchSettings(this.store, this.touchSettings);
    }
    this.settings = { ...this.settings, rumble: h.rumble, hapticsLab: h.lab };
    this.applySettings();
  }

  /** Reset on the Haptics screen asks twice, then puts Strength, Rumble and the haptics lab back and nothing else. */
  private tapHapticsReset(): void {
    if (resetArmed(this.resetAt, performance.now())) {
      this.disarmReset();
      this.setHaptics(resetHaptics());
      this.syncUi();
      return;
    }
    this.armReset();
  }

  /** Reset on the Sound screen asks twice, then puts Style, Music, Effects and the Sound lab back and nothing else. */
  private tapSoundReset(): void {
    if (resetArmed(this.resetAt, performance.now())) {
      this.disarmReset();
      this.settings = resetSound(this.settings);
      this.applySettings();
      this.syncUi();
      return;
    }
    this.armReset();
  }

  /** Steps a Touch controls setting; Size and Left-handed show at once on the controls behind the menu. */
  private stepTouchRow(row: TouchRow | null, d: number, wrap: boolean): void {
    if (!row) return;
    const s = this.touchSettings;
    const next = stepTouch(s, row, d, wrap);
    const changed =
      next.size !== s.size || next.opacity !== s.opacity || next.leftHanded !== s.leftHanded;
    if (!changed) return;
    this.disarmReset();
    this.audio.play('menu');
    this.haptics.ui(
      next.leftHanded === s.leftHanded ? 'move' : next.leftHanded ? 'toggleOn' : 'toggleOff',
    );
    this.applyTouchSettings(next);
    this.syncUi();
  }

  /** Puts new touch settings to use now (the controls, their opacity and the room they take) and saves them. */
  private applyTouchSettings(next: TouchSettings): void {
    this.touchSettings = next;
    this.touchUi.setSpec(touchSpec(next, undefined, this.chromeless()));
    this.ui.setTouchOpacity(next.opacity);
    this.ui.setTouchGutters(this.touchGutters());
    writeTouchSettings(this.store, next);
  }

  /** Reset asks twice: the first tap arms it for a few seconds, the second puts every touch setting back. */
  private tapReset(): void {
    if (resetArmed(this.resetAt, performance.now())) {
      this.disarmReset();
      this.applyTouchSettings(resetTouch(this.touchSettings));
      this.syncUi();
      return;
    }
    this.armReset();
  }

  /** What the host can do, which is what puts Quit to launcher and Quit game on the menus. */
  private quitCaps(): QuitCapabilities {
    return {
      game: this.hostBackend?.quit !== undefined,
      launcher: this.hostBackend?.quitToLauncher !== undefined,
    };
  }

  /**
   * Quit game on the pause menu asks twice, so a stray tap does not close a game with unsaved progress: the
   * first tap arms the row ("Tap again") for a few seconds, the second quits. Moving off the row disarms it.
   */
  private tapQuitApp(id: string = QUIT_GAME_ID): void {
    if (resetArmed(this.resetAt, performance.now()) && this.quitArmedId === id) {
      this.disarmReset();
      if (id === QUIT_LAUNCHER_ID) this.quitToLauncher();
      else this.quitApp();
      return;
    }
    this.quitArmedId = id;
    this.armReset();
  }

  /** Leaves fullscreen, writes the settings out and closes the app, or stays open with a message when the write fails. Only reached where the host has `quit`. */
  private quitApp(): void {
    const host = this.hostBackend;
    if (!host?.quit) return;
    const store = this.store as Partial<FlushableStorage> | null;
    void (async () => {
      const closed = await closeApp({
        exitFullscreen: () => this.fs.exit(),
        flush: store?.flush ? () => store.flush!() : undefined,
        quit: () => host.quit!(),
      });
      if (!closed)
        this.ui.toast("Couldn't save: storage is full or blocked, so the game stays open");
    })();
  }

  /**
   * Writes the settings and saves out, stops the game and goes back to the launcher page. Only reached where
   * the host has `quitToLauncher`. The window stays as it is (fullscreen included): the launcher is in it too.
   */
  private quitToLauncher(): void {
    const host = this.hostBackend;
    if (!host?.quitToLauncher) return;
    const store = this.store as Partial<FlushableStorage> | null;
    void (async () => {
      // `flush()` resolves false, rather than rejecting, when the store file cannot be written, and the pending
      // data then lives only in this page's memory. Leaving would lose it, so stay in the game and say so.
      let saved: boolean;
      try {
        saved = (await store?.flush?.()) !== false;
      } catch (error) {
        console.warn('Writing the store before leaving failed', error);
        saved = false;
      }
      if (!saved) {
        this.disarmReset();
        this.ui.toast("Couldn't save: storage is full or blocked, so the game stays open");
        return;
      }
      this.dispose();
      host.quitToLauncher?.();
    })();
  }

  /** The first tap of a two-tap Reset: it waits a few seconds for the second. */
  private armReset(): void {
    this.resetAt = performance.now();
    this.resetWhere = `${this.screen}/${this.sub}`;
    window.clearTimeout(this.resetTimer);
    this.resetTimer = window.setTimeout(() => this.disarmReset(), RESET_ARM_MS);
    this.syncUi();
  }

  /** Cancels a Reset waiting for its second tap, and redraws if it was showing. */
  private disarmReset(): void {
    window.clearTimeout(this.resetTimer);
    if (this.resetAt === null) return;
    this.resetAt = null;
    if (
      this.sub === 'touch' ||
      this.sub === 'touchEdit' ||
      this.sub === 'sound' ||
      this.sub === 'haptics' ||
      (this.screen === 'pause' && !this.sub)
    )
      this.syncUi();
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
    // A tap chooses the row it lands on, so the screen it opens returns to that row. A tap on a row other
    // than the selected one reaches here without passing through `hover()`, so it disarms a waiting Reset
    // or Quit game itself.
    if (i !== this.menuIdx) this.disarmReset();
    this.menuIdx = i;
    this.audio.play('click');
    const id = it.id ?? '';
    if (id !== 'back') this.haptics.ui('select');
    // Fullscreen is asked for here, inside the tap, not in the Ben-wave timer below: the browser only
    // allows it while the gesture's user activation lasts. A second tap during the wave asks for nothing.
    if (!this.titleAction) this.fullscreenFor(gestureFor(this.screen, this.sub, id, this.saveMode));
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
    if (this.sub === 'sound') {
      const row = soundRowOf(id);
      if (row === 'back') this.closeSub();
      else if (row === 'reset') this.tapSoundReset();
      else this.stepSoundRow(row, 1, true);
      return;
    }
    if (this.sub === 'haptics') {
      const row = hapticsRowOf(id);
      if (row === 'back') this.closeSub();
      else if (row === 'reset') this.tapHapticsReset();
      else this.stepHapticsRow(row, 1, true);
      return;
    }
    if (this.sub === 'display') {
      const row = displayRowOf(id);
      if (row === 'back') this.closeSub();
      else this.stepDisplayRow(row, 1);
      return;
    }
    if (this.sub === 'options') {
      if (id === 'back') this.closeSub();
      else if (id === 'sound') this.openSound();
      else if (id === 'haptics') this.openHaptics();
      else if (id === 'display') this.openDisplay();
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
        else if (id === QUIT_LAUNCHER_ID) this.quitToLauncher();
        else if (id === QUIT_GAME_ID) this.quitApp();
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
      else if (id === QUIT_LAUNCHER_ID || id === QUIT_GAME_ID) this.tapQuitApp(id);
    } else if (this.screen === 'card' && this.card) {
      if (id === 'primary') this.card.primary();
      else this.card.secondary?.();
    }
  }

  /** The Back button: closes the screen opened over the title or the pause menu, or resumes from the pause menu itself. */
  private backFromSub(): void {
    if (this.sub) this.closeSub();
    else if (this.screen === 'pause') {
      this.audio.play('click');
      this.haptics.ui('back');
      this.resume();
    }
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

  /**
   * Asks for fullscreen and the landscape lock when the gesture starts or resumes a run and the setting
   * resolves On. Called only from `activate()`, never from an event handler, so it cannot loop.
   */
  private fullscreenFor(g: Gesture): void {
    const plan = onGesture(
      g,
      {
        fullscreenWant: this.fullscreenWant,
        touchCapable: this.touchCapable,
        fullscreen: this.fs.isFullscreen(),
      },
      this.caps,
    );
    if (!plan.fullscreen && !plan.lock) return;
    this.requestFullscreen(plan);
  }

  /** Makes the request and keeps how it went and the pixel scale around it (for trying it on a phone). */
  private requestFullscreen(plan: GesturePlan): void {
    this.scaleBefore = this.pixelScale;
    this.scaleAfter = null;
    void this.fs.enter(plan).then((r) => {
      this.lastFs = r;
      if (this.fs.isFullscreen()) this.scaleAfter = this.pixelScale;
    });
  }

  /** The screen as the Fullscreen button sees it. */
  private fullscreenScreen(): FullscreenScreen {
    if (this.rotated || this.sub === 'touchEdit') return 'other';
    switch (this.screen) {
      case 'title':
      case 'pause':
      case 'card':
      case 'play':
        return this.screen;
      default:
        return 'other';
    }
  }

  /** Whether the Fullscreen button (and so `F`) is on offer, and what it shows. */
  private fullscreenState(): ReturnType<typeof fullscreenButton> {
    return fullscreenButton({
      screen: this.fullscreenScreen(),
      touch: this.touchMode,
      caps: this.caps,
      fullscreen: this.fs.isFullscreen(),
    });
  }

  /** Shows, hides and relabels the Fullscreen button. Called from `syncUi()` and when fullscreen comes or goes. */
  private syncFullscreenButton(): void {
    const place: FullscreenPlace = touchFaces(this.screen, this.sub).shown.includes('pause')
      ? 'beside-pause'
      : 'corner';
    this.fsControl.set(this.fullscreenState(), this.touchMode, place);
  }

  /**
   * The Fullscreen button and `F`: enters fullscreen, or leaves it. An explicit request, so it works
   * whatever Options > Display > Fullscreen says (that governs the automatic requests only). Called from
   * the click or the keydown itself, so the request still has its gesture. On a touch device it also
   * locks the landscape orientation, as the automatic request does. Leaving fullscreen during a level
   * pauses it, as for any other way out.
   */
  private toggleFullscreen(): void {
    if (!this.fullscreenState().show && !this.nativeFullscreenKey()) return;
    if (this.fs.isFullscreen()) {
      void this.fs.exit();
      return;
    }
    this.requestFullscreen({
      fullscreen: true,
      lock: this.touchCapable && this.caps.orientationLock,
    });
  }

  /** `F` in the desktop app: the native window has no button, so the key works wherever the web button would. */
  private nativeFullscreenKey(): boolean {
    if (this.fs.kind !== 'native') return false;
    return fullscreenButton({
      screen: this.fullscreenScreen(),
      touch: this.touchMode,
      caps: { fullscreen: true, host: 'web' },
      fullscreen: this.fs.isFullscreen(),
    }).show;
  }

  /**
   * The desktop app starts fullscreen when Fullscreen is On (the setting or `?fullscreen`); Off and Auto leave
   * the window as it opens. The browser needs a gesture for this and the native window does not.
   */
  private startFullscreen(): void {
    if (this.fs.kind !== 'native' || this.fullscreenWant !== 'on' || this.fs.isFullscreen()) return;
    void this.fs.enter({ fullscreen: true, lock: false });
  }

  /**
   * Leaving fullscreen while a level is in play pauses it; this is how Android's Back button, which
   * leaves fullscreen without a history entry, ends up on the pause menu. Never asks for fullscreen.
   */
  private onFullscreenChange(): void {
    if (
      !this.fs.isFullscreen() &&
      pauseFor('fullscreenExit', { playing: this.screen === 'play' })
    ) {
      this.autoPause();
    }
  }

  /** Whether the page runs as an installed app (a standalone, fullscreen or minimal-ui display mode). */
  private installed(): boolean {
    return isInstalled({
      matchMedia: window.matchMedia?.bind(window),
      nav: navigator as Navigator & { standalone?: boolean },
    });
  }

  /** Whether the browser's bars are gone (fullscreen or an installed app), so the controls are lifted to match. */
  private chromeless(): boolean {
    return chromeHidden({
      fullscreen: this.fs.isFullscreen(),
      installed: this.installed(),
    });
  }

  /** Places the controls again when fullscreen or an installed display mode comes or goes. */
  private syncLift(): void {
    this.touchUi.setSpec(touchSpec(this.touchSettings, undefined, this.chromeless()));
    this.ui.setTouchGutters(this.touchGutters());
  }

  /** Whether the game is in fullscreen or an installed app, where it takes the browser's Back button. */
  private backOn(): boolean {
    return backEnabled({
      standalone: this.installed(),
      fullscreen: this.fs.isFullscreen(),
      forced: this.forcedBack,
    });
  }

  /** Holds the Back guard entry only while the screen has an answer to Back and the mode allows it. */
  private syncBack(): void {
    this.backGuard.set(
      backGuardAllowed(this.caps) && this.backOn() && backAction(this.screen, this.sub) !== null,
    );
  }

  /** Re-checks Back when the game enters or leaves fullscreen or an installed display mode. */
  private watchBack(): () => void {
    const sync = (): void => {
      this.syncBack();
      this.syncLift();
    };
    const onFullscreen = (): void => {
      this.onFullscreenChange();
      this.ui.fullscreenChanged();
      this.syncBack();
      this.syncFullscreenButton();
      this.syncHints();
      this.syncLift();
    };
    const offFullscreen = this.fs.onChange(onFullscreen);
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
      offFullscreen();
      for (const l of lists) l.removeEventListener('change', sync);
    };
  }

  /** Enter / jump / fire: finish the typewriter, then advance whatever is on screen. */
  primary(): void {
    const s = this.screen;
    if (s === 'cine') this.pressStory(() => this.skipCine());
    else if (s === 'dialogue') this.typeOrNext(() => this.nextLine());
    else if (s === 'ending') this.pressStory(() => this.startCredits());
    else if (s === 'credits') this.pressCredits();
    else if (s === 'stinger') this.pressStinger();
    else if (s === 'title' || s === 'pause' || s === 'card') {
      this.activate();
    }
  }

  /** What the pages of the intro or the ending were last packed for, for the debug state. */
  private storyPack: StoryMeasure | null = null;

  /** Starts the intro or the ending from its first page, packed for the text box as it is now. */
  private startStory(scenes: BeatScene[]): void {
    this.storyPack = this.ui.measureStory(scenes === CINE);
    this.story.start(scenes, this.storyPack.fit);
  }

  /**
   * Packs the story's pages again after the layout changed (a resize, a turn, fullscreen, the font
   * arriving), keeping the player's place. A page that comes out the same is not touched.
   */
  repackStory(): void {
    if (this.screen !== 'cine' && this.screen !== 'ending') return;
    const before = this.story.view();
    this.storyPack = this.ui.measureStory(this.screen === 'cine');
    this.story.setFit(this.storyPack.fit);
    const after = this.story.view();
    if (after.text !== before.text || after.shown !== before.shown) this.syncUi();
  }

  /** Test hook: jumps to a page of a scene of the intro or the ending that is showing, as if the player had got there. */
  debugStoryTo(scene: number, page = 0): void {
    if (this.screen !== 'cine' && this.screen !== 'ending') return;
    this.story.seek(scene, page);
    if (this.screen === 'cine') {
      this.cine.start(this.story.scene);
      if (this.story.scene === 2 && this.story.beat >= LIFTOFF_BEAT) this.cine.launch();
    }
    this.syncUi();
  }

  /** A press on the cinematic or the ending: completes the beat, else moves on; `leave` runs after the last. */
  private pressStory(leave: () => void): void {
    const scene = this.story.scene;
    const r = this.story.press();
    if (r === 'end') return leave();
    if (this.screen === 'cine') {
      if (this.story.scene !== scene) this.cine.start(this.story.scene);
      // The launch waits for the beat that opens the hatch.
      if (this.story.scene === 2 && this.story.beat >= LIFTOFF_BEAT) this.cine.launch();
    }
    this.syncUi();
  }

  private curText(): string {
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
    if (this.screen === 'cine' || this.screen === 'ending') {
      if (this.story.tick(dt)) this.syncUi();
      return;
    }
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
    this.startStory(CINE);
    this.cine.start(0);
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
      void confirmWrite(this.store)?.then((done) => {
        if (!done) this.ui.toast("Couldn't save: storage is full or blocked");
      });
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
    const failed = "Couldn't save: storage is full or blocked";
    // Where the write finishes later (the app's store file), say "Saved" only once it has.
    const settled = ok ? confirmWrite(this.store) : null;
    if (settled) {
      void settled.then((done) => this.ui.toast(done ? `Saved to ${slotName(id)}` : failed));
    } else {
      this.ui.toast(ok ? `Saved to ${slotName(id)}` : failed);
    }
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
    // Any change of screen or sub-screen (resuming, reopening the pause menu, a card, the title) cancels a
    // Reset or Quit game that was waiting for its second tap, so it cannot be completed from somewhere else.
    if (this.resetAt !== null && this.resetWhere !== `${this.screen}/${this.sub}`) {
      window.clearTimeout(this.resetTimer);
      this.resetAt = null;
    }
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
    const over =
      this.sub === 'options' ||
      this.sub === 'saves' ||
      this.sub === 'sound' ||
      this.sub === 'haptics' ||
      this.sub === 'display' ||
      this.sub === 'touch';
    ui.showTitle(onTitle && !this.sub ? items : null, sel, onTitle && this.sub === 'controls');
    const editing = this.sub === 'touchEdit' && (onTitle || s === 'pause');
    // Back shows over every screen opened over a menu and on the pause menu itself (where it resumes).
    ui.setBack(this.touchMode && !editing && (s === 'pause' || (onTitle && !!this.sub)));
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
            : this.sub === 'sound'
              ? 'Sound'
              : this.sub === 'haptics'
                ? 'Haptics'
                : this.sub === 'display'
                  ? 'Display'
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
      const v = this.story.view();
      ui.showLetterbox({
        place: v.place,
        shown: v.shown,
        hidden: v.hidden,
        pips: v.pips,
        done: v.done,
        last: v.last,
        skip: s === 'cine',
        announce: v.announcement,
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
    this.syncLifecycle();
    this.syncFullscreenButton();
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
    if (s === 'cine') return CINE_TRACK[this.story.scene] ?? 'cine';
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
   * Test hook for `?debug` and `?debug&lab`: both labs are there whatever the options say, and one opens
   * if asked (`true` or `'sound'` the sound lab, `'haptics'` the haptics lab). Resolves once the lab is
   * built.
   */
  async debugLab(open: boolean | LabId = false): Promise<void> {
    this.labForced = true;
    await this.syncLab(open === true ? 'sound' : open === false ? null : open);
  }

  /** The labs the player can reach now: `?debug` gives both, otherwise each has its own option. */
  private labsWanted(): LabId[] {
    return [
      ...(this.labForced || this.settings.lab ? (['sound'] as const) : []),
      ...(this.labForced || this.settings.hapticsLab ? (['haptics'] as const) : []),
    ];
  }

  /**
   * Adds or removes the labs (one "Lab" button, and an overlay for each lab) to match `?debug` and the
   * Sound lab and Haptics lab options. With neither wanted, nothing of them exists: no module is loaded
   * and no node is in the page. A lab's own code is loaded the first time it is opened. Turning a lab off
   * closes it and lets go of anything it held. Auditioning never touches the saved options: sound plays
   * through the audio directly and holds a room, a mix state or a track only until "Follow" is chosen,
   * and haptics play through `audition`, which ignores the settings.
   */
  private async syncLab(open: LabId | null = null): Promise<void> {
    const wanted = this.labsWanted();
    if (wanted.length === 0) {
      this.unmountLabs();
      return;
    }
    if (open) this.labOpenWhenReady = open;
    if (!this.labShell) {
      if (this.labLoading) return;
      this.labLoading = true;
      try {
        const { LabShell } = await import('./ui/lab-shell');
        if (this.labsWanted().length === 0 || this.labShell) return;
        this.labShell = new LabShell({
          mount: (node) => this.ui.mount(node),
          load: (id) => (id === 'sound' ? this.buildSoundLab() : this.buildHapticsLab()),
        });
      } finally {
        this.labLoading = false;
      }
    }
    const shell = this.labShell as LabShell;
    shell.setAvailable(this.labsWanted());
    if (!wanted.includes('sound')) this.unmountSoundLab();
    if (!wanted.includes('haptics')) this.unmountHapticsLab();
    const want = this.labOpenWhenReady;
    this.labOpenWhenReady = null;
    if (want) await shell.open(wanted.includes(want) ? want : (wanted[0] as LabId));
  }

  /** Loads the sound lab's code and builds the lab, if it is still wanted. */
  private async buildSoundLab(): Promise<void> {
    const [{ SoundLab }, { captureState, labItems }] = await Promise.all([
      import('./ui/sound-lab'),
      import('./audio/lab'),
    ]);
    const shell = this.labShell;
    if (!shell || this.soundLab || !this.labsWanted().includes('sound')) return;
    this.soundLab = new SoundLab(
      {
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
        copy: (text) => this.copyText(text),
      },
      shell,
    );
    shell.register('sound', this.soundLab);
  }

  /** Loads the haptics lab's code and builds the lab, if it is still wanted. */
  private async buildHapticsLab(): Promise<void> {
    const [{ HapticsLab }, { hapticLabItems }] = await Promise.all([
      import('./ui/haptics-lab'),
      import('./haptics/lab'),
    ]);
    const shell = this.labShell;
    if (!shell || this.hapticsLab || !this.labsWanted().includes('haptics')) return;
    this.hapticsLab = new HapticsLab(
      {
        groups: hapticLabItems(Object.keys(this.haptics.cues())),
        state: () => ({ cues: this.haptics.cues(), ...this.haptics.tuning() }),
        tune: (patch) => this.haptics.tune(patch),
        audition: (p, target, scale) => this.haptics.audition(p, target, scale),
        caps: () => {
          const { caps } = this.haptics.report();
          return { device: caps.device, controller: caps.controller };
        },
        route: () => this.haptics.report().route,
        tapped: () =>
          typeof navigator !== 'undefined' && navigator.userActivation
            ? navigator.userActivation.hasBeenActive
            : null,
        last: () => this.haptics.report().plays.at(-1),
        copy: (text) => this.copyText(text),
      },
      shell,
    );
    shell.register('haptics', this.hapticsLab);
  }

  /** Copies text to the clipboard; false when the browser refuses (the lab then logs it to the console). */
  private async copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  /** Closes the sound lab and takes it out of the page, putting back what it tuned or held. */
  private unmountSoundLab(): void {
    const lab = this.soundLab;
    if (!lab) return;
    this.soundLab = null;
    this.labShell?.unregister('sound');
    lab.dispose();
    this.audio.setMode(effectiveAudio(this.audioUrl, this.settings));
    if (this.labMusic) {
      this.labMusic = false;
      this.updateMusic();
    }
    if (this.labRoom) {
      this.labRoom = null;
      this.updateRoom(true);
    }
    if (this.labMix) {
      this.labMix = null;
      this.syncMix();
    }
  }

  /** Closes the haptics lab and takes it out of the page, putting every tuned cue and constant back. */
  private unmountHapticsLab(): void {
    const lab = this.hapticsLab;
    if (!lab) return;
    this.hapticsLab = null;
    this.labShell?.unregister('haptics');
    lab.dispose();
  }

  /** Takes both labs and the Lab button out of the page. */
  private unmountLabs(): void {
    this.labOpenWhenReady = null;
    this.unmountSoundLab();
    this.unmountHapticsLab();
    this.labShell?.dispose();
    this.labShell = null;
  }

  /** Debug hook: starts recording frame times (`?debug` does this at boot); `debugState.perf` reports them. */
  debugPerf(): void {
    this.perf ??= new FrameStats();
  }

  /** Debug hook: starts a fresh frame-time window, for comparing two settings in one session. */
  debugPerfReset(): void {
    this.perf?.reset();
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
      | 'sound'
      | 'haptics'
      | 'display'
      | 'touch'
      | 'touchEdit'
      | 'saves'
      | 'play'
      | 'map'
      | 'pause'
      | 'card'
      | 'cine'
      | 'ending'
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
    if (what === 'ending') {
      // The Citadel behind the panels, as the ending shows it; the camera is wherever the level starts.
      this.debugEnterLevel(2);
      this.screen = 'ending';
      this.startStory(END);
      return this.syncUi();
    }
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
      this.menuIdx = Math.max(
        0,
        this.optionRows().findIndex((r) => r.id === 'touch'),
      );
      this.openSub('touch');
      if (what === 'touchEdit') {
        this.menuIdx = Math.max(0, this.touchRowList.indexOf('move'));
        this.openSub('touchEdit');
      }
      return;
    }
    if (what === 'sound') {
      // Title, then Options on its Sound row, then the screen, as a player gets there.
      this.openSub('options');
      this.menuIdx = 0;
      return this.openSound();
    }
    if (what === 'haptics') {
      // Title, then Options on its Haptics row, then the screen, as a player gets there. The row exists
      // only where there is something to feel, so a desktop test gets it (and a Rumble row) by asking.
      if (!this.hapticsShown()) this.padSeen = true;
      this.openSub('options');
      this.menuIdx = Math.max(
        0,
        this.optionRows().findIndex((r) => r.id === 'haptics'),
      );
      return this.openHaptics();
    }
    if (what === 'display') {
      // Title, then Options on its Display row, then the screen, as a player gets there.
      this.openSub('options');
      this.menuIdx = Math.max(
        0,
        this.optionRows().findIndex((r) => r.id === 'display'),
      );
      return this.openDisplay();
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
      fast: r.fast,
      deviceScale: this.pixelScale * r.divisor,
      overscanW: r.overscanW,
      overscanH: r.overscanH,
      cssCanvasW: r.canvasCssW,
      cssCanvasH: r.canvasCssH,
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
      ben: this.benAnchor(this.camDrawn.x, this.camDrawn.y),
      story: this.story.view(),
      storyPack: this.storyPack && {
        allowed: this.storyPack.allowed,
        width: this.storyPack.width,
        lastWidth: this.storyPack.lastWidth,
        share: this.storyPack.share,
        touch: this.storyPack.touch,
        pageCounts: this.story.pageCounts,
        over: this.story.allPages.map((p) => p.over),
      },
      custom: this.touchUi.placed?.custom ?? false,
      back: { enabled: this.backOn(), armed: this.backGuard.armed },
      lifecycle: {
        host: this.caps.host,
        caps: this.caps,
        fullscreenWant: this.fullscreenWant,
        wakeWant: this.wakeWant,
        awake: this.awake,
        wake: this.keepAwake.debug,
        keepAwake: this.keepAwake.kind,
        lastFs: this.lastFs,
        escLock: this.fs.escapeCaptured,
        fullscreen: this.fs.isFullscreen(),
        fsKind: this.fs.kind,
        scaleBefore: this.scaleBefore,
        scaleAfter: this.scaleAfter,
      },
      storage: this.storageKind,
      instances: this.lastCount,
      atlas: this.atlas.size,
      perf: this.perf?.report() ?? null,
    };
  }
}
