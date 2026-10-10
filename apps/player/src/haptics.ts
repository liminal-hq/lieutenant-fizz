// Haptics page: plays the game's real haptic cues through the Tauri haptics plugin and runs the plugin's smoke-test cases.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Imported first: ES modules evaluate in import order, so the log bridge is up before any other module loads.
import './haptics-log-boot';
import { isAppHost } from '@lieutenant-fizz/engine/lifecycle-policy';
import { STRENGTH_NAMES, STRENGTH_SCALE } from '@lieutenant-fizz/engine/haptic-strength';
import {
  pluginBackend,
  tauriInvoke,
  type PluginCaps,
  type PluginPlayResult,
  type PluginRecord,
  type PluginTier,
} from '@lieutenant-fizz/engine/haptic-plugin';
// The cue table is the game's own. The app reads it from the episode's source (the app is the host
// that will load episodes, so this direction is allowed; the episode never imports from the app).
import { FIZZ_HAPTICS } from '../../../episodes/episode-1/src/haptics/fizz-haptics';
import { hapticLabItems } from '../../../episodes/episode-1/src/haptics/lab';
import {
  SMOKE_CASES,
  missingPrimitive,
  readEngine,
  readUserAgent,
  unsupportedEffect,
  type Outcome,
  type RawCall,
  type Verdict,
} from './haptics-cases';

declare const __HAPTICS_PLUGIN_REV__: string;

const UI_KINDS = ['confirm', 'reject', 'tick', 'toggle-on', 'toggle-off', 'drag-start'] as const;

const backend = pluginBackend();
let strength = 3; // Strong, as the game's default
let tierCap: PluginTier | null = null;
let caps: PluginCaps | null = null;

interface Entry {
  at: string;
  kind: 'cue' | 'ui' | 'smoke' | 'stop';
  label: string;
  note?: string;
  scale?: number;
  maxTier?: number | null;
  /** The pattern compiled for the plugin: tier, downgrade and reasons. */
  plan?: { tier: number; downgraded: boolean; reasons: string[]; ms: number };
  /** What `play()` answered straight away. */
  estimate?: unknown;
  calls: Outcome[];
  verdict?: Verdict;
}

const entries: Entry[] = [];
const els = new Map<Entry, HTMLElement>();
const byPlan = new WeakMap<object, Entry>();
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// ---------- Log ----------

