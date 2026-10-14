// What happens in the scenery: Ben grabs treats, stomps a gloop and shoots another, worked out from the time alone.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A treat to grab, lifted `y` pixels off the ground. `sprite` is its cell in the actors sheet. */
export interface DemoTreat {
  kind: 'treat';
  sprite: number;
  x: number;
  y: number;
}

/** A gloop that Ben stomps (`stomp`) or stuns with a fizz bubble from afar (`shot`). */
export interface DemoGloop {
  kind: 'gloop';
  x: number;
  fate: 'stomp' | 'shot';
}

/** One thing standing on the ground, `x` pixels along a loop of the world. */
export type DemoItem = DemoTreat | DemoGloop;

/** The cells of the actors sheet that are not treats, which the script names by their position. */
export const CELL = {
  gloop0: 4,
  gloop1: 5,
  squashed: 6,
  stars0: 7,
  stars1: 8,
  bubble: 9,
} as const;

/** The size of a cell of the actors sheet, in art pixels. */
export const CELL_SIZE = 16;

/** How the actors are laid out for a window: how fast the ground moves, how long the world loop is and where Ben stands. */
export interface Course {
  items: readonly DemoItem[];
  /** Art pixels the ground moves in a second. */
  speed: number;
  /** The length of the world loop, in art pixels: longer than the window, so an item wraps out of sight. */
  period: number;
  /** Where Ben's left edge is, in art pixels from the window's left. */
  benX: number;
}

const GLOOP_HEIGHT = 16;
/** A hop that lands on a gloop: how long it takes, and how high it goes. */
const HOP_S = 0.7;
const HOP_H = 28;
/** The bounce off a stomped gloop. */
const BOUNCE_S = 0.35;
const BOUNCE_H = 12;
/** A hop over a gloop that has already been stunned. */
const OVER_S = 0.7;
const OVER_H = 26;
/** How long a stomped gloop is squashed flat, and then dazed with stars. */
const SQUASH_S = 0.18;
const STUN_S = 1.6;
/** How long a treat takes to pop. */
const POP_S = 0.4;
/** How far ahead a shot gloop is when the bubble hits it, in seconds of ground, and how long the bubble flies. */
const SHOT_LEAD_S = 3;
const FLIGHT_S = 0.5;
/** How long Ben holds the shooting pose. */
const SHOOT_S = 0.3;
/** How fast the dazed stars flick between their two pictures, in seconds. */
const STARS_S = 0.15;
/** How fast a gloop shuffles between its two pictures, in seconds. */
const WALK_S = 0.25;
/** The width of everything on the ground. */
const WIDTH = 16;

/** The part of the hop that is over the gloop at the moment of the stomp: it comes down onto the gloop's head. */
const STOMP_AT = (1 + Math.sqrt(1 - GLOOP_HEIGHT / HOP_H)) / 2;

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** The height of a parabola over `u` from 0 to 1: nothing at either end, `height` in the middle. */
const arc = (u: number, height: number): number => 4 * height * u * (1 - u);

/** The length of the world loop, in seconds. */
export const loopSeconds = (course: Course): number => course.period / course.speed;

/** The world loop for a window: at least `minPeriod`, and wide enough that an item leaves before it comes round. */
export const periodFor = (windowWidth: number, minPeriod: number): number =>
  Math.max(minPeriod, Math.ceil(windowWidth) + 2 * WIDTH);

/** The loop's second at which an item is at Ben, where it is stomped, grabbed or hopped over. */
export function reachTime(item: DemoItem, course: Course): number {
  return mod(item.x - course.benX, course.period) / course.speed;
}

/** The second a gloop that is shot is hit at: some way before it would reach Ben. */
const hitTime = (item: DemoItem, course: Course): number =>
  mod(reachTime(item, course) - SHOT_LEAD_S, loopSeconds(course));

/** A thing that happens at an instant, for a sound and a buzz. */
export type DemoCue = 'pickup' | 'stomp' | 'shot' | 'hit';

interface Event {
  at: number;
  cue: DemoCue;
}

function eventsOf(course: Course): Event[] {
  const out: Event[] = [];
  const total = loopSeconds(course);
  for (const item of course.items) {
    const reach = reachTime(item, course);
    if (item.kind === 'treat') out.push({ at: reach, cue: 'pickup' });
    else if (item.fate === 'stomp') out.push({ at: reach, cue: 'stomp' });
    else {
      const hit = hitTime(item, course);
      out.push({ at: mod(hit - FLIGHT_S, total), cue: 'shot' }, { at: hit, cue: 'hit' });
    }
  }
  return out;
}

/** The cues that happened after loop second `from` up to and including `to` (both taken in the world loop). */
export function cuesBetween(from: number, to: number, course: Course): DemoCue[] {
  const total = loopSeconds(course);
  const span = to - from;
  if (span <= 0) return [];
  // A pause longer than a loop would count every event once, not many times; and a jump that long is not a moment.
  if (span >= total) return [];
  return eventsOf(course)
    .filter((e) => {
      return mod(to - e.at, total) < span;
    })
    .sort((a, b) => mod(a.at - from, total) - mod(b.at - from, total))
    .map((e) => e.cue);
}

