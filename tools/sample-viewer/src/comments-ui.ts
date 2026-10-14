// The viewer's comments: add a note at the moment of the replay, jump to one, edit or delete it, and export the run.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { bundleZip, NOTES_FILE, notesZipName } from '@lieutenant-fizz/engine/session/bundle';
import {
  addComment,
  COMMENTS_FILE,
  editComment,
  emptyComments,
  parseComments,
  removeComment,
  serialiseComments,
  type Comment,
  type CommentsFile,
} from '@lieutenant-fizz/engine/session/comments';
import { startedDate } from '@lieutenant-fizz/engine/session/export';
import type { Session } from '@lieutenant-fizz/engine/session/log';
import type { ZipEntry } from '@lieutenant-fizz/engine/zip-read';
import { attemptsOf, type Attempt } from '../../../episodes/episode-1/src/replay/attempts';
import { clockText } from '../../../episodes/episode-1/src/replay/navigation';
import { notesMarkdown } from '../../../episodes/episode-1/src/replay/notes';
import type { Pin, ReplayPanel } from './replay-panel';

/** The elements of the comments section of the page. */
export interface CommentsDom {
  root: HTMLElement;
  form: HTMLFormElement;
  text: HTMLTextAreaElement;
  author: HTMLInputElement;
  pin: HTMLButtonElement;
  place: HTMLElement;
  submit: HTMLButtonElement;
  list: HTMLElement;
  exportBtn: HTMLButtonElement;
  status: HTMLElement;
}

/** Where the comments of a session are kept in the browser between visits, so a draft is not lost. */
const DRAFT_KEY = 'lf-viewer-comments:';
const AUTHOR_KEY = 'lf-viewer-author';

const encoder = new TextEncoder();

/** The browser's storage, when it will let this page use it. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The comments section. It works on the sample the replay is showing: a comment is anchored to the tick the replay
 * is at, optionally with a place chosen by clicking the picture, and the whole set is written beside the sample's
 * own files when the run is exported. Drafts are kept in the browser's storage by the sample's id until then.
 */
export class CommentsUi {
  private session: Session | null = null;
  private file: CommentsFile = emptyComments({ id: '', startedAt: '' });
  private attempts: Attempt[] = [];
  private editing: string | null = null;
  private place: { x: number; y: number } | null = null;
  /** The moment of the replay when the comment box got the cursor: the comment is about that, not a later one. */
  private anchor: { order: number; tick: number; level: number } | null = null;

  constructor(
    private readonly dom: CommentsDom,
    private readonly panel: () => ReplayPanel | null,
    private readonly entries: (session: Session) => readonly ZipEntry[],
  ) {
    dom.author.value = storage()?.getItem(AUTHOR_KEY) ?? '';
    dom.author.addEventListener('change', () => {
      try {
        storage()?.setItem(AUTHOR_KEY, dom.author.value.trim());
      } catch {
        // The name is kept for the page's life only when storage is refused.
      }
    });
    dom.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    // Starting a comment holds the replay and keeps its moment, so typing does not let it run on.
    dom.text.addEventListener('focus', () => {
      if (this.anchor || !this.session) return;
      this.panel()?.pause();
      this.anchor = this.panel()?.position() ?? null;
    });
    dom.text.addEventListener('blur', () => {
      if (!dom.text.value.trim() && !this.editing) this.anchor = null;
    });
    dom.pin.addEventListener('click', () => {
      this.panel()?.startPinning();
      dom.place.textContent = 'Click the picture to choose a place.';
    });
    dom.exportBtn.addEventListener('click', () => void this.export());
  }

  /** A replay opened on a sample: its comments are loaded (those in the zip, and any drafts not yet exported). */
  opened(session: Session): void {
    this.session = session;
    this.attempts = attemptsOf(session);
    this.editing = null;
    this.anchor = null;
    this.place = null;
    this.file = this.load(session);
    this.dom.root.hidden = false;
    this.dom.text.value = '';
    this.dom.status.textContent = '';
    this.syncPlace();
    this.render();
  }

  /** The replay closed. */
  closed(): void {
    this.session = null;
    this.dom.root.hidden = true;
  }

  /** A place was chosen by clicking the picture. */
  pinned(at: { x: number; y: number }): void {
    this.place = at;
    this.syncPlace();
  }

  /** Holds the replay and puts the cursor in the comment box (the `c` key does this). */
  focusNew(): void {
    if (!this.session) return;
    this.panel()?.pause();
    this.dom.text.focus();
  }

  /** The comments now, as the file that would be exported. */
  current(): CommentsFile {
    return this.file;
  }

  // ---------- Storing ----------

  /** The comments in the zip, plus any in the browser's draft that the zip does not have. */
  private load(session: Session): CommentsFile {
    const base = emptyComments({ id: session.id, startedAt: session.startedAt });
    const inZip = this.entries(session).find((f) => f.name === COMMENTS_FILE);
    const fromZip = inZip ? parseComments(new TextDecoder().decode(inZip.data)) : null;
    let file = fromZip ? { ...fromZip.file, session: base.session } : base;
    const draft = ((): string | null => {
      try {
        return storage()?.getItem(DRAFT_KEY + session.id) ?? null;
      } catch {
        return null;
      }
    })();
    const local = draft ? parseComments(draft) : null;
    if (local) {
      const have = new Set(file.comments.map((c) => c.id));
      const more = local.file.comments.filter((c) => !have.has(c.id));
      if (more.length) {
        file = { ...file, comments: [...file.comments, ...more].sort((a, b) => a.tick - b.tick) };
      }
    }
    return file;
  }

