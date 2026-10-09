// Three.js instanced sprite renderer with normal-mapped lighting.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Atlas } from './atlas';
import { backing, type PixelMode } from './view-scale';

/** Floats per instance (ENGINE_SPEC §3.3). */
export const STRIDE = 20;
/** Maximum simultaneously active lights (shader uniform arrays are this long). */
export const MAX_LIGHTS = 16;

const VERT = /* glsl */ `
attribute vec4 iM0; attribute vec4 iM1; attribute vec4 iM2; attribute vec4 iM3; attribute vec4 iData;
varying vec2 vUv; varying vec3 vTint; varying float vA; varying float vEm; varying vec2 vWorld; varying float vFlip; varying float vAct;
void main(){
  mat4 m = mat4(vec4(iM0.xyz, 0.0), vec4(iM1.xyz, 0.0), iM2, iM3);
  vec4 wp = m * vec4(position, 1.0);
  vWorld = wp.xy;
  vUv = iData.xy + uv * vec2(iM0.w, iM1.w);
  float t = iData.z;
  vTint = vec3(floor(t / 65536.0), mod(floor(t / 256.0), 256.0), mod(t, 256.0)) / 255.0;
  float act = step(3.5, iData.w); float w2 = iData.w - 4.0 * act; vEm = step(1.5, w2); vA = w2 - 2.0 * vEm; vAct = act;
  vFlip = sign(iM0.x);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAlb; uniform sampler2D uNrm; uniform vec3 uAmb; uniform int uNL;
uniform vec4 uLP[${MAX_LIGHTS}]; uniform vec3 uLC[${MAX_LIGHTS}]; uniform float uLighting; uniform float uNormals; uniform float uPoster;
varying vec2 vUv; varying vec3 vTint; varying float vA; varying float vEm; varying vec2 vWorld; varying float vFlip; varying float vAct;
void main(){
  vec4 c = texture2D(uAlb, vUv);
  if (c.a < 0.5) discard;
  vec3 base = c.rgb * vTint;
  if (uLighting < 0.5 || vEm > 0.5) { gl_FragColor = vec4(base, vA); return; }
  vec3 n = texture2D(uNrm, vUv).xyz * 2.0 - 1.0; n.x *= vFlip;
  if (uNormals < 0.5) n = vec3(0.0, 0.0, 1.0);
  n = normalize(n);
  vec3 L = uAmb;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uNL) break;
    vec3 d = vec3(uLP[i].xy - vWorld, uLP[i].z);
    float att = clamp(1.0 - length(d) / uLP[i].w, 0.0, 1.0); att *= att;
    L += uLC[i] * max(dot(n, normalize(d)), 0.0) * att;
  }
  if (vAct > 0.5) L = max(L, vec3(0.62));
  if (uPoster > 0.5) L = floor(L * 4.0 + 0.5) / 4.0;
  gl_FragColor = vec4(base * L, vA);
}`;

/** Everything the renderer needs to draw one frame; no per-frame allocation. */
export interface FrameState {
  /** The full instance backing array (a view over WASM memory). */
  instances: Float32Array;
  count: number;
  camX: number;
  camY: number;
  halfW: number;
  halfH: number;
  clear: readonly [number, number, number, number];
  ambient: readonly [number, number, number];
  lighting: boolean;
  normals: boolean;
  poster: boolean;
  lightCount: number;
  lightPos: Float32Array;
  lightCol: Float32Array;
}

export interface RenderInfo {
  calls: number;
  instances: number;
}

/**
 * One instanced WebGL2 draw per frame (ENGINE_SPEC §3). Sprites are quads in a single
 * InstancedBufferGeometry whose per-instance data lives in an interleaved buffer that is a
 * zero-copy view over the sim's WASM memory.
 */
