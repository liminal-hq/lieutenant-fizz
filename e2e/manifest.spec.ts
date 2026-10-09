// Checks the web manifest is served and that every icon it lists resolves, without booting the game.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { expect, test } from '@playwright/test';

test('the manifest parses and every icon it lists is served', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as { display: string; icons: { src: string }[] };
  expect(manifest.display).toBe('fullscreen');
  expect(manifest.icons.length).toBeGreaterThan(0);
  const base = new URL('manifest.webmanifest', res.url());
  for (const icon of manifest.icons) {
    const r = await request.get(new URL(icon.src, base).href);
    expect(r.status(), icon.src).toBe(200);
  }
});
