// The haptics page's "Gamepad rumble" section: tests the gamepad-haptics plugin through its own guest API and through the game's controller backend.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import * as guest from '@liminal-hq/plugin-gamepad-haptics';
import type { GamepadBackend, PadHint, PadInfo, Pattern } from '@liminal-hq/plugin-gamepad-haptics';
import { gamepadBackend, type RumblePad } from '@lieutenant-fizz/engine/haptic-backends';
import {
  gamepadPluginBackend,
  pluginPadApi,
  type GamepadPluginBackend,
} from '@lieutenant-fizz/engine/gamepad-plugin';
import type { HapticPattern } from '@lieutenant-fizz/engine/haptic-pattern';

declare const __GAMEPAD_PLUGIN_VERSION__: string;

/** One call the section made: what was sent and what came back. */
export interface PadEntry {
  at: string;
  kind: 'call' | 'cue' | 'event' | 'note';
  label: string;
  request?: unknown;
  result?: unknown;
  error?: string;
  ms?: number;
  pending?: boolean;
}

export interface GamepadSectionOptions {
  /** The page's master strength, 0 to 1. */
  strength: () => number;
  /** The game's cues: id, label and pattern, in the order the page lists them. */
  cues: { title: string; items: { id: string; label: string; pattern: HapticPattern }[] }[];
  /** Exposes the section's tools on `window.__lfGamepad`. */
  debug: boolean;
}

const FRAME_PRESETS: Record<string, unknown> = {
  'heavy 300 ms': [{ durationMs: 300, heavy: 1, light: 0 }],
  'light 300 ms': [{ durationMs: 300, heavy: 0, light: 1 }],
  'both 300 ms': [{ durationMs: 300, heavy: 1, light: 1 }],
  'ramp up': [0.2, 0.4, 0.6, 0.8, 1].map((v) => ({ durationMs: 80, heavy: v, light: v })),
  'tap, gap, tap': [
    { durationMs: 60, heavy: 0, light: 1 },
    { durationMs: 120, heavy: 0, light: 0 },
    { durationMs: 60, heavy: 1, light: 0 },
  ],
  'hold 1500 ms': [{ durationMs: 1500, heavy: 0.7, light: 0 }],
  'over the continuous limit (2500 ms)': [{ durationMs: 2500, heavy: 1, light: 1 }],
  'over the duration limit (4000 ms)': [{ durationMs: 4000, heavy: 1, light: 1 }],
  'zero duration (invalid)': [{ durationMs: 0, heavy: 1, light: 1 }],
  'level 1.5 (invalid)': [{ durationMs: 100, heavy: 1.5, light: 0 }],
  'empty (invalid)': [],
  '513 frames (invalid)': Array.from({ length: 513 }, () => ({
    durationMs: 1,
    heavy: 0.5,
    light: 0.5,
  })),
};

const FORMAT = guest.PATTERN_FORMAT;
const PATTERN_PRESETS: Record<string, unknown> = {
  hurt: {
    format: FORMAT,
    events: [
      { type: 'transient', at: 0, intensity: 1, sharpness: 0.9 },
      {
        type: 'continuous',
        at: 40,
        duration: 120,
        intensity: [
          { t: 0, v: 0.9 },
          { t: 1, v: 0 },
        ],
        sharpness: 0.1,
      },
    ],
  },
  'crisp tap': {
    format: FORMAT,
    events: [{ type: 'transient', at: 0, intensity: 1, sharpness: 1 }],
  },
  'dull thud': {
    format: FORMAT,
    events: [{ type: 'transient', at: 0, intensity: 1, sharpness: 0 }],
  },
  'hum 500 ms': {
    format: FORMAT,
    events: [{ type: 'continuous', at: 0, duration: 500, intensity: 0.6, sharpness: 0.5 }],
  },
  'drop-if-busy 400 ms': {
    format: FORMAT,
    policy: 'drop-if-busy',
    events: [{ type: 'continuous', at: 0, duration: 400, intensity: 0.6, sharpness: 0.5 }],
  },
  'queue 300 ms': {
    format: FORMAT,
    policy: 'queue',
    events: [{ type: 'continuous', at: 0, duration: 300, intensity: 0.8, sharpness: 0.3 }],
  },
  'coalesce 200 ms': {
    format: FORMAT,
    policy: { coalesce: 200 },
    events: [{ type: 'transient', at: 0, intensity: 1, sharpness: 0.5 }],
  },
  'invalid (no events)': { format: FORMAT, events: [] },
};