export class InstancedRenderer {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private readonly geo = new InstancedBufferGeometry();
  private readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly uniforms;
  private ib: InstancedInterleavedBuffer | null = null;
  private source: Float32Array | null = null;
  private readonly textures: DataTexture[];
  private readonly resizer: ResizeObserver;
  private readonly host: HTMLElement;
  private mode: PixelMode;
  private target = 13;
  private seen: { w: number; h: number; dpr: number } | null = null;
  private dprQuery: MediaQueryList | null = null;
  private readonly onDpr = (): void => {
    this.watchDpr();
    this.resize();
  };
  /** CSS pixel size of the host. */
  width = 1;
  height = 1;
  /** The size of the host in device pixels. */
  deviceWidth = 1;
  deviceHeight = 1;
  /** The size of the canvas backing store in pixels (the device size divided by `divisor` when Sharp, `ceil(device / divisor)` when Fast). */
  canvasWidth = 1;
  canvasHeight = 1;
  /** The whole factor the browser upscales the canvas by (1 unless the pixel budget or ratio cap bites, or Fast). */
  divisor = 1;
  /** True when the canvas maps onto device pixels by a whole factor, so whole scales stay sharp. */
  pixelGrid = false;
  /** True when the pixel budget made the canvas smaller than the device ratio would have. */
  budgeted = false;
  /** True under Fast when Sharp's whole scale applies: one canvas pixel per sprite pixel. */
  fast = false;
  /** Device pixels the canvas extends past the host's right and bottom edges (Fast only; cropped). */
  overscanW = 0;
  overscanH = 0;
  /** The canvas's CSS size: the host's, or larger by the overscan under Fast. */
  canvasCssW = 1;
  canvasCssH = 1;
  /** The device pixel ratio the canvas was last sized for. */
  dpr = 1;

