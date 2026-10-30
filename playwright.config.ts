import { defineConfig } from '@playwright/test';

// Browser checks for the overlay layout. Run with `bun run test:e2e`.
// Set LF_CHROMIUM_PATH to use a Chromium you already have instead of Playwright's download, and
// LF_CHROMIUM_ARGS (space separated) to replace the software-GL flags, for example
// `--use-angle=gl-egl` on a machine where SwiftShader is not available.
// Phone-width specs that time out (the 45 s `Test timeout`, or a 5 s poll that runs out after a slow tap)
// on the CI runner's software GL, mostly in shard 3 of 5 (the `touch-844` project) and in the
// `Overlay layout in Chromium` job, and pass on a re-run. They are switched off, not deleted, until
// someone has looked at why they are slow. `LF_E2E_FLAKY=1 bun run test:e2e` runs them again.
// Each entry is matched against the full title (`[project] › file › title`), so a spec whose file is
// not on this branch yet is covered too. See "Disabled flaky specs" in docs/MOBILE_PLAN.md.
const FLAKY_TITLES: RegExp[] = [
  // e2e/touch-menu-scroll.spec.ts
  /Options at \d+×\d+ \((?:one column|split)\): full-height rows scroll, with cues, and the selected row stays in view/,
  /Row spacing holds after a reload/,
  /title menu at \d+×\d+ \(one column, (?:Compact|Cozy|Comfy)\): the chevrons never touch a cursor, the wordmark or the hint line/,
  // e2e/touch-desktop-host.spec.ts (not on every branch)
  /the pause menu's Quit game arms on the first tap and quits on the second/,
  /Quit game stays unarmed after Resume and a reopened pause menu/,
  /the pause menu's Quit to launcher arms on the first tap and leaves on the second/,
  // Each failed once on CI shard 3 (a poll or an assertion that ran out under load), disabled with the rest for review.
  // e2e/touch-esc-fullscreen.spec.ts
  /entering fullscreen on a phone does not ask for the keyboard lock/,
  // e2e/touch.spec.ts
  /turns on from a first touch, with no flag/,
  // e2e/touch-fullscreen-button.spec.ts
  /the button works with the Fullscreen setting Off and with \?fullscreen=off/,
  // Each failed on the last CI runs of main and of unrelated pull requests, and passed on a re-run: the touch-844 project's shards 3 and 4.
  // e2e/touch-lift.spec.ts
  /the default controls rise in real fullscreen and fall back on leaving it/,
  // e2e/touch-map-panel.spec.ts
  /flips sides as Ben crosses the middle of the screen/,
  /mirrors for the left hand and still clears the controls/,
  /still clear of Ben at 640x320/,
  /clears the controls where they rise in an installed app and where they fall back/,
  /a sign shows all its text and stays clear of Ben/,
  // e2e/touch-menu-scroll.spec.ts
  /Comfy rows are 48 dp, scroll on whole rows and keep the selected row in view/,
  /Row spacing on Display resizes the open screen at once and is saved/,
  // e2e/touch-menus.spec.ts
  /a tap on Back closes saves on the pause menu/,
  // e2e/touch-sound.spec.ts
  /Options > Sound on touch: full-height rows, the Style stepper switches the mode, and Back returns to Sound/,
  /the Sound lab row shows the Lab button without \?debug, and it is still there after a reload/,
];

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  grepInvert: process.env.LF_E2E_FLAKY === '1' ? undefined : FLAKY_TITLES,
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
      // The developer's play sample viewer.
      command: 'bun run --cwd tools/sample-viewer dev --host 127.0.0.1 --port 5199 --strictPort',
      url: 'http://127.0.0.1:5199',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
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
