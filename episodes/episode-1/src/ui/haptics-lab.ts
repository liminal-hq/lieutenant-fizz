// The haptics lab: a ?debug overlay for feeling cues on the phone and a controller, editing them and tuning the compilers.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { PlayResult } from '@lieutenant-fizz/engine/haptic-backends';
import type { HapticCue, HapticPattern } from '@lieutenant-fizz/engine/haptic-pattern';
import type { PlayRecord, Route, Target } from '@lieutenant-fizz/engine/haptics';
import { formatValue, inputAttrs, snap, type SliderSpec } from '../audio/lab';
import {
  COMPILE_SLIDERS,
  CUE_SLIDERS,
  HAPTICS_DEFAULTS,
  LAB_STRENGTH,
  MAX_DRAFT_EVENTS,
  POLICY_KINDS,
  backendOptions,
  coalesceWindow,
  compareRun,
  compileBoth,
  compiledLabel,
  countHapticChanges,
  eventSliders,
  floorLadder,
  hapticTuneDiff,
  hapticTuneJson,
  labStatus,
  type RumbleProfile,
  newDraft,
  patternOf,
  phoneArrayText,
  pickTarget,
  policyKind,
  policyOf,
  scaleRun,
  timeline,
  draftsOf,
  type BackendCaps,
  type BackendChoice,
  type Bar,
  type CueGroup,
  type EventDraft,
  type HapticsLabState,
  type HapticsTunePatch,
  type Step,
} from '../haptics/lab';
import type { LabShell } from './lab-shell';

/** What the lab needs from the game. The game owns every haptics call; the lab only holds the controls. */
export interface HapticsLabHost {
  groups: CueGroup[];
  /** The cues, compiler constants and budget as they are now. */
  state(): HapticsLabState;
  /** Which rumble profile the pad in use plays (`boost` or `plain`), or null when it plays the plain compile. */
  padProfile?(): 'boost' | 'plain' | null;
  tune(patch: HapticsTunePatch): { applied: string[]; refused: string[] };
  audition(p: HapticPattern, target: Target, scale: number): PlayResult | null;
  caps(): BackendCaps;
  route(): Route;
  /** Whether the page has had a tap, or null when the browser does not say. */
  tapped(): boolean | null;
  last(): PlayRecord | undefined;
  copy(text: string): Promise<boolean>;
}

type TabId = 'cues' | 'tune' | 'compare' | 'compile';

const TABS: [TabId, string][] = [
  ['cues', 'Cues'],
  ['tune', 'Tune'],
  ['compare', 'Compare'],
  ['compile', 'Compile'],
];

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text = '',
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

/** The patch that sets one Compile slider: `compile.floor` becomes `{ compile: { floor } }`. */
function compilePatch(spec: SliderSpec, value: number): HapticsTunePatch {
  const [root, key] = spec.path as [string, string];
  return { [root]: { [key]: value } } as HapticsTunePatch;
}

/** The number at a Compile slider's path in the state. */
function compileValue(state: HapticsLabState, spec: SliderSpec): number {
  const [root, key] = spec.path as [keyof HapticsLabState, string];
  return (state[root] as unknown as Record<string, number>)[key] ?? 0;
}

/**
 * The haptics lab's overlay. Like the sound lab it is in the page only while open, shares its `#lab`
 * layout and styles, and is reached from the shell's Lab button or the Sound | Haptics switch.
 */
export class HapticsLab {
  /** The profile to compile the pad's segments with: the one the pad in use plays, with the lab's constants. */
  private padProfile(state: HapticsLabState): RumbleProfile | undefined {
    const kind = this.h.padProfile?.();
    return kind === 'boost'
      ? { kind, boost: state.boost }
      : kind === 'plain'
        ? { kind, plain: state.plain }
        : undefined;
  }

