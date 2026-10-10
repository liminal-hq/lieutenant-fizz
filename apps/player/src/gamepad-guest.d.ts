// The part of the gamepad plugin's guest API the haptics page calls (the guest itself is not installed; see vite.config.ts).
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

declare const __GAMEPAD_GUEST_MISSING__: boolean;
declare const __GAMEPAD_PLUGIN_REV__: string;

declare module '@liminal-hq/plugin-gamepad-haptics' {
  export interface PadInfo {
    id: string;
    slot: number;
    name: string;
    vendorId: number;
    productId: number;
    serial?: string;
    transport: string;
    guid: string;
    motors: number;
    triggers: boolean;
    topTier: number;
    reason?: string;
    backend: string;
  }
  export interface Frame {
    durationMs: number;
    heavy: number;
    light: number;
    leftTrigger?: number;
    rightTrigger?: number;
  }
  export interface PlayResult {
    ok: true;
    tier: number;
    target: string;
    downgraded: boolean;
    reason?: string;
  }
  export type PadHint =
    | { gamepad: { id: string; index?: number } }
    | { guid: string }
    | { vendorId: number; productId: number; serial?: string };
  export interface TriggerOptions {
    scale?: number;
    padId?: string;
    hint?: PadHint;
  }
  export interface GamepadBackend {
    readonly id: 'gamepad';
    capabilities(): Promise<unknown>;
    register(id: string, pattern: unknown): Promise<unknown>;
    trigger(id: string, options?: TriggerOptions): Promise<PlayResult>;
    setMasterScale(value: number): void;
    setMaxTier(tier: 0 | 1 | 2 | 3 | null): void;
    stop(): Promise<void>;
  }
  export const PATTERN_FORMAT: string;
  export function capabilities(): Promise<unknown>;
  export function listPads(): Promise<PadInfo[]>;
  export function playFrames(padId: string, frames: Frame[], scale?: number): Promise<PlayResult>;
  export function identify(padId: string): Promise<PlayResult>;
  export function stop(padId?: string): Promise<void>;
  export function onPadConnected(fn: (pad: PadInfo) => void): Promise<() => void>;
  export function onPadChanged(fn: (pad: PadInfo) => void): Promise<() => void>;
  export function onPadDisconnected(
    fn: (gone: { id: string; slot: number }) => void,
  ): Promise<() => void>;
  export function createBackend(): GamepadBackend;
  export function resolvePad(
    pads: PadInfo[],
    hint: PadHint,
  ): { matches: PadInfo[]; ambiguous: boolean };
}