  private save(): void {
    if (!this.session) return;
    try {
      storage()?.setItem(DRAFT_KEY + this.session.id, serialiseComments(this.file));
    } catch {
      // A full or refused store loses only the draft: the comments are still in the page.
    }
  }

  // ---------- Changing ----------

  private submit(): void {
    const where = this.anchor ?? this.panel()?.position();
    const text = this.dom.text.value.trim();
    if (!this.session || !where || !text) return;
    const now = new Date();
    if (this.editing) {
      this.file = editComment(
        this.file,
        this.editing,
        { text, ...(this.place ? { at: this.place } : {}) },
        now,
      );
    } else {
      const author = this.dom.author.value.trim();
      this.file = addComment(
        this.file,
        {
          tick: where.tick,
          text,
          level: where.level,
          attempt: where.order,
          ...(this.place ? { at: this.place } : {}),
          ...(author ? { author } : {}),
        },
        now,
        () => `c-${crypto.randomUUID().slice(0, 8)}`,
      );
    }
    this.editing = null;
    this.anchor = null;
    this.place = null;
    this.panel()?.setPending(null);
    this.dom.text.value = '';
    this.dom.submit.textContent = 'Add comment';
    this.syncPlace();
    this.save();
    this.render();
  }

  private edit(c: Comment): void {
    this.editing = c.id;
    // An edit keeps its comment's moment, so the moment held for a new one is let go.
    this.anchor = null;
    this.dom.text.value = c.text;
    this.dom.submit.textContent = 'Save changes';
    this.place = c.at ?? null;
    this.panel()?.setPending(this.place);
    this.syncPlace();
    this.dom.text.focus();
  }

  private remove(c: Comment): void {
    this.file = removeComment(this.file, c.id);
    if (this.editing === c.id) {
      this.editing = null;
      this.dom.text.value = '';
      this.dom.submit.textContent = 'Add comment';
    }
    this.save();
    this.render();
  }

  // ---------- Showing ----------

  private syncPlace(): void {
    this.dom.place.textContent = this.place
      ? `Place: tile ${this.place.x.toFixed(1)}, ${this.place.y.toFixed(1)}`
      : 'No place chosen: the comment is about the moment.';
  }

  /** A comment's moment in words: "Fudge Bog, try 3, 0:12.4". */
  private moment(c: Comment): string {
    const a =
      c.attempt !== undefined
        ? this.attempts.find((x) => x.order === c.attempt)
        : this.attempts.find((x) => c.tick >= x.startTick && c.tick <= x.endTick);
    return a
      ? `${a.level}, try ${a.attempt}, ${clockText(c.tick - a.startTick)}`
      : `tick ${c.tick}`;
  }

  private render(): void {
    const { list } = this.dom;
    list.replaceChildren();
    const pins: Pin[] = [];
    this.file.comments.forEach((c, i) => {
      const li = document.createElement('li');
      const go = document.createElement('button');
      go.type = 'button';
      go.textContent = `${i + 1}. ${this.moment(c)}`;
      go.setAttribute('aria-label', `Go to comment ${i + 1}, ${this.moment(c)}`);
      go.addEventListener('click', () => {
        if (c.attempt !== undefined) this.panel()?.goto(c.attempt, c.tick);
      });
      const body = document.createElement('p');
      body.className = 'comment-text';
      body.textContent = c.text;
      const who = document.createElement('span');
      who.className = 'note';
      who.textContent = [c.author, c.created.slice(0, 10), c.edited ? 'edited' : '']
        .filter(Boolean)
        .join(', ');
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', `Edit comment ${i + 1}`);
      edit.addEventListener('click', () => this.edit(c));
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', `Delete comment ${i + 1}`);
      del.addEventListener('click', () => this.remove(c));
      li.append(go, body, who, edit, del);
      list.append(li);
      if (c.at && c.attempt !== undefined) {
        pins.push({ x: c.at.x, y: c.at.y, label: String(i + 1), attempt: c.attempt });
      }
    });
    if (!this.file.comments.length) {
      const none = document.createElement('li');
      none.className = 'note';
      none.textContent = 'No comments yet.';
      list.append(none);
    }
    this.panel()?.setPins(pins);
  }

  // ---------- Exporting ----------

  /** Writes the run with its comments and notes into one zip and offers it for download. */
  async export(): Promise<void> {
    const p = this.panel();
    const session = this.session;
    if (!p || !session) return;
    this.dom.status.textContent = 'Making the zip…';
    try {
      const verdicts = await p.verdicts(session);
      const notes = notesMarkdown({ session, comments: this.file, verdicts });
      const zip = await bundleZip(
        this.entries(session),
        [
          { name: COMMENTS_FILE, data: encoder.encode(serialiseComments(this.file)) },
          { name: NOTES_FILE, data: encoder.encode(notes) },
        ],
        startedDate(session.startedAt),
      );
      const name = notesZipName(session.id);
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const n = this.file.comments.length;
      this.dom.status.textContent = `Saved ${name} with ${n} ${n === 1 ? 'comment' : 'comments'}.`;
    } catch (err) {
      this.dom.status.textContent = `The zip could not be made: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
