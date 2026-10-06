import simUrl from './wasm/sim.wasm?url';

const stage = document.getElementById('stage') as HTMLElement;
const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;width:100%;height:100%';
stage.appendChild(canvas);

async function boot(): Promise<void> {
  const { instance } = await WebAssembly.instantiateStreaming(fetch(simUrl), {});
  const stride = (instance.exports.stride as () => number)();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const resize = (): void => {
    canvas.width = stage.clientWidth;
    canvas.height = stage.clientHeight;
    ctx.fillStyle = '#5555ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.fillText(`sim.wasm loaded (stride ${stride})`, 16, 28);
  };
  resize();
  window.addEventListener('resize', resize);
}

boot().catch((e) => console.error(e));
