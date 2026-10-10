// Pad models: the key a model is saved under, the name a player sees, and the strength a model starts on.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** The key a pad model's settings are saved under: its USB vendor and product ids in decimal, `1356:616` for a DualShock 3. */
export const padModelKey = (vendorId: number, productId: number): string =>
  `${vendorId}:${productId}`;

/** Whether `key` is a model key. */
export const isPadModelKey = (key: string): boolean => /^\d{1,5}:\d{1,5}$/.test(key);

/** The DualShock 3 (054c:0268), whose rumble starts on Medium. */
export const DS3_MODEL = padModelKey(0x054c, 0x0268);

/** The highest level a model starts on when nothing is saved for it (Medium), where its motors are strong for the game's cues. */
const MODEL_START: Readonly<Record<string, number>> = { [DS3_MODEL]: 2 };

/**
 * The rumble level a model has when nothing is saved for it: the shared default (`base`, the old single
 * Rumble value), lowered to the model's own start where it has one, so a DualShock 3 starts on Medium while
 * an Off or Light default stays as it is.
 */
export function modelDefaultLevel(key: string | null, base: number): number {
  const cap = key === null ? undefined : MODEL_START[key];
  return cap === undefined ? base : Math.min(base, cap);
}

/**
 * Reads the vendor and product ids out of a Web `Gamepad.id`: Chromium writes `Name (… Vendor: 054c Product:
 * 0268)` and Firefox `054c-0268-Name`. WebKitGTK and Safari write neither, so it returns undefined.
 */
export function parseGamepadId(id: string): { vendorId: number; productId: number } | undefined {
  const hex = (s: string): number => Number.parseInt(s, 16);
  const chromium = /Vendor:\s*([0-9a-f]{4})\s+Product:\s*([0-9a-f]{4})/i.exec(id);
  if (chromium)
    return { vendorId: hex(chromium[1] as string), productId: hex(chromium[2] as string) };
  const firefox = /^([0-9a-f]{4})-([0-9a-f]{4})-/i.exec(id);
  if (firefox) return { vendorId: hex(firefox[1] as string), productId: hex(firefox[2] as string) };
  return undefined;
}

/** A Web `Gamepad.id` as a name for people: without the ids Chromium and Firefox add. */
export const padDisplayName = (id: string): string =>
  id
    .replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '')
    .replace(/\s*\([^)]*Vendor:[^)]*\)\s*$/i, '')
    .trim();