/** One thing to draw: a cell of the actors sheet, where its left edge is and how far above the ground it stands. */
export interface ActorState {
  id: string;
  cell: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface BenState {
  /** How far Ben is above the ground, in art pixels. */
  lift: number;
  pose: 'run' | 'air' | 'shoot';
}

export interface DemoState {
  ben: BenState;
  actors: ActorState[];
}

/** The state at the loop's second `t`; `still` is the picture at rest, for a window that does not move. */
export function demoState(t: number, course: Course, still = false): DemoState {
  const total = loopSeconds(course);
  const now = mod(t, total);
  const actors: ActorState[] = [];
  // How far an item is off the left edge when it has gone, so it is hidden while it waits to come round again.
  const goneAfter = (course.benX + WIDTH) / course.speed;

  /** Where an item is on screen, taking the part that is off the left edge as a negative position. */
  const screenX = (item: DemoItem): number => {
    const at = still ? item.x : mod(item.x - now * course.speed, course.period);
    return at > course.period - WIDTH ? at - course.period : at;
  };

  let ben: BenState = { lift: 0, pose: 'run' };
  if (!still) {
    let lift = 0;
    let shooting = false;
    const lifts = (when: number, shift: number, item: DemoGloop): number => {
      const x = now - (when + shift);
      if (item.fate === 'stomp') {
        const start = -HOP_S * STOMP_AT;
        if (x >= start && x <= 0) return arc((x - start) / HOP_S, HOP_H);
        if (x > 0 && x <= BOUNCE_S) return arc(x / BOUNCE_S, BOUNCE_H);
        return 0;
      }
      return Math.abs(x) <= OVER_S / 2 ? arc((x + OVER_S / 2) / OVER_S, OVER_H) : 0;
    };
    for (const item of course.items) {
      if (item.kind !== 'gloop') continue;
      const reach = reachTime(item, course);
      for (const shift of [-total, 0, total]) lift = Math.max(lift, lifts(reach, shift, item));
      if (item.fate === 'shot') {
        const start = hitTime(item, course) - FLIGHT_S;
        const since = mod(now - start, total);
        if (since < SHOOT_S) shooting = true;
      }
    }
    ben = { lift, pose: lift > 0.5 ? 'air' : shooting ? 'shoot' : 'run' };
  }

  course.items.forEach((item, i) => {
    const x = screenX(item);
    if (item.kind === 'treat') {
      const since = still ? Number.POSITIVE_INFINITY : mod(now - reachTime(item, course), total);
      if (since < POP_S) {
        const p = since / POP_S;
        actors.push({
          id: `treat-${i}`,
          cell: item.sprite,
          x,
          y: item.y + 6 * p,
          scale: 1 + 0.4 * p,
          opacity: 1 - p,
        });
      } else if (still || since > goneAfter) {
        actors.push({ id: `treat-${i}`, cell: item.sprite, x, y: item.y, scale: 1, opacity: 1 });
      }
      return;
    }
    const since = mod(now - reachTime(item, course), total);
    const sinceHit = mod(now - hitTime(item, course), total);
    const walking = CELL.gloop0 + (Math.floor(now / WALK_S) % 2);
    let cell: number = walking;
    let stars = false;
    // Where the dazed stars float: just above whatever the gloop looks like now.
    let starsY = 0;
    if (!still && item.fate === 'stomp') {
      if (since < SQUASH_S) cell = CELL.squashed;
      else if (since < SQUASH_S + STUN_S) {
        cell = CELL.squashed;
        stars = true;
      }
    } else if (!still && item.fate === 'shot' && sinceHit < SHOT_LEAD_S + goneAfter) {
      cell = CELL.gloop0;
      stars = true;
      starsY = GLOOP_HEIGHT - 8;
    }
    actors.push({ id: `gloop-${i}`, cell, x, y: 0, scale: 1, opacity: 1 });
    if (stars) {
      const frame = Math.floor(now / STARS_S) % 2 === 0 ? CELL.stars0 : CELL.stars1;
      actors.push({ id: `stars-${i}`, cell: frame, x, y: starsY, scale: 1, opacity: 1 });
    }
    if (!still && item.fate === 'shot') {
      const flown = mod(now - (hitTime(item, course) - FLIGHT_S), total);
      if (flown < FLIGHT_S) {
        const p = flown / FLIGHT_S;
        const from = course.benX + WIDTH;
        const to = course.benX + course.speed * SHOT_LEAD_S;
        actors.push({
          id: `bubble-${i}`,
          cell: CELL.bubble,
          x: from + (to - from) * p - 4,
          y: 6,
          scale: 1,
          opacity: 1,
        });
      }
    }
  });
  return { ben, actors };
}
