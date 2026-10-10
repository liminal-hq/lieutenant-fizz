// Browser checks for Options > Controller with a stubbed gamepad: the row appears with a pad, an action waits for the next fresh button and binds it, and every way out works.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { pressUntil, settle } from './keys';

const BINDINGS = 'lf-pad-bindings-v1';

interface Win {
  __pad: { buttons: { pressed: boolean }[] };
  __lf: { debugShow(s: string): void };
}

/** Whether the row with the selection is called `label`; runs in the page. */
const selected = (label: string): boolean =>
  document.querySelector('#overlay .menu button.sel .lbl')?.textContent === label;

const labels = (page: Page): Promise<string[]> =>
  page.locator('#overlay .menu button .lbl').allInnerTexts();

const valueOf = (page: Page, label: string) =>
  page.locator('#overlay .menu button', { hasText: label }).locator('.val');

const title = (page: Page): Promise<string> => page.locator('#overlay h2').innerText();

/** Boots the game with a PlayStation-style pad that no button of is down, or with no pad at all. */
async function boot(page: Page, withPad: boolean): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (withPad)
    await page.addInitScript(() => {
      const pad = {
        index: 0,
        id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      };
      Object.assign(window, { __pad: pad });
      navigator.getGamepads = () => [pad as unknown as Gamepad];
    });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  return errors;
}

const show = (page: Page, screen: string): Promise<void> =>
  page.evaluate((s) => (window as unknown as Win).__lf.debugShow(s), screen);

async function setButton(page: Page, i: number, pressed: boolean): Promise<void> {
  await page.evaluate(
    ([n, p]) => {
      (window as unknown as Win).__pad.buttons[n as number]!.pressed = !!p;
    },
    [i, pressed] as const,
  );
}

/** Holds a pad button until the page shows the change it should cause, then lets go. */
async function padPress(
  page: Page,
  i: number,
  done: (arg: string) => boolean,
  arg = '',
): Promise<void> {
  await settle(page);
  await setButton(page, i, true);
  try {
    await page.waitForFunction(done, arg, { polling: 'raf', timeout: 10_000 });
  } finally {
    await setButton(page, i, false);
  }
}

const stored = (page: Page): Promise<Record<string, number[]> | null> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), BINDINGS);

test('a desktop with no pad has no Controller row in Options', async ({ page }) => {
  const errors = await boot(page, false);
  await show(page, 'options');
  expect(await labels(page)).not.toContain('Controller');
  expect(errors).toEqual([]);
});

test('a pad adds the Controller row, whose actions are named for the controller', async ({
  page,
}) => {
  const errors = await boot(page, true);
  await show(page, 'options');
  await expect.poll(() => labels(page)).toContain('Controller');
  await expect(valueOf(page, 'Controller')).toHaveText('Default');
  await pressUntil(page, 'ArrowDown', selected, 'Controller');
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay h2')?.textContent === 'Controller',
  );
  expect(await labels(page)).toEqual([
    'Jump',
    'Pogo',
    'Fizz',
    'Pause',
    'Reset to defaults',
    'Back',
  ]);
  // A PlayStation pad: the standard mapping's A, B and Y are Cross, Circle and Triangle.
  await expect(valueOf(page, 'Jump')).toHaveText('Cross');
  await expect(valueOf(page, 'Pogo')).toHaveText('Circle, Triangle');
  await expect(valueOf(page, 'Fizz')).toHaveText('Square, R2');
  await expect(valueOf(page, 'Pause')).toHaveText('Options');
  expect(errors).toEqual([]);
});

test('Jump waits for the next fresh button, ignores held ones and the D-pad, and saves the binding', async ({
  page,
}) => {
  const errors = await boot(page, true);
  await show(page, 'controller');
  expect(await title(page)).toBe('Controller');
  // L1 is already held when listening starts: it must not be taken.
  await setButton(page, 4, true);
  await pressUntil(
    page,
    'Enter',
    () =>
      document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Press a button',
  );
  await expect(page.locator('.toast, #toast').first()).toContainText('Press a button for Jump');
  await settle(page, 6);
  await expect(valueOf(page, 'Jump')).toHaveText('Press a button');
  // The D-pad and a stick-click are not bindable, and the held L1 is ignored until it is let go.
  await setButton(page, 14, true);
  await settle(page, 6);
  await setButton(page, 14, false);
  await expect(valueOf(page, 'Jump')).toHaveText('Press a button');
  expect(await stored(page)).toBeNull();
  // R1 (index 5) is a fresh press.
  await padPress(
    page,
    5,
    () => document.querySelector('#overlay .menu button.sel .val')?.textContent === 'R1',
  );
  await setButton(page, 4, false);
  await expect(valueOf(page, 'Jump')).toHaveText('R1');
  expect(await stored(page)).toEqual({ v: 1, jump: [5], pogo: [1, 3], fire: [2, 7], pause: [9] });
  // Still on the Controller screen: the press that bound the button did not also act on a row.
  expect(await title(page)).toBe('Controller');
  expect(errors).toEqual([]);
});