const TRIGGER_PRESETS: Record<string, unknown> = {
  'first pad': {},
  'half strength': { scale: 0.5 },
  'zero scale': { scale: 0 },
  'pad gamepad:0': { padId: 'gamepad:0' },
  'no such pad': { padId: 'gamepad:99' },
};

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const now = (): string => new Date().toISOString().slice(11, 23);

type Attrs = Record<string, string>;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...kids: (string | Node)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}
const button = (label: string, onClick: () => void, id?: string): HTMLButtonElement => {
  const b = el('button', id ? { id } : {}, label);
  b.addEventListener('click', onClick);
  return b;
};
const field = (label: string, node: HTMLElement): HTMLLabelElement =>
  el('label', { class: 'field' }, label, node);

/** The pad the game reads: the first connected one the webview lists. */
const webPad = (): Gamepad | null =>
  (navigator.getGamepads?.() ?? []).find((p): p is Gamepad => !!p) ?? null;

/** Builds the section into `host`. Never throws. */
export function mountGamepadSection(host: HTMLElement, opts: GamepadSectionOptions): void {
  const entries: PadEntry[] = [];
  const rows = new Map<PadEntry, HTMLElement>();
  const logBox = el('div', { id: 'padlog' });
  let pads: PadInfo[] = [];
  let guestBackend: GamepadBackend | null = null;

  // ----- Log -----

  function paint(e: PadEntry): void {
    let row = rows.get(e);
    if (!row) {
      row = el('div', { class: 'entry' });
      rows.set(e, row);
      logBox.prepend(row);
    }
    const head = el('div', {}, el('b', {}, e.label), ` ${e.at}`);
    if (e.pending) head.append(' …');
    else if (e.error !== undefined) head.append(el('span', { class: 'bad' }, ' rejected'));
    else if (e.kind === 'call' || e.kind === 'cue')
      head.append(el('span', { class: 'ok' }, ` ok${e.ms !== undefined ? ` ${e.ms} ms` : ''}`));
    const body = el('div', { style: 'white-space: pre-wrap' });
    if (e.error !== undefined) body.textContent = e.error;
    else if (e.result !== undefined) body.textContent = JSON.stringify(e.result);
    const det = el('details', {}, el('summary', {}, 'request'));
    det.append(
      el(
        'pre',
        {},
        JSON.stringify({ request: e.request, result: e.result, error: e.error }, null, 1),
      ),
    );
    row.replaceChildren(head, body, det);
  }

  function add(e: Omit<PadEntry, 'at'>): PadEntry {
    const entry: PadEntry = { at: now(), ...e };
    entries.push(entry);
    if (entries.length > 300) {
      const old = entries.shift();
      if (old) {
        rows.get(old)?.remove();
        rows.delete(old);
      }
    }
    paint(entry);
    return entry;
  }

  /** Runs one call and logs the request, then the result or the error text. Resolves with the result, or undefined on error. */
  async function call<T>(
    label: string,
    request: unknown,
    fn: () => Promise<T> | T,
  ): Promise<T | undefined> {
    const entry = add({ kind: 'call', label, request, pending: true });
    const t0 = performance.now();
    try {
      const result = await fn();
      entry.result = result === undefined ? null : result;
      return result;
    } catch (err) {
      entry.error = msg(err);
      return undefined;
    } finally {
      entry.pending = false;
      entry.ms = Math.round(performance.now() - t0);
      paint(entry);
    }
  }

  const parse = (label: string, text: string): { ok: true; value: unknown } | { ok: false } => {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (err) {
      add({ kind: 'call', label, request: text, error: `Not JSON: ${msg(err)}` });
      return { ok: false };
    }
  };

  // ----- Status -----

  const padList = el('div', { id: 'padlist' });
  const webList = el('div', { id: 'weblist' });

  function describeWeb(): void {
    const list = (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p);
    const lines = list.map(
      (p) =>
        `${p.index}: ${p.id} — vibrationActuator ${p.vibrationActuator ? `yes (${(p.vibrationActuator as { type?: string }).type ?? '?'})` : 'no'}`,
    );
    webList.textContent = lines.length
      ? lines.join('\n')
      : 'The webview lists no gamepad (press a button on the pad with this page focused).';
    webList.style.whiteSpace = 'pre-wrap';
  }

  function describePads(): void {
    if (pads.length === 0) {
      padList.textContent = 'The plugin sees no pad.';
      return;
    }
    padList.replaceChildren(
      ...pads.map((p) => {
        const line = el(
          'div',
          { class: 'bar' },
          el(
            'span',
            {},
            `${p.id} ${p.name} (${p.vendorId.toString(16)}:${p.productId.toString(16)}) ${p.transport} tier ${p.topTier} motors ${p.motors}${p.reason ? ` — ${p.reason}` : ''}`,
          ),
        );
        line.append(
          button(
            'Identify',
            () => void call(`identify ${p.id}`, { padId: p.id }, () => guest.identify(p.id)),
          ),
          button('Use as pad id', () => setPadId(p.id)),
        );
        return line;
      }),
    );
  }

  async function refreshPads(label = 'listPads'): Promise<void> {
    const list = await call(label, {}, () => guest.listPads());
    if (list) pads = list;
    describePads();
    describeWeb();
  }

  // ----- Pad id shared by the raw boxes -----

  const padIdInput = el('input', { id: 'gp-padid', value: 'gamepad:0', size: '12' });
  const setPadId = (id: string): void => {
    padIdInput.value = id;
  };

  // ----- Game cues on the controller backend -----

  let engine: GamepadPluginBackend | null = null;
  const fallback = gamepadBackend(() => webPad() as RumblePad | null);
  const engineBackend = (): GamepadPluginBackend => {
    engine ??= gamepadPluginBackend(fallback, () => webPad() as RumblePad | null, {
      api: pluginPadApi(),
    });
    return engine;
  };

  function playCue(id: string, pattern: HapticPattern): void {
    const b = engineBackend();
    const scale = opts.strength();
    const choice = b.choice();
    const result = b.play(pattern, scale);
    add({
      kind: 'cue',
      label: `cue ${id}`,
      request: { scale, choice: choice.kind === 'native' ? choice.pad.id : choice.kind },
      result,
    });
  }

  // ----- Build -----

  const title = el('h2', {}, `Gamepad rumble (plugin ${__GAMEPAD_PLUGIN_VERSION__})`);
  const note = el(
    'p',
    {},
    'Rumble only: the plugin never reads input. A pad found natively is played natively; the webview’s vibrationActuator plays only when no native pad fits.',
  );

  const status = el('div', {});
  status.append(
    el(
      'div',
      { class: 'bar' },
      button('Capabilities', () => void call('capabilities', {}, () => guest.capabilities())),
      button('List pads', () => void refreshPads()),
      button('Stop all', () => void call('stop', {}, () => guest.stop())),
      button('Webview pads', describeWeb),
    ),
    padList,
    el('h3', {}, 'Webview Gamepad API'),
    webList,
  );

  // Cues
  const cueBox = el('div', {});
  cueBox.append(
    el('h3', {}, 'Game cues on the controller target (Strength = master strength above)'),
  );
  for (const g of opts.cues) {
    const grid = el('div', { class: 'grid' });
    for (const item of g.items)
      grid.append(button(item.label, () => playCue(item.id, item.pattern)));
    cueBox.append(el('h3', {}, g.title), grid);
  }
  cueBox.append(
    el(
      'div',
      { class: 'bar' },
      button('Stop controller', () => {
        engineBackend().stop();
        add({ kind: 'note', label: 'stop controller backend' });
      }),
    ),
  );

  // Raw playFrames
  const framesArea = el('textarea', { id: 'gp-frames', rows: '5', cols: '48' });
  framesArea.value = JSON.stringify(FRAME_PRESETS['heavy 300 ms']);
  const scaleInput = el('input', { id: 'gp-scale', value: '', placeholder: 'default', size: '8' });
  const presetSel = el('select', { id: 'gp-frame-presets' });
  for (const k of Object.keys(FRAME_PRESETS)) presetSel.append(el('option', { value: k }, k));
  presetSel.addEventListener('change', () => {
    framesArea.value = JSON.stringify(FRAME_PRESETS[presetSel.value]);
  });
  const raw = el('div', {});
  raw.append(
    el('h3', {}, 'playFrames(padId, frames, scale?) and identify, stop'),
    el(
      'div',
      { class: 'bar' },
      field('padId', padIdInput),
      field('scale', scaleInput),
      field('preset', presetSel),
    ),
    framesArea,
    el(
      'div',
      { class: 'bar' },
      button('playFrames', () => {
        const parsed = parse('playFrames', framesArea.value);
        if (!parsed.ok) return;
        const scale = scaleInput.value.trim() === '' ? undefined : Number(scaleInput.value);
        const request = { padId: padIdInput.value, frames: parsed.value, scale };
        void call('playFrames', request, () =>
          guest.playFrames(padIdInput.value, parsed.value as never, scale),
        );
      }),
      button(
        'identify(padId)',
        () =>
          void call('identify', { padId: padIdInput.value }, () =>
            guest.identify(padIdInput.value),
          ),
      ),
      button(
        'stop(padId)',
        () => void call('stop', { padId: padIdInput.value }, () => guest.stop(padIdInput.value)),
      ),
      button('stop()', () => void call('stop', {}, () => guest.stop())),
    ),
  );

  // createBackend
  const idInput = el('input', { id: 'gp-pattern-id', value: 'hurt', size: '10' });
  const patternArea = el('textarea', { id: 'gp-pattern', rows: '8', cols: '48' });
  patternArea.value = JSON.stringify(PATTERN_PRESETS.hurt, null, 1);
  const patternSel = el('select', { id: 'gp-pattern-presets' });
  for (const k of Object.keys(PATTERN_PRESETS)) patternSel.append(el('option', { value: k }, k));
  patternSel.addEventListener('change', () => {
    patternArea.value = JSON.stringify(PATTERN_PRESETS[patternSel.value], null, 1);
    idInput.value = patternSel.value.replace(/\W+/g, '-');
  });
  const triggerArea = el('textarea', { id: 'gp-trigger', rows: '3', cols: '48' });
  triggerArea.value = '{}';
  const triggerSel = el('select', { id: 'gp-trigger-presets' });
  for (const k of Object.keys(TRIGGER_PRESETS)) triggerSel.append(el('option', { value: k }, k));
  triggerSel.addEventListener('change', () => {
    triggerArea.value = JSON.stringify(TRIGGER_PRESETS[triggerSel.value]);
  });
  const masterInput = el('input', { id: 'gp-master', value: '1', size: '5' });
  const tierSel = el('select', { id: 'gp-maxtier' });
  for (const t of ['none', '0', '1', '2', '3']) tierSel.append(el('option', { value: t }, t));
  const backend = (): GamepadBackend => (guestBackend ??= guest.createBackend());

  const created = el('div', {});
  created.append(
    el('h3', {}, 'createBackend(): register, trigger, setMasterScale, setMaxTier, stop'),
    el('div', { class: 'bar' }, field('pattern id', idInput), field('preset', patternSel)),
    patternArea,
    el(
      'div',
      { class: 'bar' },
      button('register', () => {
        const parsed = parse('register', patternArea.value);
        if (!parsed.ok) return;
        void call('register', { id: idInput.value, pattern: parsed.value }, () =>
          backend().register(idInput.value, parsed.value as Pattern),
        );
      }),
    ),
    el('div', { class: 'bar' }, field('trigger options', triggerSel)),
    triggerArea,
    el(
      'div',
      { class: 'bar' },
      button('trigger', () => {
        const parsed = parse('trigger options', triggerArea.value);
        if (!parsed.ok) return;
        void call('trigger', { id: idInput.value, options: parsed.value }, () =>
          backend().trigger(idInput.value, parsed.value as never),
        );
      }),
      button('trigger ×2 at once', () => {
        const parsed = parse('trigger options', triggerArea.value);
        if (!parsed.ok) return;
        const request = { id: idInput.value, options: parsed.value };
        void call('trigger #1', request, () =>
          backend().trigger(idInput.value, parsed.value as never),
        );
        void call('trigger #2', request, () =>
          backend().trigger(idInput.value, parsed.value as never),
        );
      }),
    ),
    el(
      'div',
      { class: 'bar' },
      field('master scale', masterInput),
      button(
        'setMasterScale',
        () =>
          void call('setMasterScale', { value: Number(masterInput.value) }, () => {
            backend().setMasterScale(Number(masterInput.value));
          }),
      ),
      field('max tier', tierSel),
      button('setMaxTier', () => {
        const tier = tierSel.value === 'none' ? null : (Number(tierSel.value) as 0 | 1 | 2 | 3);
        void call('setMaxTier', { tier }, () => {
          backend().setMaxTier(tier);
        });
      }),
      button(
        'backend.capabilities',
        () => void call('backend.capabilities', {}, () => backend().capabilities()),
      ),
      button('backend.stop', () => void call('backend.stop', {}, () => backend().stop())),
    ),
  );

  // resolvePad
  const hintArea = el('textarea', { id: 'gp-hint', rows: '3', cols: '48' });
  hintArea.value = '{ "vendorId": 1356, "productId": 616 }';
  const hintBar = el('div', { class: 'bar' });
  const presetHints = (): void => {
    const hints: [string, PadHint][] = [];
    const w = webPad();
    if (w) hints.push([`web ${w.index}`, { gamepad: { id: w.id, index: w.index } }]);
    for (const p of pads) {
      hints.push([`guid ${p.id}`, { guid: p.guid }]);
      hints.push([
        `vendor ${p.id}`,
        { vendorId: p.vendorId, productId: p.productId, ...(p.serial ? { serial: p.serial } : {}) },
      ]);
    }
    hintBar.replaceChildren(
      ...hints.map(([l, h]) => button(l, () => (hintArea.value = JSON.stringify(h)))),
    );
  };
  const resolveBox = el('div', {});
  resolveBox.append(
    el('h3', {}, 'resolvePad(pads, hint)'),
    el('div', { class: 'bar' }, button('Hints from the pads seen', presetHints)),
    hintBar,
    hintArea,
    el(
      'div',
      { class: 'bar' },
      button('resolvePad', () => {
        const parsed = parse('resolvePad', hintArea.value);
        if (!parsed.ok) return;
        void call('resolvePad', { hint: parsed.value, pads: pads.map((p) => p.id) }, async () => {
          await refreshPads('listPads (for resolvePad)');
          return guest.resolvePad(pads, parsed.value as PadHint);
        });
      }),
    ),
  );

  // Log tools
  const fallbackArea = el('textarea', { id: 'gp-fallback', rows: '6', cols: '48', readonly: '' });
  fallbackArea.hidden = true;
  async function copy(): Promise<void> {
    const json = JSON.stringify(
      {
        page: 'lieutenant-fizz player gamepad rumble',
        when: new Date().toISOString(),
        pluginVersion: __GAMEPAD_PLUGIN_VERSION__,
        userAgent: navigator.userAgent,
        pads,
        webPads: (navigator.getGamepads?.() ?? [])
          .filter((p): p is Gamepad => !!p)
          .map((p) => ({ index: p.index, id: p.id, vibrationActuator: !!p.vibrationActuator })),
        entries,
      },
      null,
      1,
    );
    try {
      await navigator.clipboard.writeText(json);
      fallbackArea.hidden = true;
      add({ kind: 'note', label: 'copied', result: `${json.length} characters on the clipboard` });
    } catch {
      fallbackArea.hidden = false;
      fallbackArea.value = json;
      fallbackArea.select();
      add({
        kind: 'note',
        label: 'copy failed',
        error: 'The clipboard refused; the JSON is in the box above the log.',
      });
    }
  }
  const tools = el(
    'div',
    { class: 'bar' },
    button('Copy gamepad log as JSON', () => void copy(), 'gp-copy'),
    button(
      'Clear gamepad log',
      () => {
        entries.length = 0;
        rows.clear();
        logBox.replaceChildren();
      },
      'gp-clear',
    ),
  );

  host.append(
    title,
    note,
    status,
    cueBox,
    raw,
    created,
    resolveBox,
    el('h3', {}, 'Gamepad log (calls and pad events)'),
    tools,
    fallbackArea,
    logBox,
  );

  // ----- Start -----

  describeWeb();
  addEventListener('gamepadconnected', describeWeb);
  addEventListener('gamepaddisconnected', describeWeb);
  void refreshPads('listPads (start)');
  const event = (kind: string) => (data: unknown) => {
    add({ kind: 'event', label: `pad ${kind}`, result: data });
    void refreshPads(`listPads (after ${kind})`);
  };
  void guest
    .onPadConnected(event('connected'))
    .catch((e) => add({ kind: 'note', label: 'onPadConnected', error: msg(e) }));
  void guest.onPadChanged(event('changed')).catch(() => {});
  void guest.onPadDisconnected(event('disconnected')).catch(() => {});

  if (opts.debug) {
    (window as unknown as { __lfGamepad: unknown }).__lfGamepad = {
      guest,
      call,
      entries,
      pads: () => pads,
      backend: engineBackend,
      guestBackend: backend,
      refreshPads,
    };
  }
}
