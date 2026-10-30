// The launch contract: how the launcher tells an episode where to start, in the page's URL.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** A save slot an episode can load: its autosave, a numbered manual slot, or its quick-save. */
export type LaunchSlot = 'auto' | 1 | 2 | 3 | 4 | 'quick';

/** Where to start: the newest save, a new game, a particular slot, or the episode's own Options screen. */
export type Launch =
  | { readonly kind: 'continue' }
  | { readonly kind: 'new' }
  | { readonly kind: 'options' }
  | { readonly kind: 'load'; readonly slot: LaunchSlot };

/** The query parameter the launcher sets. */
export const LAUNCH_PARAM = 'launch';

const SLOTS: readonly LaunchSlot[] = ['auto', 1, 2, 3, 4, 'quick'];

/**
 * Reads the contract from a URL's query: `?launch=continue`, `?launch=new`, `?launch=load:auto`,
 * `?launch=load:2`, `?launch=load:quick` or `?launch=options`. Anything else, or no parameter, is no launch (the episode opens on its own title screen,
 * as it does from the website).
 */
export function parseLaunch(search: string): Launch | undefined {
  const value = new URLSearchParams(search).get(LAUNCH_PARAM);
  if (value === 'continue') return { kind: 'continue' };
  if (value === 'new') return { kind: 'new' };
  if (value === 'options') return { kind: 'options' };
  const load = /^load:(auto|quick|[1-4])$/.exec(value ?? '');
  if (load) {
    const slot =
      load[1] === 'auto' || load[1] === 'quick' ? load[1] : (Number(load[1]) as LaunchSlot);
    if (SLOTS.includes(slot)) return { kind: 'load', slot };
  }
  return undefined;
}

/**
 * The same address without the launch, for an episode to put back in the address bar once it has read it: a
 * reload or a restore must open the episode's own title screen, not start the launch again over a run in progress.
 */
export function withoutLaunch(url: string): string {
  const hash = url.indexOf('#');
  const base = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? '' : url.slice(hash);
  const [path = '', query = ''] = base.split('?', 2);
  const params = new URLSearchParams(query);
  params.delete(LAUNCH_PARAM);
  const rest = params.toString();
  return `${path}${rest ? `?${rest}` : ''}${fragment}`;
}

/** The URL for an episode's page with the launch set, keeping anything else already in its query. */
export function launchUrl(page: string, launch: Launch): string {
  const [path = '', query = ''] = page.split('?', 2);
  const params = new URLSearchParams(query);
  params.set(LAUNCH_PARAM, launch.kind === 'load' ? `load:${launch.slot}` : launch.kind);
  return `${path}?${params.toString().replace(/%3A/g, ':')}`;
}
