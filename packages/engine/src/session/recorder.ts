// Records a play session: events gathered in memory, written to the store every couple of seconds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { KeyValueStorage } from '../storage';
import type { SampleStore, SessionInfo } from './store';

/** The log gets a warning at this size, and recording stops at the second. */
export const WARN_BYTES = 50 * 1024 * 1024;
export const STOP_BYTES = 100 * 1024 * 1024;

/** How often gathered events are written out. */
export const FLUSH_MS = 2000;

/** The storage key of the pointer to the session in progress. */
export const ACTIVE_KEY = 'lf-sample-active';

/** The recorder's state: `full` and `failed` are stops the player is told about. */
export type RecorderState = 'idle' | 'recording' | 'full' | 'failed' | 'stopped';

/** What the recorder needs from its surroundings; tests pass fakes, the game passes the real ones. */
export interface RecorderEnv {
  store: SampleStore;
  /** Where the pointer to the active session is kept (the game's own small storage), if anywhere. */
  pointer?: KeyValueStorage | null;
  /** Milliseconds from a fixed start, such as `performance.now()`. */
  now(): number;
  /** The current wall-clock time, read once at the start of a session. */
  wall(): Date;
  /** The simulation tick, so an event can be placed in the game as well as in time. */
  tick(): number;
  /** A fresh session id. */
  newId(): string;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Told whenever the state changes, and when the size passes the warning. */
  onChange?(state: RecorderState, info: { bytes: number; warned: boolean }): void;
  flushMs?: number;
  warnBytes?: number;
  stopBytes?: number;
}

/** An ISO 8601 time with its offset from UTC, such as `2026-10-13T14:02:00-04:00`. */
export function isoWithOffset(d: Date): string {
  const pad = (n: number, w = 2): string => String(Math.abs(n)).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? '-' : '+';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

/**
 * The recorder. `record` is cheap and never throws; events wait in memory and are written in one chunk every
 * `flushMs`, when the page is hidden (call `flush`), and when the session stops. If the store fails or the
 * log reaches its limit, recording stops and the state says why; what was already written stays.
 */
export class SessionRecorder {
  private status: RecorderState = 'idle';
  private id = '';
  private lines: string[] = [];
  private timer: unknown;
  private chain: Promise<void> = Promise.resolve();
  private written = 0;
  private warned = false;
  private origin = 0;

  constructor(private readonly env: RecorderEnv) {}

  get state(): RecorderState {
    return this.status;
  }

  /** The id of the session being recorded, or '' before one starts. */
  get sessionId(): string {
    return this.id;
  }

  /** Characters written to the store so far, plus those waiting to be. */
  get bytes(): number {
    return this.written + this.lines.reduce((n, l) => n + l.length + 1, 0);
  }

  /** Starts a session and resolves its id. Rejects if the store cannot create it. */
  async start(specs: Record<string, unknown>): Promise<string> {
    if (this.status === 'recording') return this.id;
    const startedAt = isoWithOffset(this.env.wall());
    this.id = this.env.newId();
    this.lines = [];
    this.written = 0;
    this.warned = false;
    this.origin = this.env.now();
    await this.env.store.create({ v: 1, id: this.id, startedAt, specs });
    this.env.pointer?.setItem(ACTIVE_KEY, JSON.stringify({ id: this.id, startedAt }));
    this.set('recording');
    this.arm();
    return this.id;
  }

  /** Adds one event. `e` names it and `fields` carry what happened; time and tick are added here. */
  record(e: string, fields: Record<string, unknown> = {}): void {
    if (this.status !== 'recording') return;
    const ms = Math.round(this.env.now() - this.origin);
    this.lines.push(JSON.stringify({ t: this.env.tick(), ms, e, ...fields }));
    if (!this.warned && this.bytes >= (this.env.warnBytes ?? WARN_BYTES)) {
      this.warned = true;
      this.env.onChange?.(this.status, { bytes: this.bytes, warned: true });
    }
    if (this.bytes >= (this.env.stopBytes ?? STOP_BYTES)) {
      this.set('full');
      void this.finish();
    }
  }

  /** Writes what is waiting. Resolves once it is stored, or after a failure has stopped the recording. */
  flush(): Promise<void> {
    if (!this.lines.length) return this.chain;
    const chunk = this.lines.join('\n') + '\n';
    this.lines = [];
    const id = this.id;
    this.chain = this.chain.then(async () => {
      if (this.status === 'failed') return;
      try {
        await this.env.store.append(id, chunk);
        this.written += chunk.length;
      } catch {
        this.set('failed');
      }
    });
    return this.chain;
  }

  /** Ends the session and resolves what was stored. */
  async stop(): Promise<SessionInfo | null> {
    if (this.status === 'idle' || this.status === 'stopped') return null;
    if (this.status === 'recording') this.set('stopped');
    return this.finish();
  }

  private async finish(): Promise<SessionInfo | null> {
    if (this.timer !== undefined) this.env.clearTimeout(this.timer);
    this.timer = undefined;
    await this.flush();
    try {
      await this.env.store.end(this.id);
    } catch {
      this.set('failed');
    }
    this.env.pointer?.removeItem(ACTIVE_KEY);
    const list = await this.env.store.list().catch(() => [] as SessionInfo[]);
    return list.find((s) => s.id === this.id) ?? null;
  }

  private arm(): void {
    this.timer = this.env.setTimeout(() => {
      this.timer = undefined;
      void this.flush().then(() => {
        if (this.status === 'recording') this.arm();
      });
    }, this.env.flushMs ?? FLUSH_MS);
  }

  private set(next: RecorderState): void {
    if (this.status === next) return;
    this.status = next;
    this.env.onChange?.(next, { bytes: this.bytes, warned: this.warned });
  }
}

/**
 * Sessions that were not ended: a crash, a closed app or a killed tab left them open. The most recent one is
 * what the pointer names; any other open one is listed too.
 */
export async function findUnfinished(store: SampleStore): Promise<SessionInfo[]> {
  const all = await store.list();
  return all.filter((s) => !s.ended);
}
