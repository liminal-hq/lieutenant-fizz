// Capability probe: reports what the WebView this page runs in can do.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export {};

type ProbeReport = Record<string, unknown>;

const report: ProbeReport = {};
const events: string[] = [];
let popstateCount = 0;
let touchCount = 0;
let audioContext: AudioContext | null = null;
let wakeLock: { release(): Promise<void> } | null = null;

declare global {
  interface Window {
    __probe: ProbeReport;
    __lfFrames: (seconds: number) => Promise<FrameStats>;
  }
}

interface FrameStats {
  frames: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  over33Ms: number;
  fps: number;
}

const out = document.getElementById('out') as HTMLPreElement;

function render(): void {
  report.events = events.slice(-40);
  report.popstateCount = popstateCount;
  report.touches = touchCount;
  out.textContent = JSON.stringify(report, null, 2);
  window.__probe = report;
}

function note(name: string): void {
  events.push(`${(performance.now() / 1000).toFixed(2)}s ${name}`);
  render();
}

async function attempt(name: string, fn: () => unknown | Promise<unknown>): Promise<void> {
  try {
    report[name] = (await fn()) ?? 'ok';
  } catch (error) {
    report[name] =
      `error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
  }
  render();
}

function insets(): Record<string, string> {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;top:env(safe-area-inset-top);right:env(safe-area-inset-right);' +
    'bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const result = {
    top: style.top,
    right: style.right,
    bottom: style.bottom,
    left: style.left,
  };
  probe.remove();
  return result;
}

function environment(): ProbeReport {
  const viewport = window.visualViewport;
  return {
    origin: location.origin,
    href: location.href,
    isSecureContext: window.isSecureContext,
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    screen: { width: screen.width, height: screen.height, orientation: screen.orientation?.type },
    inner: { width: innerWidth, height: innerHeight },
    visualViewport: viewport ? { width: viewport.width, height: viewport.height } : null,
    dvhPx: (() => {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;visibility:hidden;height:100dvh';
      document.body.appendChild(el);
      const h = el.getBoundingClientRect().height;
      el.remove();
      return h;
    })(),
    safeAreaInsets: insets(),
    tauriInternals: '__TAURI_INTERNALS__' in window,
    tauri: '__TAURI__' in window,
    hardwareConcurrency: navigator.hardwareConcurrency,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}

function webgl(): ProbeReport {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return { webgl2: false };
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    webgl2: true,
    vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
}

// The episode bundle ships a hashed `sim-*.wasm`; its content type is what the engine loader checks.
async function wasmFetch(): Promise<ProbeReport> {
  const page = await (await fetch('episode-1/index.html')).text();
  const script = /src="(\.\/assets\/[^"]+\.js)"/.exec(page)?.[1];
  if (!script) return { error: 'episode entry script not found in episode-1/index.html' };
  const code = await (await fetch(`episode-1/${script}`)).text();
  // The bundle refers to the module as `new URL('sim-<hash>.wasm', import.meta.url)`, beside the script.
  const name = /sim-[\w-]+\.wasm/.exec(code)?.[0];
  if (!name) return { error: 'sim wasm not referenced by the entry script' };
  const wasm = script.replace(/[^/]+$/, name);
  const started = performance.now();
  const response = await fetch(`episode-1/${wasm}`);
  const bytes = await response.arrayBuffer();
  const fetchMs = performance.now() - started;
  const compiled = performance.now();
  await WebAssembly.compile(bytes);
  return {
    url: wasm,
    status: response.status,
    contentType: response.headers.get('content-type'),
    bytes: bytes.byteLength,
    fetchMs: Math.round(fetchMs),
    compileMs: Math.round(performance.now() - compiled),
    instantiateStreaming: typeof WebAssembly.instantiateStreaming === 'function',
  };
}

function gamepads(): unknown {
  return Array.from(navigator.getGamepads?.() ?? [])
    .filter((pad): pad is Gamepad => pad !== null)
    .map((pad) => ({
      id: pad.id,
      mapping: pad.mapping,
      buttons: pad.buttons.length,
      axes: pad.axes.length,
      pressed: pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])),
      vibrationActuator: 'vibrationActuator' in pad ? String(pad.vibrationActuator) : 'absent',
    }));
}

async function startAudio(): Promise<ProbeReport> {
  audioContext ??= new AudioContext();
  await audioContext.resume();
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();
  osc.frequency.value = 440;
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(compressor).connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + 0.2);
  return {
    state: audioContext.state,
    sampleRate: audioContext.sampleRate,
    baseLatency: audioContext.baseLatency,
    outputLatency: audioContext.outputLatency ?? null,
  };
}

// Counted once when the page loads, so a re-run reports the same launch instead of a new one.
const launchCount = countLaunch();

function countLaunch(): number | null {
  try {
    const count = Number(localStorage.getItem('lf-probe-launches') ?? '0') + 1;
    localStorage.setItem('lf-probe-launches', String(count));
    return count;
  } catch {
    return null;
  }
}

function persistence(): ProbeReport {
  try {
    if (launchCount === null) throw new Error('localStorage is unavailable');
    return {
      launches: launchCount,
      firstSeen: localStorage.getItem('lf-probe-first') ?? setFirst(),
    };
  } catch (error) {
    return { error: String(error) };
  }
}

function setFirst(): string {
  const now = new Date().toISOString();
  localStorage.setItem('lf-probe-first', now);
  return now;
}

// Records requestAnimationFrame intervals for a number of seconds.
window.__lfFrames = (seconds: number) =>
  new Promise<FrameStats>((resolve) => {
    const times: number[] = [];
    let last = performance.now();
    const end = last + seconds * 1000;
    const tick = (now: number): void => {
      times.push(now - last);
      last = now;
      if (now < end) {
        requestAnimationFrame(tick);
        return;
      }
      const sorted = times.slice(1).sort((a, b) => a - b);
      const at = (q: number): number =>
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
      const stats: FrameStats = {
        frames: sorted.length,
        medianMs: Number(at(0.5).toFixed(2)),
        p95Ms: Number(at(0.95).toFixed(2)),
        p99Ms: Number(at(0.99).toFixed(2)),
        over33Ms: sorted.filter((t) => t > 33).length,
        fps: Number((1000 / (at(0.5) || 1)).toFixed(1)),
      };
      report.frames = stats;
      render();
      resolve(stats);
    };
    requestAnimationFrame(tick);
  });

async function runAll(): Promise<void> {
  report.environment = environment();
  report.webgl = webgl();
  report.persistence = persistence();
  report.gamepads = gamepads();
  report.gamepadApi = typeof navigator.getGamepads === 'function';
  report.vibrateApi = typeof navigator.vibrate === 'function';
  report.fullscreenApi = Boolean(document.documentElement.requestFullscreen);
  report.orientationLockApi = typeof screen.orientation?.lock === 'function';
  report.wakeLockApi = 'wakeLock' in navigator;
  render();
  await attempt('wasm', wasmFetch);
}

function button(id: string, fn: () => void | Promise<void>): void {
  document.getElementById(id)?.addEventListener('click', () => void fn());
}

button('btn-run', runAll);
button('btn-audio', () => attempt('audio', startAudio));
button('btn-vibrate', () => attempt('vibrate', () => navigator.vibrate(200)));
button('btn-fullscreen', () =>
  attempt('fullscreen', () => document.documentElement.requestFullscreen()),
);
button('btn-orientation', () =>
  attempt('orientationLock', () =>
    (screen.orientation as ScreenOrientation & { lock(o: string): Promise<void> }).lock(
      'landscape',
    ),
  ),
);
button('btn-wake', () =>
  attempt('wakeLockRequest', async () => {
    wakeLock = await navigator.wakeLock.request('screen');
    return `held (${wakeLock ? 'sentinel' : 'none'})`;
  }),
);
button('btn-frames', () => void window.__lfFrames(5));
button('btn-copy', () =>
  attempt('copy', () => navigator.clipboard.writeText(out.textContent ?? '')),
);

for (const name of [
  'visibilitychange',
  'pagehide',
  'pageshow',
  'freeze',
  'resume',
  'focus',
  'blur',
]) {
  const target = name === 'visibilitychange' ? document : window;
  target.addEventListener(name, () => note(`${name} (${document.visibilityState})`));
}
window.addEventListener('popstate', () => {
  popstateCount += 1;
  note('popstate');
});
history.pushState({ probe: true }, '');
window.addEventListener('gamepadconnected', (e) => note(`gamepadconnected ${e.gamepad.id}`));
window.addEventListener('gamepaddisconnected', (e) => note(`gamepaddisconnected ${e.gamepad.id}`));
window.addEventListener('keydown', (e) =>
  note(`keydown ${e.key} (${e.code}, keyCode ${e.keyCode})`),
);
const pad = document.getElementById('pad');
for (const name of ['touchstart', 'touchend', 'touchcancel'] as const) {
  pad?.addEventListener(name, (e) => {
    touchCount = e.touches.length;
    render();
  });
}
window.addEventListener('resize', () => {
  report.environment = environment();
  render();
});

void runAll();
