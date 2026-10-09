import { defineConfig } from '@playwright/test';

// Browser checks for the overlay layout. Run with `bun run test:e2e`.
// Set LF_CHROMIUM_PATH to use a Chromium you already have instead of Playwright's download, and
// LF_CHROMIUM_ARGS (space separated) to replace the software-GL flags, for example
// `--use-angle=gl-egl` on a machine where SwiftShader is not available.
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  // Without WebGL every test fails the same way, so stop after a few instead of running them all.
  maxFailures: process.env.CI ? 3 : 0,
  retries: process.env.CI ? 1 : 0,
  // The tests share no state (each gets a fresh browser context), so every test is its own unit
  // and `--shard=i/n` splits by test, not by file. Whole-file shards would be uneven because
  // touch-menus.spec.ts alone is 39 tests in each of the two phone projects.
  fullyParallel: true,
  // The CI runner has 4 vCPUs and software GL is CPU-bound: measured on 4 pinned CPUs, 2 workers took
  // 5.6 minutes and 3 or 4 took 4.6, so 3 leaves headroom for a slower runner. `LF_WORKERS` overrides it.
  workers: process.env.LF_WORKERS ? Number(process.env.LF_WORKERS) : process.env.CI ? 3 : undefined,
  // On CI the JSON report carries each test's duration, uploaded by the workflow for profiling.
  reporter: process.env.CI
    ? [['github'], ['json', { outputFile: 'test-results/timing.json' }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5198',
    launchOptions: {
      executablePath: process.env.LF_CHROMIUM_PATH || undefined,
      // Software GL so the game's WebGL2 canvas works headless, and no sound on the host.
      args: [
        '--mute-audio',
        ...(process.env.LF_CHROMIUM_ARGS?.split(' ') ?? [
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
        ]),
      ],
    },
  },
  projects: [
    // The desktop checks. The touch specs run in their own projects, with a phone's viewport and touch.
    { name: 'desktop', testIgnore: /touch(-[a-z-]+)?\.spec/ },
    // A landscape phone: the touch specs run at two sizes, with touch and a high pixel ratio.
    {
      name: 'touch-844',
      testMatch: /touch(-[a-z-]+)?\.spec/,
      use: {
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'touch-740',
      testMatch: /touch(-[a-z-]+)?\.spec/,
      use: {
        viewport: { width: 740, height: 360 },
        deviceScaleFactor: 2.6,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command:
        'bun run build:wasm && bun run --cwd episodes/episode-1 dev --host 127.0.0.1 --port 5198 --strictPort',
      url: 'http://127.0.0.1:5198',
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      // The static landing page, served as it is.
      command: 'python3 -m http.server 5197 --bind 127.0.0.1 --directory site',
      url: 'http://127.0.0.1:5197',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
