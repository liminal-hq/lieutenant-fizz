// Tests for the browser Back guard, against a fake history.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { BackGuard, type HistoryLike } from './back-guard';

/** A session history whose `back()` lands later, as the browser's does: `flush()` delivers the pops. */
class FakeHistory implements HistoryLike {
  entries: unknown[] = [null, null];
  index = 1;
  private pending = 0;
  constructor(private readonly target: EventTarget) {}
  get state(): unknown {
    return this.entries[this.index];
  }
  get length(): number {
    return this.entries.length;
  }
  pushState(data: unknown): void {
    this.entries.length = this.index + 1;
    this.entries.push(data);
    this.index++;
  }
  replaceState(data: unknown): void {
    this.entries[this.index] = data;
  }
  back(): void {
    this.pending++;
  }
  /** Delivers every queued Back as a `popstate`. */
  flush(): void {
    while (this.pending > 0) {
      this.pending--;
      this.pop();
    }
  }
  /** The user's Back button: moves now and fires `popstate`. */
  userBack(): void {
    this.pop();
  }
  private pop(): void {
    if (this.index === 0) return;
    this.index--;
    this.target.dispatchEvent(new Event('popstate'));
  }
}

function setup(): { guard: BackGuard; history: FakeHistory; calls: { n: number } } {
  const target = new EventTarget();
  const history = new FakeHistory(target);
  const calls = { n: 0 };
  const guard = new BackGuard(() => calls.n++, history, target);
  return { guard, history, calls };
}

describe('BackGuard', () => {
  it('arms with one entry and the same URL', () => {
    const { guard, history } = setup();
    guard.set(true);
    expect(guard.armed).toBe(true);
    expect(history.length).toBe(3);
    guard.set(true);
    expect(history.length).toBe(3);
  });

  it('answers the user Back by calling onBack once', () => {
    const { guard, history, calls } = setup();
    guard.set(true);
    history.userBack();
    expect(calls.n).toBe(1);
  });

  it('re-arms after onBack when the want is still standing', () => {
    const { guard, history, calls } = setup();
    guard.set(true);
    history.userBack();
    expect(calls.n).toBe(1);
    expect(guard.armed).toBe(true);
    expect(history.length).toBe(3);
  });

  it('does not re-arm when onBack withdraws the want', () => {
    const target = new EventTarget();
    const history = new FakeHistory(target);
    const guard: BackGuard = new BackGuard(() => guard.set(false), history, target);
    guard.set(true);
    history.userBack();
    history.flush();
    expect(guard.armed).toBe(false);
    expect(history.index).toBe(1);
  });

  it('disarms with history.back() and swallows the pop it caused', () => {
    const { guard, history, calls } = setup();
    guard.set(true);
    guard.set(false);
    expect(guard.armed).toBe(false);
    history.flush();
    expect(calls.n).toBe(0);
    expect(history.index).toBe(1);
  });

  it('does nothing when asked to disarm while not armed', () => {
    const { guard, history } = setup();
    guard.set(false);
    history.flush();
    expect(history.index).toBe(1);
    expect(history.length).toBe(2);
  });

  it('defers a want made while a removal is landing', () => {
    const { guard, history, calls } = setup();
    guard.set(true);
    guard.set(false);
    guard.set(true);
    // Nothing is pushed until the pop has landed.
    expect(history.length).toBe(3);
    expect(guard.armed).toBe(false);
    history.flush();
    expect(guard.armed).toBe(true);
    expect(history.length).toBe(3);
    expect(history.index).toBe(2);
    expect(calls.n).toBe(0);
  });

  it('keeps only the latest deferred want', () => {
    const { guard, history } = setup();
    guard.set(true);
    guard.set(false);
    guard.set(true);
    guard.set(false);
    history.flush();
    expect(guard.armed).toBe(false);
    expect(history.index).toBe(1);
  });

  it('counts several removals in flight', () => {
    const { guard, history, calls } = setup();
    guard.set(true);
    guard.set(false);
    history.flush();
    guard.set(true);
    guard.set(false);
    history.flush();
    expect(calls.n).toBe(0);
    expect(history.index).toBe(1);
  });

  it('clears a guard entry a reload left behind', () => {
    const target = new EventTarget();
    const history = new FakeHistory(target);
    history.entries = [null, { lfBack: 1 }];
    const guard = new BackGuard(() => {}, history, target);
    expect(history.state).toBeNull();
    expect(guard.armed).toBe(false);
  });

  it('leaves unrelated history state alone', () => {
    const target = new EventTarget();
    const history = new FakeHistory(target);
    history.entries = [null, { other: true }];
    new BackGuard(() => {}, history, target);
    expect(history.state).toEqual({ other: true });
  });

  it('ignores a pop when no entry is held', () => {
    const { history, calls } = setup();
    history.userBack();
    expect(calls.n).toBe(0);
  });

  it('does not grow the history over many cycles', () => {
    const { guard, history } = setup();
    for (let i = 0; i < 25; i++) {
      guard.set(true);
      guard.set(false);
      history.flush();
    }
    expect(history.length).toBeLessThanOrEqual(3);
    expect(history.index).toBe(1);
  });

  it('does not grow the history over many user Backs either', () => {
    const { guard, history } = setup();
    guard.set(true);
    for (let i = 0; i < 10; i++) {
      history.userBack();
      history.flush();
    }
    expect(history.length).toBeLessThanOrEqual(3);
  });

  it('stops answering after dispose', () => {
    const { guard, history, calls } = setup();
    guard.set(true);
    guard.dispose();
    history.userBack();
    expect(calls.n).toBe(0);
    guard.set(false);
    expect(history.length).toBe(3);
  });
});
