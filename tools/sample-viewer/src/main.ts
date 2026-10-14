// The sample viewer's page: loads zips the developer chooses, combines them and shows the numbers and the paths.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { parseSession, type Session } from '@lieutenant-fizz/engine/session/log';
import { readZip, type ZipEntry } from '@lieutenant-fizz/engine/zip-read';
import { findAttempts } from '../../../episodes/episode-1/src/replay/replayer';
import { summarise, type Spot, type Summary } from './aggregate';
import { boundsOf, drawPaths } from './charts';
import { CommentsUi } from './comments-ui';

/** Builds an element. Text is always set as text, never as markup: every name here comes from a file. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; title?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.class) e.className = props.class;
  if (props.text !== undefined) e.textContent = props.text;
  if (props.title) e.title = props.title;
  e.append(...children);
  return e;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`the page has no #${id}`);
  return e as T;
};

const sessions: Session[] = [];
/** The files of each loaded zip, as they came, by the session's name. */
const entriesBySession = new Map<string, readonly ZipEntry[]>();

/** The hot spots of the loaded samples, worked out when they change (the replay reads them every frame). */
let spotList: readonly Spot[] = [];

/** The replay in the page, built the first time something is watched (it loads the game's sim and sprites). */
let panel: import('./replay-panel').ReplayPanel | null = null;

/** Counts the times the samples were cleared, so a Watch asked for before one is dropped when its code has loaded. */
let clears = 0;

const comments = new CommentsUi(
  {
    root: $('comments'),
    form: $<HTMLFormElement>('comment-form'),
    text: $<HTMLTextAreaElement>('comment-text'),
    author: $<HTMLInputElement>('comment-author'),
    pin: $<HTMLButtonElement>('comment-pin'),
    place: $('comment-place'),
    submit: $<HTMLButtonElement>('comment-submit'),
    list: $('comment-list'),
    exportBtn: $<HTMLButtonElement>('comments-export'),
    status: $('comments-status'),
  },
  () => panel,
  (s) => entriesBySession.get(s.id) ?? [],
);

// The c key starts a comment at the moment the replay is at, unless a field has the cursor.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'c' || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
  if (!panel?.open) return;
  e.preventDefault();
  comments.focusNew();
});

async function watch(session: Session, at: { order?: number; tick?: number }): Promise<void> {
  const asked = clears;
  const { ReplayPanel } = await import('./replay-panel');
  if (asked !== clears) return;
  panel ??= new ReplayPanel(
    $('replay-section'),
    $('replay-stage'),
    $('replay-gl'),
    () => spotList,
    {
      opened: (s) => comments.opened(s),
      closed: () => comments.closed(),
      pinned: (place) => comments.pinned(place),
    },
  );
  if (!(await panel.watch(session, at))) {
    $('problems').append(h('li', { text: `${session.name} has no level to watch` }));
  }
}

/** A Watch button for a session (optionally at an attempt and a tick), left out when nothing in it can be replayed. */
function watchButton(
  session: Session,
  at: { order?: number; tick?: number },
  label: string,
): HTMLElement | string {
  // A button for one attempt needs that attempt to be replayable, not just some other attempt in the session.
  const attempts = findAttempts(session);
  const playable =
    at.order === undefined ? attempts.some((a) => a.entry) : !!attempts[at.order]?.entry;
  if (!playable) return '';
  const b = h('button', { text: 'Watch' });
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.addEventListener('click', () => void watch(session, at));
  return b;
}

// A way for the browser tests to see where the replay is.
(window as unknown as { __viewer: object }).__viewer = { replay: () => panel?.state() ?? null };

