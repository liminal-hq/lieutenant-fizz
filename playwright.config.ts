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
  reporter: process.env.CI ? 'github' : 'list',
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
    { name: 'desktop', testIgnore: /touch\.spec/ },
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