  readonly root: HTMLElement;
  private readonly switcher: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private readonly sections = new Map<TabId, HTMLElement>();
  private readonly backendButtons = new Map<BackendChoice, HTMLButtonElement>();
  private readonly copyBtn: HTMLButtonElement;
  private readonly status = el('div', { class: 'lab-status' });
  private readonly cueButtons = new Map<string, HTMLButtonElement>();
  private readonly tuneHost = el('div');
  private readonly compareNote = el('div', { class: 'lab-status' });
  private readonly pickers: HTMLSelectElement[] = [];
  private readonly compileSyncs: (() => void)[] = [];
  private backend: BackendChoice = 'auto';
  private strength = 1;
  private picked = 'jump';
  private drafts: EventDraft[] = [];
  private timers: number[] = [];
  private timer = 0;
  /** Escape closes the lab and goes no further, so it does not also pause the game underneath. */
  private readonly onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    this.close();
  };

  constructor(
    private readonly h: HapticsLabHost,
    private readonly shell: LabShell,
  ) {
    this.root = el('div', { id: 'lab', class: 'lf lf-panel lab-haptics', hidden: '' });
    this.switcher = shell.switcher('haptics');
    // Arrow keys and Space move sliders and press buttons here; they must not reach the game's input.
    for (const type of ['keydown', 'keyup'] as const) {
      this.root.addEventListener(type, (e) => e.stopPropagation());
    }
    const first = h.groups[0]?.items[0]?.id;
    if (first && !h.state().cues[this.picked]) this.picked = first;

    const head = el('div', { class: 'lab-head' });
    head.append(el('b', {}, 'Haptics lab'), this.switcher);
    const backends = el('div', { class: 'lab-row' });
    for (const choice of ['auto', 'phone', 'controller', 'off'] as const) {
      const b = el('button', { 'aria-pressed': 'false' }, '');
      b.addEventListener('click', () => {
        this.backend = choice;
        this.refreshHead();
      });
      this.backendButtons.set(choice, b);
      backends.append(b);
    }
    const strength = this.rawSlider(LAB_STRENGTH, this.strength, (v) => {
      this.strength = v;
    });
    strength.classList.add('lab-inline');
    this.copyBtn = el('button', {}, 'Copy as JSON');
    this.copyBtn.addEventListener('click', () => void this.copy());
    const reset = el('button', {}, 'Reset to defaults');
    reset.addEventListener('click', () => this.reset());
    const close = el('button', {}, 'Close');
    close.addEventListener('click', () => this.close());
    head.append(backends, strength, this.copyBtn, reset, close);

    const tabs = el('div', { class: 'lab-row lab-tabs', role: 'tablist' });
    for (const [id, label] of TABS) {
      const b = el('button', { role: 'tab' }, label);
      b.addEventListener('click', () => this.show(id));
      this.tabButtons.set(id, b);
      tabs.append(b);
    }
    this.body = el('div', { class: 'lab-body' });
    this.root.append(head, this.status, tabs, this.body);
    this.sections.set('cues', this.buildCues());
    this.sections.set('tune', this.buildTune());
    this.sections.set('compare', this.buildCompare());
    this.sections.set('compile', this.buildCompile());
    for (const s of this.sections.values()) this.body.append(s);
    this.show('cues');
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    this.shell.shown('haptics', this.root);
    this.refresh();
    this.timer = window.setInterval(() => this.refreshStatus(), 500);
    window.addEventListener('keydown', this.onEscape, true);
  }

  close(): void {
    this.cancelRun();
    this.root.hidden = true;
    this.shell.hidden(this.root);
    window.clearInterval(this.timer);
    window.removeEventListener('keydown', this.onEscape, true);
  }

  /** Closes the lab, puts every tuned value back and takes its overlay out of the page. */
  dispose(): void {
    this.close();
    this.reset();
    this.shell.release(this.switcher);
    this.root.remove();
  }

  show(tab: TabId): void {
    for (const [id, s] of this.sections) s.hidden = id !== tab;
    for (const [id, b] of this.tabButtons) b.setAttribute('aria-selected', String(id === tab));
    this.body.scrollTop = 0;
    if (tab === 'tune') this.rebuildTune();
    this.refreshCues();
  }

  // ----- Playing -----

  private caps(): BackendCaps {
    return this.h.caps();
  }

  /** The target an audition goes to now, or null (with a note) when nowhere can play. */
  private target(): Target | null {
    const t = pickTarget(this.backend, this.h.route(), this.caps());
    if (t === null) {
      this.compareNote.textContent =
        this.backend === 'off'
          ? 'Backend is Off: nothing plays.'
          : 'Nothing can play here: see the line under the title.';
    }
    return t;
  }

  private play(p: HapticPattern, scaleBy = 1): void {
    const t = this.target();
    if (t) this.h.audition(p, t, this.strength * scaleBy);
    this.refreshStatus();
    this.refreshCues();
  }

  private cancelRun(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }

  /** Plays a timed run, announcing each step in the note, and stops any run already going. */
  private run(steps: Step[], name: string): void {
    this.cancelRun();
    if (steps.length === 0) return;
    this.compareNote.textContent = `${name}: ${steps.length} plays`;
    steps.forEach((s, k) => {
      this.timers.push(
        window.setTimeout(() => {
          this.h.audition(s.pattern, s.target, s.scale * this.strength);
          this.compareNote.textContent = `${name}: ${s.label} (${k + 1} of ${steps.length})`;
          this.refreshStatus();
        }, s.at),
      );
    });
    const end = steps[steps.length - 1]!.at + 500;
    this.timers.push(
      window.setTimeout(() => {
        this.compareNote.textContent = `${name}: done`;
      }, end),
    );
  }

  // ----- Header -----

  private refreshHead(): void {
    const options = backendOptions(this.caps());
    if (!options.find((o) => o.choice === this.backend)?.enabled) this.backend = 'off';
    for (const o of options) {
      const b = this.backendButtons.get(o.choice);
      if (!b) continue;
      b.textContent = o.label;
      b.disabled = !o.enabled;
      b.title = o.reason ?? '';
      b.setAttribute('aria-pressed', String(o.choice === this.backend));
    }
  }

  private refreshStatus(): void {
    this.status.textContent = labStatus({
      caps: this.caps(),
      choice: this.backend,
      tapped: this.h.tapped(),
      last: this.h.last(),
    });
    this.refreshHead();
  }

  private refreshCount(): void {
    const n = countHapticChanges(hapticTuneDiff(HAPTICS_DEFAULTS, this.h.state()));
    this.copyBtn.textContent = n > 0 ? `Copy as JSON (${n} changed)` : 'Copy as JSON';
  }

  private async copy(): Promise<void> {
    const text = hapticTuneJson(hapticTuneDiff(HAPTICS_DEFAULTS, this.h.state()));
    const ok = await this.h.copy(text);
    this.copyBtn.textContent = ok ? 'Copied' : 'Copy failed: see the console';
    if (!ok) console.log(text);
    window.setTimeout(() => this.refreshCount(), 1500);
  }

  private reset(): void {
    this.cancelRun();
    this.h.tune(hapticTuneDiff(this.h.state(), HAPTICS_DEFAULTS));
    this.refresh();
  }

  /** Brings every control in line with the game: head, cue labels, the edited cue, slider values. */
  refresh(): void {
    this.refreshStatus();
    this.refreshCount();
    this.refreshCues();
    this.rebuildTune();
    for (const s of this.compileSyncs) s();
  }

  // ----- Cues tab -----

  private group(title: string, ...children: HTMLElement[]): HTMLElement {
    const g = el('section', { class: 'lab-group' });
    g.append(el('h4', {}, title), ...children);
    return g;
  }

  private buildCues(): HTMLElement {
    const s = el('div');
    for (const g of this.h.groups) {
      const grid = el('div', { class: 'lab-grid lab-cues' });
      for (const item of g.items) {
        const b = el('button', { 'aria-pressed': 'false' });
        b.append(el('span', { class: 'lab-name' }, item.label), el('span', { class: 'lab-sub' }));
        b.addEventListener('click', () => {
          this.picked = item.id;
          const cue = this.h.state().cues[item.id];
          if (cue) this.play(cue.pattern);
        });
        this.cueButtons.set(item.id, b);
        grid.append(b);
      }
      s.append(this.group(g.title, grid));
    }
    return s;
  }

  /** Each cue button's compiled length, for the strength in the lab, and the picked cue marked. */
  private refreshCues(): void {
    const state = this.h.state();
    for (const [id, b] of this.cueButtons) {
      const cue = state.cues[id];
      const sub = b.querySelector('.lab-sub');
      if (cue && sub) {
        sub.textContent = compiledLabel(
          compileBoth(
            cue.pattern,
            this.strength,
            state.compile,
            state.rumble,
            this.padProfile(state),
          ),
        );
      }
      b.setAttribute('aria-pressed', String(id === this.picked));
    }
    for (const p of this.pickers) p.value = this.picked;
  }

  // ----- Cue picker shared by Tune and Compare -----

  private picker(onPick: () => void): HTMLElement {
    const label = el('label', { class: 'lab-pick' });
    const select = el('select');
    for (const g of this.h.groups) {
      const og = el('optgroup', { label: g.title });
      for (const item of g.items) {
        const o = el('option', { value: item.id });
        o.textContent = item.label;
        og.append(o);
      }
      select.append(og);
    }
    select.value = this.picked;
    select.addEventListener('change', () => {
      this.picked = select.value;
      this.refreshCues();
      onPick();
    });
    this.pickers.push(select);
    label.append(el('span', {}, 'Cue'), select);
    return label;
  }

  private cue(): HapticCue | undefined {
    return this.h.state().cues[this.picked];
  }

  // ----- Tune tab -----

  private buildTune(): HTMLElement {
    const s = el('div');
    s.append(
      this.picker(() => this.rebuildTune()),
      this.tuneHost,
    );
    return s;
  }

  private rebuildTune(): void {
    const cue = this.cue();
    this.tuneHost.replaceChildren();
    if (!cue) return;
    this.drafts = draftsOf(cue.pattern);
    const preview = el('div', { class: 'lab-preview' });
    const host = this.tuneHost;

    const apply = (): void => {
      const now = this.cue();
      if (!now) return;
      const pattern = patternOf(this.drafts, now.pattern);
      this.h.tune({
        cues: {
          [this.picked]: {
            events: pattern.events,
            priority: now.priority,
            cooldownMs: now.cooldownMs,
            policy: now.policy,
          },
        },
      });
      this.refreshCount();
      this.refreshCues();
      drawPreview();
    };
    const applyCue = (
      patch: Partial<Pick<HapticCue, 'priority' | 'cooldownMs' | 'policy'>>,
    ): void => {
      const now = this.cue();
      if (!now) return;
      this.h.tune({
        cues: {
          [this.picked]: {
            events: now.pattern.events,
            priority: patch.priority ?? now.priority,
            cooldownMs: patch.cooldownMs ?? now.cooldownMs,
            policy: patch.policy ?? now.policy,
          },
        },
      });
      this.refreshCount();
    };

    const drawPreview = (): void => {
      const state = this.h.state();
      const now = state.cues[this.picked];
      if (!now) return;
      const c = compileBoth(
        now.pattern,
        this.strength,
        state.compile,
        state.rumble,
        this.padProfile(state),
      );
      const t = timeline(c);
      preview.replaceChildren(
        el('div', { class: 'lab-status' }, `phone ${phoneArrayText(c.phone)}`),
        this.bars(t.phone, t.totalMs, 'phone'),
        el(
          'div',
          { class: 'lab-status' },
          c.pad.length > 0
            ? `pad ${c.pad.map((p) => `${p.duration} ms low ${p.strong} high ${p.weak}`).join(' · ')}`
            : 'pad silent',
        ),
        this.bars(t.pad, t.totalMs, 'pad'),
      );
    };

    const rebuildEvents = (): void => {
      eventsHost.replaceChildren();
      this.drafts.forEach((d, i) => {
        const card = el('section', { class: 'lab-group lab-event' });
        const bar = el('div', { class: 'lab-row' });
        for (const kind of ['tap', 'hum'] as const) {
          const b = el(
            'button',
            { 'aria-pressed': String(d.kind === kind) },
            kind === 'tap' ? 'Tap' : 'Hum',
          );
          b.addEventListener('click', () => {
            this.drafts[i] = { ...d, kind };
            apply();
            rebuildEvents();
          });
          bar.append(b);
        }
        const remove = el('button', { 'aria-label': `Remove event ${i + 1}` }, 'Remove');
        remove.disabled = this.drafts.length <= 1;
        remove.addEventListener('click', () => {
          this.drafts.splice(i, 1);
          apply();
          rebuildEvents();
        });
        bar.append(remove);
        const sliders = el('div', { class: 'lab-sliders' });
        for (const spec of eventSliders(d.kind)) {
          const key = spec.path[0] as keyof EventDraft;
          sliders.append(
            this.valueSlider(spec, d[key] as number, (v) => {
              (this.drafts[i] as unknown as Record<string, number>)[key] = v;
              apply();
            }),
          );
        }
        card.append(el('h4', {}, `Event ${i + 1}`), bar, sliders);
        eventsHost.append(card);
      });
      const add = el('div', { class: 'lab-row' });
      if (this.drafts.length < MAX_DRAFT_EVENTS) {
        for (const kind of ['tap', 'hum'] as const) {
          const b = el('button', {}, kind === 'tap' ? 'Add a tap' : 'Add a hum');
          b.addEventListener('click', () => {
            const last = this.drafts[this.drafts.length - 1];
            this.drafts.push(newDraft(kind, last ? last.at + 60 : 0));
            apply();
            rebuildEvents();
          });
          add.append(b);
        }
      }
      eventsHost.append(add);
    };

    const eventsHost = el('div');
    const play = el('div', { class: 'lab-row' });
    const playBtn = el('button', {}, 'Play');
    playBtn.addEventListener('click', () => {
      const now = this.cue();
      if (now) this.play(now.pattern);
    });
    const origBtn = el('button', {}, 'Play original');
    origBtn.addEventListener('click', () => {
      const was = HAPTICS_DEFAULTS.cues[this.picked];
      if (was) this.play(was.pattern);
    });
    play.append(playBtn, origBtn);

    // Cue-level limits: cooldown, priority and policy.
    const limits = el('div', { class: 'lab-sliders' });
    for (const spec of CUE_SLIDERS) {
      const key = spec.path[0] as 'cooldownMs' | 'priority';
      limits.append(
        this.valueSlider(spec, cue[key], (v) =>
          applyCue(
            key === 'priority' ? { priority: v as HapticCue['priority'] } : { cooldownMs: v },
          ),
        ),
      );
    }
    const policy = el('div', { class: 'lab-row' });
    const windowHost = el('div');
    const drawWindow = (): void => {
      windowHost.replaceChildren();
      const now = this.cue();
      if (now && typeof now.policy === 'object') {
        windowHost.append(
          this.valueSlider(
            {
              ...CUE_SLIDERS[0]!,
              id: 'coalesce',
              label: 'Coalesce window',
              min: 10,
              max: 500,
              step: 10,
            },
            coalesceWindow(now.policy),
            (v) => applyCue({ policy: policyOf('coalesce', v) }),
          ),
        );
      }
    };
    const policyButtons: [string, HTMLButtonElement][] = POLICY_KINDS.map((kind) => {
      const b = el('button', { 'aria-pressed': String(policyKind(cue.policy) === kind) }, kind);
      b.addEventListener('click', () => {
        const now = this.cue();
        applyCue({ policy: policyOf(kind, now ? coalesceWindow(now.policy) : 60) });
        for (const [k, pb] of policyButtons) pb.setAttribute('aria-pressed', String(k === kind));
        drawWindow();
      });
      policy.append(b);
      return [kind, b];
    });
    drawWindow();

    rebuildEvents();
    drawPreview();
    host.append(
      this.group('Events (up to six)', eventsHost),
      this.group('Cue', limits, policy, windowHost),
      this.group('Preview', preview, play),
    );
  }

  /** Bars on a track for a preview: positions and widths are shares of the longest of the two targets. */
  private bars(list: Bar[], total: number, kind: 'phone' | 'pad'): HTMLElement {
    const track = el('div', { class: `lab-track ${kind}` });
    for (const b of list) {
      const bar = el('i');
      bar.style.left = `${(b.at / total) * 100}%`;
      bar.style.width = `${Math.max(0.5, (b.len / total) * 100)}%`;
      bar.style.opacity = String(0.35 + 0.65 * Math.min(1, b.level));
      track.append(bar);
    }
    return track;
  }

  // ----- Compare tab -----

  private buildCompare(): HTMLElement {
    const s = el('div');
    const btn = (label: string, fn: () => void): HTMLButtonElement => {
      const b = el('button', {}, label);
      b.addEventListener('click', fn);
      return b;
    };
    const targets = (): Target[] => {
      const c = this.caps();
      const out: Target[] = [];
      if (c.device.available) out.push('device');
      if (c.controller.available) out.push('controller');
      return out;
    };
    const withCue = (fn: (p: HapticPattern) => void) => (): void => {
      const cue = this.cue();
      if (cue) fn(cue.pattern);
    };
    const ladder = (t: Target): void => {
      if (!this.caps()[t === 'device' ? 'device' : 'controller'].available) {
        this.compareNote.textContent = `${t === 'device' ? 'Phone' : 'Pad'} cannot play here.`;
        return;
      }
      this.run(floorLadder(t), 'Floor ladder');
    };
    const row1 = el('div', { class: 'lab-row' });
    row1.append(
      btn(
        'Phone then controller ×3',
        withCue((p) => {
          const t = targets();
          if (t.length === 0) this.compareNote.textContent = 'Nothing can play here.';
          else this.run(compareRun(p, 1, t), 'Compare');
        }),
      ),
    );
    const row2 = el('div', { class: 'lab-row' });
    row2.append(
      btn(
        'Phone at 0.5, 0.75, 1.0',
        withCue((p) => this.run(scaleRun(p, 'device'), 'Phone strengths')),
      ),
      btn(
        'Controller at 0.5, 0.75, 1.0',
        withCue((p) => this.run(scaleRun(p, 'controller'), 'Controller strengths')),
      ),
    );
    const row3 = el('div', { class: 'lab-row' });
    row3.append(
      btn('Phone floor ladder', () => ladder('device')),
      btn('Controller floor ladder', () => ladder('controller')),
    );
    const stop = btn('Stop', () => {
      this.cancelRun();
      this.compareNote.textContent = 'Stopped.';
    });
    s.append(
      this.picker(() => {}),
      this.group('Side by side', row1),
      this.group('Strength', row2),
      this.group('Floor ladder', row3),
      el(
        'div',
        { class: 'lab-status' },
        'Taps from 0.1 to 1.0, one every 400 ms. Where you stop feeling them is where FLOOR belongs.',
      ),
      this.compareNote,
      stop,
    );
    return s;
  }

  // ----- Compile tab -----

  private buildCompile(): HTMLElement {
    const s = el('div');
    const groups = new Map<string, HTMLElement>();
    for (const spec of COMPILE_SLIDERS) {
      let host = groups.get(spec.group);
      if (!host) {
        host = el('div', { class: 'lab-sliders' });
        groups.set(spec.group, host);
      }
      host.append(this.compileSlider(spec));
    }
    for (const [title, host] of groups) s.append(this.group(title, host));
    const note = el('div', { class: 'lab-status' });
    const redraw = (): void => {
      const state = this.h.state();
      const cue = state.cues[this.picked];
      note.textContent = cue
        ? `${this.picked}: ${compiledLabel(compileBoth(cue.pattern, this.strength, state.compile, state.rumble, this.padProfile(state)))}`
        : '';
    };
    this.compileSyncs.push(redraw);
    s.append(this.group('The picked cue now', this.picker(redraw), note));
    return s;
  }

  private compileSlider(spec: SliderSpec): HTMLElement {
    const row = this.valueSlider(spec, compileValue(this.h.state(), spec), (v) => {
      this.h.tune(compilePatch(spec, v));
      this.refreshCount();
      this.refreshCues();
      for (const s of this.compileSyncs) s();
    });
    const input = row.querySelector('input') as HTMLInputElement;
    const out = row.querySelector('b') as HTMLElement;
    this.compileSyncs.push(() => {
      const v = compileValue(this.h.state(), spec);
      input.value = String(v);
      out.textContent = formatValue(spec, v);
    });
    return row;
  }

  // ----- Sliders -----

  private valueSlider(spec: SliderSpec, value: number, set: (v: number) => void): HTMLElement {
    const row = el('label', { class: 'lab-slider' });
    const out = el('b', {}, formatValue(spec, value));
    const a = inputAttrs(spec);
    const input = el('input', {
      type: 'range',
      min: String(a.min),
      max: String(a.max),
      step: String(a.step),
      value: String(value),
    });
    input.addEventListener('input', () => {
      const v = snap(spec, Number(input.value));
      out.textContent = formatValue(spec, v);
      set(v);
    });
    row.append(el('span', {}, spec.label), out, input);
    return row;
  }

  /** A slider that is not tied to the tuning tables (the lab's own strength). */
  private rawSlider(spec: SliderSpec, value: number, set: (v: number) => void): HTMLElement {
    return this.valueSlider(spec, value, (v) => {
      set(v);
      this.refreshCues();
    });
  }
}