  constructor(host: HTMLElement, atlas: Atlas, mode: PixelMode = 'soft') {
    this.host = host;
    this.mode = mode;
    const r = new WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    });
    r.setPixelRatio(1);
    r.domElement.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;';
    host.appendChild(r.domElement);
    this.renderer = r;
    this.canvas = r.domElement;
    this.cam.position.z = 5;

    const tex = (data: Uint8Array): DataTexture => {
      const t = new DataTexture(data, atlas.size, atlas.size, RGBAFormat, UnsignedByteType);
      t.magFilter = NearestFilter;
      t.minFilter = NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    this.textures = [tex(atlas.albedo), tex(atlas.normal)];

    const quad = new PlaneGeometry(1, 1);
    this.geo.setIndex(quad.index);
    this.geo.setAttribute('position', quad.attributes['position']!);
    this.geo.setAttribute('uv', quad.attributes['uv']!);
    this.geo.instanceCount = 0;

    this.uniforms = {
      uAlb: { value: this.textures[0] },
      uNrm: { value: this.textures[1] },
      uAmb: { value: new Vector3(1, 1, 1) },
      uNL: { value: 0 },
      uLP: { value: new Float32Array(MAX_LIGHTS * 4) },
      uLC: { value: new Float32Array(MAX_LIGHTS * 3) },
      uLighting: { value: 1 },
      uNormals: { value: 1 },
      uPoster: { value: 0 },
    };
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.resize();
    this.resizer = new ResizeObserver((entries) => {
      const box = entries[0]?.devicePixelContentBoxSize?.[0];
      this.seen = box
        ? { w: box.inlineSize, h: box.blockSize, dpr: window.devicePixelRatio || 1 }
        : null;
      this.resize();
    });
    try {
      // Exact device pixels, where the browser supports them (not Safari).
      this.resizer.observe(host, { box: 'device-pixel-content-box' });
    } catch {
      this.resizer.observe(host);
    }
    this.watchDpr();
  }

  /** Switches between Sharp, Soft and Fast and resizes the backing store to match. */
  setPixels(mode: PixelMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.resize();
  }

  /**
   * Tells the renderer how many tiles the screen being drawn aims to show. Fast chooses its whole
   * scale from it, so the backing is re-sized when the scale changes; other modes ignore it.
   */
  setTarget(target: number): void {
    if (target === this.target) return;
    this.target = target;
    if (this.mode === 'fast') this.resize();
  }

  /** Sizes the canvas's CSS box: the whole host, or the larger box of a Fast canvas that overhangs it. */
  private sizeCanvasBox(): void {
    const css = this.fast ? `${this.canvasCssW}px` : '100%';
    const cssH = this.fast ? `${this.canvasCssH}px` : '100%';
    const style = this.canvas.style;
    if (style.width !== css) style.width = css;
    if (style.height !== cssH) style.height = cssH;
  }

  /** The device ratio changes with browser zoom and when the window moves screens. */
  private watchDpr(): void {
    this.dprQuery?.removeEventListener('change', this.onDpr);
    this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprQuery.addEventListener('change', this.onDpr);
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.width = this.host.clientWidth || 1;
    this.height = this.host.clientHeight || 1;
    // Trust the browser's exact device size only when it agrees with the CSS size times the ratio
    // (emulated device ratios in test browsers report CSS pixels, which would be a bad backing size).
    const near = (a: number, css: number): boolean => Math.abs(a - css * dpr) <= dpr + 1;
    const seen =
      this.seen &&
      this.seen.dpr === dpr &&
      near(this.seen.w, this.width) &&
      near(this.seen.h, this.height)
        ? this.seen
        : null;
    this.deviceWidth = Math.max(1, seen ? seen.w : Math.round(this.width * dpr));
    this.deviceHeight = Math.max(1, seen ? seen.h : Math.round(this.height * dpr));
    const b = backing({
      devW: this.deviceWidth,
      devH: this.deviceHeight,
      cssW: this.width,
      cssH: this.height,
      dpr,
      mode: this.mode,
      target: this.target,
    });
    this.pixelGrid = b.pixelGrid;
    this.divisor = b.k;
    this.budgeted = b.budgeted;
    this.fast = b.fastScale > 0;
    this.overscanW = b.overscanW;
    this.overscanH = b.overscanH;
    this.canvasCssW = b.cssW;
    this.canvasCssH = b.cssH;
    this.sizeCanvasBox();
    const cw = b.canvasW;
    const ch = b.canvasH;
    if (cw !== this.canvasWidth || ch !== this.canvasHeight || this.canvas.width !== cw) {
      this.canvasWidth = cw;
      this.canvasHeight = ch;
      this.renderer.setSize(cw, ch, false);
    }
  }

  /** CSS pixels per world unit for a given visible half height (captions are placed in CSS pixels). */
  pixelsPerUnit(halfH: number): number {
    return this.canvasCssH / (halfH * 2);
  }

  /** (Re)binds the instance attributes when the backing array changes (e.g. memory growth). */
  private bind(arr: Float32Array): InstancedInterleavedBuffer {
    if (this.source === arr && this.ib) return this.ib;
    const ib = new InstancedInterleavedBuffer(arr, STRIDE, 1);
    ib.setUsage(DynamicDrawUsage);
    ['iM0', 'iM1', 'iM2', 'iM3', 'iData'].forEach((n, k) => {
      this.geo.setAttribute(n, new InterleavedBufferAttribute(ib, 4, k * 4));
    });
    this.ib = ib;
    this.source = arr;
    return ib;
  }

  render(f: FrameState): RenderInfo {
    const ib = this.bind(f.instances);
    // Snap the camera to the device-pixel grid so sprites never shimmer (spec §3.1).
    const snap = (f.halfH * 2) / this.canvasHeight;
    const cx = Math.round(f.camX / snap) * snap;
    const cy = Math.round(f.camY / snap) * snap;
    const c = this.cam;
    c.left = -f.halfW;
    c.right = f.halfW;
    c.top = f.halfH;
    c.bottom = -f.halfH;
    c.position.set(cx, cy, 5);
    c.updateProjectionMatrix();

    const rgb =
      ((Math.round(f.clear[0] * 255) & 255) << 16) |
      ((Math.round(f.clear[1] * 255) & 255) << 8) |
      (Math.round(f.clear[2] * 255) & 255);
    this.renderer.setClearColor(rgb, f.clear[3]);
    const u = this.uniforms;
    u.uAmb.value.set(f.ambient[0], f.ambient[1], f.ambient[2]);
    u.uLighting.value = f.lighting ? 1 : 0;
    u.uNormals.value = f.normals ? 1 : 0;
    u.uPoster.value = f.poster ? 1 : 0;
    u.uNL.value = f.lightCount;
    u.uLP.value.set(f.lightPos.subarray(0, MAX_LIGHTS * 4));
    u.uLC.value.set(f.lightCol.subarray(0, MAX_LIGHTS * 3));

    this.geo.instanceCount = f.count;
    if (f.count > 0) {
      ib.clearUpdateRanges();
      ib.addUpdateRange(0, f.count * STRIDE);
      ib.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.cam);
    return { calls: this.renderer.info.render.calls, instances: f.count };
  }

  /**
   * Reads a rectangle of the last frame back as RGBA, top row first, with the origin at the top
   * left of the canvas. Call it in the same task as `render()`, and keep the rectangle small.
   */
  readPixels(x: number, y: number, w: number, h: number): Uint8Array {
    const gl = this.renderer.getContext();
    const raw = new Uint8Array(w * h * 4);
    gl.readPixels(x, this.canvasHeight - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const out = new Uint8Array(raw.length);
    for (let row = 0; row < h; row++) {
      out.set(raw.subarray((h - 1 - row) * w * 4, (h - row) * w * 4), row * w * 4);
    }
    return out;
  }

  dispose(): void {
    this.dprQuery?.removeEventListener('change', this.onDpr);
    this.resizer.disconnect();
    this.geo.dispose();
    this.material.dispose();
    for (const t of this.textures) t.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
