// Checks that the plugin backend stays out of what `GameHaptics` loads, so the web bundle keeps it in a lazy chunk.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

/** The relative modules a file loads when it runs: static imports and re-exports, but not `import type` or `import()`. */
function staticImports(file: string): string[] {
  const text = readFileSync(join(here, file), 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(/^(?:import|export)\s+(type\s+)?[^;]*?from\s+'(\.\/[^']+)';/gms)) {
    if (m[1]) continue;
    out.push(`${(m[2] as string).replace(/^\.\//, '')}.ts`);
  }
  return out;
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length > 0) {
    const f = todo.pop() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    todo.push(...staticImports(f));
  }
  return seen;
}

describe('the plugin backend is loaded lazily', () => {
  it('is not reachable from GameHaptics through static imports', () => {
    const files = reachable('haptics.ts');
    expect(files.has('haptics.ts')).toBe(true);
    expect(files.has('haptic-pattern.ts')).toBe(true);
    expect(files.has('haptic-plugin.ts')).toBe(false);
  });
});