function resultLine(o: Outcome): string {
  if (o.error !== undefined) return `rejected: ${o.error}`;
  const r = o.result;
  if (!r) return 'waiting…';
  return [
    `tier ${r.tier}`,
    r.downgraded ? 'downgraded' : '',
    r.policy ? `policy ${r.policy}` : '',
    `~${r.estimatedMs} ms`,
    r.reason ? `(${r.reason})` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function paint(e: Entry): void {
  let div = els.get(e);
  if (!div) {
    div = document.createElement('div');
    div.className = 'entry';
    els.set(e, div);
    $('log').prepend(div);
  }
  const lines = e.calls.map(resultLine);
  if (e.calls.length === 0 && e.plan)
    lines.push(`tier ${e.plan.tier} ${e.plan.reasons.join(' · ')}`);
  const head = document.createElement('div');
  const tag = document.createElement('b');
  tag.textContent = e.label;
  head.append(tag, ` ${e.at}`);
  if (e.verdict) {
    const v = document.createElement('span');
    v.className = e.verdict;
    v.textContent = e.verdict === 'ok' ? ' as expected' : ' CHECK';
    head.append(v);
  }
  const body = document.createElement('div');
  body.textContent = [e.note, ...lines].filter(Boolean).join('\n');
  body.style.whiteSpace = 'pre-wrap';
  const det = document.createElement('details');
  const sum = document.createElement('summary');
  sum.textContent = 'request';
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(
    { scale: e.scale, maxTier: e.maxTier, plan: e.plan, estimate: e.estimate, calls: e.calls },
    null,
    1,
  );
  det.append(sum, pre);
  div.replaceChildren(head, body, det);
}

function addEntry(e: Omit<Entry, 'at' | 'calls'> & { calls?: Outcome[] }): Entry {
  const entry: Entry = { at: new Date().toISOString().slice(11, 23), calls: [], ...e };
  entries.push(entry);
  if (entries.length > 200) {
    const old = entries.shift();
    if (old) {
      els.get(old)?.remove();
      els.delete(old);
    }
  }
  paint(entry);
  return entry;
}

// Each play settles later: the backend says which plan the answer belongs to.
backend.onResult((r: PluginRecord) => {
  const entry = byPlan.get(r.plan);
  if (!entry) return;
  const call = entry.calls[0];
  if (call) {
    if (r.result) call.result = r.result;
    if (r.error !== undefined) call.error = r.error;
  }
  paint(entry);
});

// ---------- Playing ----------

async function raw(call: RawCall): Promise<Outcome> {
  const out: Outcome = { call };
  try {
    out.result = (await tauriInvoke(call.cmd, call.args)) as PluginPlayResult;
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return out;
}

function playCue(id: string): void {
  const cue = FIZZ_HAPTICS.cues[id];
  if (!cue) return;
  const scale = STRENGTH_SCALE[strength] ?? 1;
  const estimate = backend.play(cue.pattern, scale);
  const rec = estimate.ok ? backend.lastResult() : null;
  const entry = addEntry({
    kind: 'cue',
    label: `cue ${id}`,
    scale,
    maxTier: tierCap,
    plan: rec ? { ...rec.plan, tier: rec.plan.tier } : undefined,
    estimate,
    calls: rec?.plan.call ? [{ call: rec.plan.call }] : [],
    ...(estimate.ok ? {} : { note: `not played: ${estimate.reason ?? 'unavailable'}` }),
  });
  if (rec && rec.plan.call) {
    byPlan.set(rec.plan, entry);
    entry.note = `compiled to tier ${rec.plan.tier}${rec.plan.reasons.length ? `: ${rec.plan.reasons.join(' · ')}` : ''}`;
  } else if (rec && estimate.ok)
    entry.note = rec.plan.reasons.join(' · ') || 'nothing to play at this strength';
  paint(entry);
}

async function playUi(kind: string): Promise<void> {
  const entry = addEntry({
    kind: 'ui',
    label: `ui ${kind}`,
    calls: [{ call: { cmd: 'plugin:haptics|ui', args: { kind } } }],
  });
  entry.calls[0] = await raw({ cmd: 'plugin:haptics|ui', args: { kind } });
  paint(entry);
}

async function stopAll(): Promise<void> {
  backend.stop();
  const entry = addEntry({ kind: 'stop', label: 'stop', calls: [] });
  entry.calls = [await raw({ cmd: 'plugin:haptics|stop' })];
  paint(entry);
}

async function runSmoke(id: number): Promise<void> {
  const c = SMOKE_CASES.find((x) => x.id === id);
  if (!c) return;
  const notes: string[] = [];
  if (id === 5 && !unsupportedEffect(caps).found)
    notes.push('No predefined effect is reported unsupported here, so heavy_click was used.');
  if (id === 6 && !missingPrimitive(caps).found)
    notes.push('Every primitive tried is reported supported, so slow_rise was used.');
  const calls = c.calls(caps);
  const entry = addEntry({
    kind: 'smoke',
    label: `case ${id}: ${c.title}`,
    note: [c.expect, ...notes].join('\n'),
    calls: calls.map((call) => ({ call })),
  });
  const done: Outcome[] = [];
  for (const call of calls) {
    done.push(await raw(call));
    entry.calls = [...done, ...calls.slice(done.length).map((x) => ({ call: x }))];
    paint(entry);
  }
  entry.verdict = c.verdict(done);
  paint(entry);
}

interface GuestApi {
  capabilities(): Promise<unknown>;
  register(id: string, pattern: unknown): Promise<unknown>;
  trigger(id: string): Promise<PluginPlayResult>;
  unregister(id: string): void;
}

async function runGuest(): Promise<void> {
  const label = 'case 9: Registered patterns (JS guest)';
  const expect =
    'Register a 400 ms drop-if-busy pattern and trigger it twice at once: the second is tier 0 with policy "dropped".';
  const w = window as unknown as { __TAURI__?: { haptics?: GuestApi } };
  const g = w.__TAURI__?.haptics;
  if (!g) {
    addEntry({
      kind: 'smoke',
      label,
      verdict: 'check',
      note: `${expect}\nwindow.__TAURI__.haptics is missing (${
        w.__TAURI__
          ? 'window.__TAURI__ exists, so the plugin script was not injected'
          : 'window.__TAURI__ is missing, so withGlobalTauri is off in this build'
      }). The dev config sets withGlobalTauri; the release one does not.`,
    });
    return;
  }
  const entry = addEntry({ kind: 'smoke', label, note: expect });
  const pattern = {
    format: 'haptics-lab/pattern@1',
    policy: 'drop-if-busy',
    events: [{ type: 'continuous', at: 0, duration: 400, intensity: 0.6, sharpness: 0.5 }],
  };
  const outs: Outcome[] = [];
  const track = async (name: string, f: () => Promise<unknown>): Promise<Outcome> => {
    const o: Outcome = { call: { cmd: `guest:${name}` } };
    try {
      o.result = (await f()) as PluginPlayResult;
    } catch (err) {
      o.error = err instanceof Error ? err.message : String(err);
    }
    return o;
  };
  outs.push(await track('register', () => g.register('smoke-drop', pattern)));
  const [a, b] = await Promise.all([
    track('trigger#1', () => g.trigger('smoke-drop')),
    track('trigger#2', () => g.trigger('smoke-drop')),
  ]);
  outs.push(a, b);
  g.unregister('smoke-drop');
  entry.calls = outs;
  entry.verdict = b.result?.tier === 0 && b.result.policy === 'dropped' ? 'ok' : 'check';
  paint(entry);
}

// ---------- Page ----------

function button(label: string, onClick: () => void, sub?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (sub) {
    b.className = 'case';
    const s = document.createElement('small');
    s.textContent = sub;
    b.append(s);
  }
  b.addEventListener('click', onClick);
  return b;
}

function segment(
  host: HTMLElement,
  labels: string[],
  selected: () => number,
  pick: (i: number) => void,
): void {
  const paintSeg = (): void =>
    [...host.children].forEach((c, i) => c.setAttribute('aria-pressed', String(i === selected())));
  labels.forEach((l, i) =>
    host.append(
      button(l, () => {
        pick(i);
        paintSeg();
      }),
    ),
  );
  paintSeg();
}

function section(title: string): { box: HTMLElement; grid: HTMLElement } {
  const h = document.createElement('h2');
  h.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'grid';
  $('main').append(h, grid);
  return { box: h, grid };
}

function buildMain(): void {
  const lanes = Object.keys(FIZZ_HAPTICS.cues);
  for (const g of hapticLabItems(lanes)) {
    const { grid } = section(`Cues: ${g.title}`);
    for (const item of g.items) grid.append(button(item.label, () => playCue(item.id)));
  }
  const ui = section('UI lane (the system’s own feedback, plugin:haptics|ui)');
  for (const k of UI_KINDS) ui.grid.append(button(k, () => void playUi(k)));

  const smoke = section('Plugin smoke tests');
  smoke.grid.classList.add('wide');
  for (const c of SMOKE_CASES)
    smoke.grid.append(
      button(`${c.id}. ${c.title}`, () => void runSmoke(c.id), c.expect.split('. ')[0]),
    );
  smoke.grid.append(
    button('9. Registered patterns', () => void runGuest(), 'JS guest: window.__TAURI__.haptics'),
  );
}

function describeCaps(c: PluginCaps | null, why?: string): void {
  const box = $('caps');
  const ua = readUserAgent(navigator.userAgent);
  const items: [string, string][] = [
    ['plugin', __HAPTICS_PLUGIN_REV__.slice(0, 7)],
    ['in the app', String(isAppHost(window))],
    ['device', c?.device ? `${c.device.manufacturer} ${c.device.model}` : (ua.model ?? '?')],
  ];
  // Android only: the release and API level mean nothing on a desktop (the plugin reports `linux` there).
  const android = c?.device?.release ?? ua.android;
  if (android || c?.sdkInt !== undefined) {
    items.push(
      ['Android', android ?? '?'],
      ['API', c?.sdkInt !== undefined ? String(c.sdkInt) : '?'],
    );
  }
  const engine = readEngine(navigator.userAgent);
  items.push([engine.name, engine.version ?? '?']);
  if (c) {
    const prims = Object.entries(c.primitives)
      .filter(([, v]) => v?.supported)
      .map(([k]) => k);
    items.push(
      ['vibrator', String(c.hasVibrator)],
      ['amplitude control', String(c.hasAmplitudeControl)],
      ['primitives', prims.length ? prims.join(' ') : 'none'],
      ['envelope', String(c.envelopeSupported)],
      ['topTier', String(c.topTier)],
    );
    if (c.touchFeedbackEnabled !== undefined)
      items.push(['touch feedback', String(c.touchFeedbackEnabled)]);
  } else items.push(['capabilities', why ?? 'unavailable']);
  box.replaceChildren(
    ...items.map(([k, v]) => {
      const s = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = v;
      s.append(`${k} `, b);
      return s;
    }),
  );
}

async function copyLog(): Promise<void> {
  const ua = readUserAgent(navigator.userAgent);
  const json = JSON.stringify(
    {
      page: 'lieutenant-fizz player haptics',
      when: new Date().toISOString(),
      pluginRev: __HAPTICS_PLUGIN_REV__,
      inApp: isAppHost(window),
      userAgent: navigator.userAgent,
      device: { ...ua, ...(caps?.device ?? {}), sdkInt: caps?.sdkInt },
      capabilities: caps,
      masterStrength: STRENGTH_NAMES[strength],
      tierCap,
      entries,
    },
    null,
    1,
  );
  const fb = $<HTMLTextAreaElement>('fallback');
  try {
    await navigator.clipboard.writeText(json);
    fb.hidden = true;
    addEntry({ kind: 'stop', label: 'copied', note: `${json.length} characters on the clipboard` });
  } catch {
    fb.hidden = false;
    fb.value = json;
    fb.select();
    addEntry({
      kind: 'stop',
      label: 'copy failed',
      note: 'The clipboard refused; the JSON is in the box above the log.',
    });
  }
}

segment(
  $('strength'),
  STRENGTH_NAMES.slice(1) as string[],
  () => strength - 1,
  (i) => (strength = i + 1),
);
segment(
  $('tiercap'),
  ['Auto', '0', '1', '2', '3', '4'],
  () => (tierCap === null ? 0 : tierCap + 1),
  (i) => {
    tierCap = i === 0 ? null : ((i - 1) as PluginTier);
    backend.setMaxTier(tierCap);
  },
);
$('btn-stop').addEventListener('click', () => void stopAll());
$('btn-copy').addEventListener('click', () => void copyLog());
$('btn-clear').addEventListener('click', () => {
  entries.length = 0;
  els.clear();
  $('log').replaceChildren();
});
buildMain();
void backend.ready.then((c) => {
  caps = c;
  describeCaps(c, backend.caps().reason);
});
