// Browser checks for the Input test page: lit keys and log lines, a held Esc or pad Back button leaves and a short press does not, and the layout fits.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test, type Page } from '@playwright/test';
import { audit } from './audit';
import { settle } from './keys';

type Lf = { debugShow(s: string): void; debugState: { screen: string; sub: string | null } };

/** A scripted pad the page reads through `navigator.getGamepads`, driven from the test with `__pad`. */
async function stubPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    const pad = {
      index: 0,
      id: 'Test Pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)',
      connected: true,
      mapping: 'standard',
      timestamp: 1,
      buttons,
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: typeof pad; __padOn: boolean }).__pad = pad;
    (window as unknown as { __padOn: boolean }).__padOn = false;
    // A plain object stands in for a Gamepad, which has no public constructor.
    navigator.getGamepads = (() =>
      (window as unknown as { __padOn: boolean }).__padOn
        ? [pad, null, null, null]
        : [null, null, null, null]) as unknown as typeof navigator.getGamepads;
  });
}

async function open(page: Page): Promise<void> {
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __lf?: unknown }).__lf, null, {
    timeout: 20_000,
  });
  await page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugShow('inputTest'));
  await expect(page.locator('#inputTest')).toBeVisible();
  await settle(page);
}

const sub = (page: Page): Promise<string | null> =>
  page.evaluate(() => (window as unknown as { __lf: Lf }).__lf.debugState.sub);

test('keys light up and log with the action they give, and nothing else acts', async ({ page }) => {
  await open(page);
  await page.keyboard.down('KeyZ');
  await expect(page.locator('#inputTest .it-key[data-code="KeyZ"]')).toHaveAttribute(
    'data-s',
    'on',
  );
  await expect(page.locator('#inputTest .it-chip', { hasText: 'Jump' })).toHaveAttribute(
    'data-on',
    '1',
  );
  await page.keyboard.down('KeyQ');
  await page.keyboard.up('KeyQ');
  await page.keyboard.up('KeyZ');
  const log = page.locator('#inputTest .it-log');
  await expect(log).toContainText('Key  KeyZ  down  -> Jump');
  await expect(log).toContainText('Key  KeyQ  down  -> no action');
  await expect(page.locator('#inputTest .it-key[data-code="KeyZ"]')).not.toHaveAttribute(
    'data-s',
    'on',
  );
  // Enter, a zoom key and F5 are held by the page: none of them acts on the game.
  await page.keyboard.press('Enter');
  await page.keyboard.press('F5');
  await expect(log).toContainText('Key  Enter  down  -> Confirm');
  expect(await sub(page)).toBe('inputTest');
});

test('a short Esc lights up and stays, a held Esc leaves, and so does Back', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#inputTest .it-log')).toContainText('Key  Escape  down  -> Pause');
  expect(await sub(page)).toBe('inputTest');
  await page.keyboard.down('Escape');
  // The hold is a second long and the key stays down until the page has left, so the wait is for the leave, not a fixed time.
  await expect.poll(() => sub(page), { timeout: 5000 }).toBe('options');
  await page.keyboard.up('Escape');
  expect(await sub(page)).toBe('options');
  await open(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect.poll(() => sub(page)).toBe('options');
});