/** Ticks as minutes and seconds. */
export const clock = (ticks: number): string => {
  const total = Math.round(ticks / 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const percent = (n: number): string => `${Math.round(n * 100)}%`;

function bars(into: HTMLElement, rows: { name: string; count: number }[]): void {
  into.replaceChildren();
  const max = Math.max(1, ...rows.map((r) => r.count));
  for (const r of rows) {
    const fill = h('div', { class: 'fill' });
    fill.style.width = `${(r.count / max) * 100}%`;
    into.append(
      h(
        'div',
        { class: 'bar' },
        h('span', { text: r.name }),
        h('div', { class: 'track' }, fill),
        h('span', { class: 'count', text: String(r.count) }),
      ),
    );
  }
  if (!rows.length) into.append(h('p', { class: 'note', text: 'Nothing yet.' }));
}

function levelsTable(table: HTMLElement, summary: Summary): void {
  table.replaceChildren(
    h(
      'tr',
      {},
      h('th', { text: 'LEVEL' }),
      h('th', { class: 'num', text: 'PLAYS' }),
      h('th', { text: 'CLEARED' }),
      h('th', { class: 'num', text: 'LIVES LOST' }),
      h('th', { class: 'num', text: 'MEDIAN CLEAR' }),
      h('th', { class: 'num', text: 'MEDIAN TIME' }),
      h('th', { class: 'num', text: 'PAUSES' }),
    ),
  );
  for (const l of summary.levels) {
    const fill = h('div', { class: 'fill' });
    fill.style.width = percent(l.clearRate);
    fill.style.background =
      l.clearRate >= 0.8 ? 'var(--good)' : l.clearRate >= 0.5 ? 'var(--accent)' : 'var(--bad)';
    table.append(
      h(
        'tr',
        {},
        h('td', { text: l.name }),
        h('td', { class: 'num', text: String(l.plays) }),
        h(
          'td',
          {},
          h(
            'div',
            { class: 'rate' },
            h('div', { class: 'track' }, fill),
            h('span', { text: percent(l.clearRate) }),
          ),
        ),
        h('td', { class: 'num', text: String(l.deaths) }),
        h('td', {
          class: 'num',
          text: l.medianClearTicks === null ? '–' : clock(l.medianClearTicks),
        }),
        h('td', { class: 'num', text: clock(l.medianTicks) }),
        h('td', { class: 'num', text: String(l.pauses) }),
      ),
    );
  }
}

function render(): void {
  const summary = summarise(sessions);
  spotList = summary.spots;
  $('results').hidden = sessions.length === 0;
  $('clear').hidden = sessions.length === 0;

  $('sessions').replaceChildren(
    ...sessions.map((s) =>
      h(
        'li',
        { class: 'spot-row' },
        h('b', { text: s.name }),
        ` started ${s.startedAt || 'at an unknown time'}, ${String(s.specs['browser'] ?? '?')} ${String(s.specs['browserVersion'] ?? '')} on ${String(s.specs['os'] ?? '?')}${s.skipped ? `, ${s.skipped} unreadable lines skipped` : ''}`,
        watchButton(s, {}, `Watch ${s.name}`),
      ),
    ),
  );

  levelsTable($('levels'), summary);
  bars($('buttons'), summary.buttons);
  bars($('causes'), summary.causes);
  $('spots').replaceChildren(
    ...summary.spots.slice(0, 12).map((s) => {
      // Watching a spot goes to the first death there, a moment before it.
      const ref = s.refs[0];
      const session = ref ? sessions.find((x) => x.id === ref.session) : undefined;
      return h(
        'li',
        { class: 'spot-row' },
        `${s.level}, tile ${s.x}, ${s.y}: ${s.count} (${s.cause})`,
        ...(ref && session
          ? [
              watchButton(
                session,
                { order: ref.order, tick: ref.tick },
                `Watch a death at ${s.level}, tile ${s.x}, ${s.y}`,
              ),
            ]
          : []),
      );
    }),
  );
  if (!summary.spots.length)
    $('spots').append(h('li', { class: 'note', text: 'No lives lost yet.' }));

  // The level picker keeps its choice across a reload of the data.
  const picker = $<HTMLSelectElement>('level');
  const chosen = picker.value;
  picker.replaceChildren(
    ...summary.levels.map((l) => {
      const o = h('option', { text: `${l.name} (${l.plays})` });
      o.value = String(l.id);
      return o;
    }),
  );
  if (summary.levels.some((l) => String(l.id) === chosen)) picker.value = chosen;
  drawMap(summary);
}

function drawMap(summary: Summary): void {
  const canvas = $<HTMLCanvasElement>('map');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const id = Number($<HTMLSelectElement>('level').value);
  const attempts = summary.attempts.filter((a) => a.levelId === id);
  // The canvas takes the shape of the level, so a long, low level is not a thin strip in a tall box.
  const bounds = boundsOf(attempts);
  if (bounds) {
    const ratio = (bounds.maxY - bounds.minY) / (bounds.maxX - bounds.minX);
    canvas.height = Math.round(Math.min(720, Math.max(160, canvas.width * ratio)));
  }
  const drawn = drawPaths(ctx, canvas.width, canvas.height, attempts);
  $('legend').textContent = drawn.paths
    ? `${drawn.paths} paths: green cleared, red died, grey left or cut short. ${drawn.deaths} lives lost (crosses). ${drawn.dwells} places where someone stayed 1.5 seconds or more (rings, bigger for longer). Tile numbers run along the level and up.`
    : 'No paths in this level yet.';
}

async function load(files: FileList | File[]): Promise<void> {
  const problems = $('problems');
  problems.replaceChildren();
  for (const file of Array.from(files)) {
    try {
      const entries = await readZip(new Uint8Array(await file.arrayBuffer()));
      const session = parseSession(file.name, entries);
      if (sessions.some((s) => s.id === session.id)) {
        problems.append(h('li', { text: `${file.name} is already loaded` }));
        continue;
      }
      sessions.push(session);
      // The zip's own files are kept as they came, so an export can put them back byte for byte.
      entriesBySession.set(session.id, entries);
    } catch (err) {
      problems.append(
        h('li', { text: err instanceof Error ? err.message : `${file.name} could not be read` }),
      );
    }
  }
  render();
}

const input = $<HTMLInputElement>('files');
input.addEventListener('change', () => {
  if (input.files) void load(input.files);
  input.value = '';
});
const drop = $('drop');
for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, () => drop.classList.remove('over'));
}
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files.length) void load(e.dataTransfer.files);
});
$('level').addEventListener('change', () => drawMap(summarise(sessions)));
$('clear').addEventListener('click', () => {
  // A replay of a sample that is no longer loaded closes with it.
  clears += 1;
  panel?.cancel();
  sessions.length = 0;
  $('problems').replaceChildren();
  render();
});
render();