test('taking a button another action needs gives that action the old one, so none is left bare', async ({
  page,
}) => {
  const errors = await boot(page, true);
  await show(page, 'controller');
  await pressUntil(
    page,
    'Enter',
    () =>
      document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Press a button',
  );
  // Start (Options) is Pause's only button: a short press binds it to Jump and Pause takes Cross.
  await settle(page, 4);
  await setButton(page, 9, true);
  await settle(page, 4);
  await setButton(page, 9, false);
  await expect(valueOf(page, 'Jump')).toHaveText('Options');
  await expect(valueOf(page, 'Pause')).toHaveText('Cross');
  expect(await stored(page)).toEqual({ v: 1, jump: [9], pogo: [1, 3], fire: [2, 7], pause: [0] });
  expect(errors).toEqual([]);
});

test('Escape cancels the wait and stays on the screen, and a second Escape leaves it', async ({
  page,
}) => {
  const errors = await boot(page, true);
  await show(page, 'controller');
  await pressUntil(
    page,
    'Enter',
    () =>
      document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Press a button',
  );
  await pressUntil(
    page,
    'Escape',
    () => document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Cross',
  );
  expect(await title(page)).toBe('Controller');
  expect(await stored(page)).toBeNull();
  await pressUntil(
    page,
    'Escape',
    () => document.querySelector('#overlay h2')?.textContent === 'Options',
  );
  expect(errors).toEqual([]);
});

test('holding Start on the pad cancels the wait without binding', async ({ page }) => {
  const errors = await boot(page, true);
  await show(page, 'controller');
  await pressUntil(
    page,
    'Enter',
    () =>
      document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Press a button',
  );
  await settle(page, 4);
  await setButton(page, 9, true);
  await expect(valueOf(page, 'Jump')).toHaveText('Cross', { timeout: 5000 });
  await setButton(page, 9, false);
  expect(await stored(page)).toBeNull();
  expect(await title(page)).toBe('Controller');
  expect(errors).toEqual([]);
});

test('a remapped Pogo is Back in the menus and the old button is not', async ({ page }) => {
  const errors = await boot(page, true);
  await show(page, 'controller');
  // Down to Pogo, bind it to L1 (index 4).
  await pressUntil(page, 'ArrowDown', selected, 'Pogo');
  await pressUntil(
    page,
    'Enter',
    () =>
      document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Press a button',
  );
  await padPress(
    page,
    4,
    () => document.querySelector('#overlay .menu button.sel .val')?.textContent === 'L1',
  );
  await expect(valueOf(page, 'Pogo')).toHaveText('L1');
  // Let the results settle, then Circle (the old Back) does nothing and L1 goes back.
  await settle(page, 6);
  await setButton(page, 1, true);
  await settle(page, 8);
  await setButton(page, 1, false);
  expect(await title(page)).toBe('Controller');
  await padPress(page, 4, () => document.querySelector('#overlay h2')?.textContent === 'Options');
  expect(await title(page)).toBe('Options');
  expect(errors).toEqual([]);
});

test('Reset to defaults asks twice and puts every button back', async ({ page }) => {
  const errors = await boot(page, true);
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k as string, v as string),
    [BINDINGS, JSON.stringify({ v: 1, jump: [5], pogo: [1, 3], fire: [2, 7], pause: [9] })],
  );
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await show(page, 'controller');
  await expect(valueOf(page, 'Jump')).toHaveText('R1');
  await pressUntil(page, 'ArrowDown', selected, 'Pogo');
  await pressUntil(page, 'ArrowDown', selected, 'Fizz');
  await pressUntil(page, 'ArrowDown', selected, 'Pause');
  await pressUntil(page, 'ArrowDown', selected, 'Reset to defaults');
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay .menu button.sel .val')?.textContent === 'Tap again',
  );
  await expect(valueOf(page, 'Jump')).toHaveText('R1');
  await pressUntil(
    page,
    'Enter',
    () => document.querySelector('#overlay .menu button .val')?.textContent === 'Cross',
  );
  await expect(valueOf(page, 'Jump')).toHaveText('Cross');
  expect(await stored(page)).toEqual({ v: 1, jump: [0], pogo: [1, 3], fire: [2, 7], pause: [9] });
  expect(errors).toEqual([]);
});