test('a pad lights up, logs and leaves on a held Back button; a short press stays', async ({
  page,
}) => {
  await stubPad(page);
  await open(page);
  await page.evaluate(() => {
    const w = window as unknown as {
      __padOn: boolean;
      __pad: { buttons: { pressed: boolean; value: number }[] };
    };
    w.__padOn = true;
    w.__pad.buttons[0] = { ...w.__pad.buttons[0]!, pressed: true, value: 1 };
  });
  await expect(page.locator('#inputTest .it-log')).toContainText(
    'Pad 0  button 0 (A)  down  -> Jump',
  );
  await expect(page.locator('#inputTest .it-part[data-b="0"]')).toHaveAttribute('data-s', 'on');
  // A short B press only lights up.
  await page.evaluate(() => {
    const b = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } })
      .__pad.buttons;
    b[0] = { ...b[0]!, pressed: false, value: 0 };
    b[1] = { ...b[1]!, pressed: true, value: 1 };
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const b = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } })
      .__pad.buttons;
    b[1] = { ...b[1]!, pressed: false, value: 0 };
  });
  await expect(page.locator('#inputTest .it-log')).toContainText('button 1 (B)  up  -> Pogo');
  expect(await sub(page)).toBe('inputTest');
  await page.evaluate(() => {
    const b = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } })
      .__pad.buttons;
    b[1] = { ...b[1]!, pressed: true, value: 1 };
  });
  await expect.poll(() => sub(page), { timeout: 4000 }).toBe('options');
});

/**
 * Runs in the page: what is wrong with the Touch panel's ghosts. A ghost's box (the hit area's bounding
 * rectangle, a little generous for a circle) must not intersect the box of any text (measured per text node
 * with a Range, so a wide block with short text does not count), any button or tab, or any chip; its label
 * must fit inside it; and it must lie inside the window.
 */
function ghostProblems(): string[] {
  const problems: string[] = [];
  const root = document.getElementById('inputTest')!;
  const ghosts = [...root.querySelectorAll<HTMLElement>('.it-ghost-c')];
  if (ghosts.length !== 5) problems.push(`expected 5 ghosts, saw ${ghosts.length}`);
  const targets: { name: string; r: DOMRect }[] = [];
  for (const b of root.querySelectorAll<HTMLElement>('button, .it-chip, .it-hold')) {
    const r = b.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) targets.push({ name: b.textContent || b.className, r });
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? '').trim();
    if (!text || n.parentElement?.closest('.it-ghost, .it-fingers')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width > 0 && r.height > 0) targets.push({ name: text.slice(0, 30), r });
    }
  }
  const hit = (a: DOMRect, b: DOMRect): boolean =>
    Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 &&
    Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;
  for (const g of ghosts) {
    const name = g.getAttribute('aria-label') ?? '?';
    const r = g.getBoundingClientRect();
    if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)
      problems.push(`${name} ghost is outside the window`);
    const label = g.firstElementChild!.getBoundingClientRect();
    if (label.width > r.width - 4 || label.left < r.left || label.right > r.right)
      problems.push(`${name} label is wider than its box`);
    for (const t of targets) if (hit(r, t.r)) problems.push(`${name} ghost covers "${t.name}"`);
  }
  return problems;
}

const SIZES = [
  [1280, 720],
  [1000, 615],
  [1600, 600],
  [390, 700],
] as const;

for (const [w, h] of SIZES) {
  test.describe(`${w}×${h}`, () => {
    test.use({ viewport: { width: w, height: h } });
    for (const tab of ['Keyboard', 'Gamepad', 'Mouse', 'Touch'] as const) {
      test(`${tab} fits and uses whole-pixel Fizz type`, async ({ page }) => {
        await stubPad(page);
        await open(page);
        await page.evaluate(() => ((window as unknown as { __padOn: boolean }).__padOn = true));
        await page.getByRole('tab', { name: tab }).click();
        await page.waitForTimeout(400);
        const report = await page.evaluate(audit, { roots: ['#inputTest'] });
        expect(report.checked).toBeGreaterThan(5);
        expect(report.pageOverflow).toEqual([]);
        expect(report.outside).toEqual([]);
        expect(report.badSize).toEqual([]);
        expect(report.clipped).toEqual([]);
        // Every control is at least 48 px tall.
        const short = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('#inputTest button')]
            .filter(
              (b) =>
                b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 47.5,
            )
            .map((b) => b.textContent),
        );
        expect(short).toEqual([]);
        if (tab === 'Touch') expect(await page.evaluate(ghostProblems)).toEqual([]);
      });
    }
  });
}
