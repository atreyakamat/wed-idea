import { LAYER_DEFS, buildFragment } from "./layerDefs";
import { drawOverlays } from "./overlays";
import type { GpuLayerKind, LayerSpec, OverlaySpec, Preset } from "./types";

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos*0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Crops the source to the output aspect (cover) and optionally mirrors it.
const CROP_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 outColor;
uniform sampler2D u_tex; uniform vec2 u_crop; uniform float u_mirror;
void main(){
  vec2 uv = (v_uv - 0.5)*u_crop + 0.5;
  if (u_mirror > 0.5) uv.x = 1.0 - uv.x;
  outColor = vec4(texture(u_tex, uv).rgb, 1.0);
}`;

// Mixes processed with base by intensity, then composites the CPU overlay on top.
const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 outColor;
uniform sampler2D u_tex; uniform sampler2D u_base; uniform sampler2D u_overlay;
uniform float u_intensity; uniform float u_hasOverlay;
void main(){
  vec3 c = mix(texture(u_base, v_uv).rgb, texture(u_tex, v_uv).rgb, u_intensity);
  if (u_hasOverlay > 0.5) { vec4 o = texture(u_overlay, v_uv); c = mix(c, o.rgb, o.a); }
  outColor = vec4(c, 1.0);
}`;

export type LcdMode = "off" | "play" | "shoot";

export interface RenderOptions {
  preset: Preset | null;
  /** 0..1, blend between original and look. */
  intensity: number;
  mirror: boolean;
  lcd: LcdMode;
  /** Long side of the output in pixels. */
  maxSide: number;
  date?: Date;
  /** Overrides the preset aspect (width / height). */
  aspect?: number;
  /** Digital zoom, 1 = none. */
  zoom?: number;
  /** Layers for the lens in front of the look, if one is fitted. */
  lens?: LayerSpec[];
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

interface Prog {
  program: WebGLProgram;
  loc: Map<string, WebGLUniformLocation | null>;
}

const REF_SIDE = 1440; // grain/blur sizes are authored against a 1440px long side.

export class RetroRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private progs = new Map<string, Prog>();
  private targets: Target[] = [];
  private srcTex!: WebGLTexture;
  private overlayTex!: WebGLTexture;
  private overlayCanvas = document.createElement("canvas");
  private overlayKey = "";
  private hasSource = false;
  private srcW = 1;
  private srcH = 1;
  private w = 0;
  private h = 0;
  private vao!: WebGLVertexArrayObject;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
    });
    if (!gl) throw new Error("WebGL2 is not available on this device.");
    this.gl = gl;
    this.initResources();
    // Android WebViews drop the GL context when the app is backgrounded. Recover instead of freezing.
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener("webglcontextrestored", () => { this.initResources(); this.lost = false; this.onRestored?.(); });
  }

  /** True while the GL context is gone; callers should skip rendering. */
  lost = false;
  onRestored?: () => void;

  private initResources() {
    const gl = this.gl;
    this.progs.clear();
    this.targets = [];
    this.overlayKey = "";
    this.hasSource = false;
    this.w = 0; this.h = 0;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = vao;

    this.srcTex = this.makeTexture();
    this.overlayTex = this.makeTexture();
  }

  private makeTexture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private compile(type: number, src: string, label: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`Shader "${label}" failed: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  }

  private program(key: string, frag: string): Prog {
    const hit = this.progs.get(key);
    if (hit) return hit;
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERT, "vertex"));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, frag, key));
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program "${key}" failed to link: ${gl.getProgramInfoLog(program)}`);
    }
    const p = { program, loc: new Map<string, WebGLUniformLocation | null>() };
    this.progs.set(key, p);
    return p;
  }

  private layerProgram(kind: GpuLayerKind): Prog {
    return this.program(`layer:${kind}`, buildFragment(kind));
  }

  /** Compile every layer shader up front so errors surface immediately. */
  warmUp() {
    this.program("crop", CROP_FRAG);
    this.program("composite", COMPOSITE_FRAG);
    for (const k of Object.keys(LAYER_DEFS) as GpuLayerKind[]) this.layerProgram(k);
  }

  private u(p: Prog, name: string) {
    let l = p.loc.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(p.program, name);
      p.loc.set(name, l);
    }
    return l;
  }

  private ensureTargets(w: number, h: number) {
    if (this.w === w && this.h === h && this.targets.length === 3) return;
    const gl = this.gl;
    for (const t of this.targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.targets = [];
    for (let i = 0; i < 3; i++) {
      const tex = this.makeTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this.targets.push({ tex, fbo });
    }
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.overlayCanvas.width = w;
    this.overlayCanvas.height = h;
    this.overlayKey = "";
  }

  /** Upload a new frame (video frame, image, or bitmap). Call every frame for live video. */
  setSource(src: TexImageSource, sw: number, sh: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    this.srcW = sw;
    this.srcH = sh;
    this.hasSource = true;
  }

  get ready() {
    return this.hasSource;
  }

  private draw() {
    this.gl.bindVertexArray(this.vao);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private bindTex(unit: number, tex: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  private packParams(layer: LayerSpec): Float32Array {
    const out = new Float32Array(16);
    LAYER_DEFS[layer.kind].params.forEach((d, i) => {
      out[i] = layer.params?.[d.key] ?? d.def;
    });
    return out;
  }

  static outputSize(aspect: number, maxSide: number) {
    let w: number;
    let h: number;
    if (aspect < 1) {
      h = maxSide;
      w = Math.round(maxSide * aspect);
    } else {
      w = maxSide;
      h = Math.round(maxSide / aspect);
    }
    return { w: w & ~1, h: h & ~1 };
  }

  render(opts: RenderOptions, time: number) {
    if (this.lost || this.gl.isContextLost()) return;
    if (!this.hasSource) return;
    const gl = this.gl;
    const aspect = opts.aspect ?? opts.preset?.aspect ?? 3 / 4;
    const { w, h } = RetroRenderer.outputSize(aspect, opts.maxSide);
    this.ensureTargets(w, h);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);

    // 1) crop to target aspect
    const srcAspect = this.srcW / this.srcH;
    const z = Math.max(1, opts.zoom ?? 1);
    const base: [number, number] = srcAspect > aspect ? [aspect / srcAspect, 1] : [1, srcAspect / aspect];
    const crop: [number, number] = [base[0] / z, base[1] / z];
    const cp = this.program("crop", CROP_FRAG);
    gl.useProgram(cp.program);
    this.bindTex(0, this.srcTex);
    gl.uniform1i(this.u(cp, "u_tex"), 0);
    gl.uniform2f(this.u(cp, "u_crop"), crop[0], crop[1]);
    gl.uniform1f(this.u(cp, "u_mirror"), opts.mirror ? 1 : 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[0].fbo);
    this.draw();

    // 2) layer stack, ping-ponging between targets 1 and 2.
    // A lens goes in front of the look, so the look's grade, grain and vignette all land on the
    // bent picture rather than being bent themselves.
    const layers: LayerSpec[] = [...(opts.lens ?? []), ...(opts.preset?.layers ?? [])];
    const overlays: OverlaySpec[] = [...(opts.preset?.overlays ?? [])];
    if (opts.lcd !== "off") {
      layers.push({ kind: "scanlines", params: { lines: Math.round(h / 2.2), intensity: 0.14, angle: 35 } });
      layers.push({ kind: "chromatic", params: { amount: 0.12 } });
      overlays.push({ kind: "hud", variant: opts.lcd, color: "#ffffff" });
    }
    let cur = this.targets[0];
    let next = 1;
    const scale = Math.max(w, h) / REF_SIDE;
    for (const layer of layers) {
      if (layer.enabled === false) continue;
      const prog = this.layerProgram(layer.kind);
      gl.useProgram(prog.program);
      this.bindTex(0, cur.tex);
      gl.uniform1i(this.u(prog, "u_tex"), 0);
      gl.uniform2f(this.u(prog, "u_res"), w, h);
      gl.uniform1f(this.u(prog, "u_time"), time);
      gl.uniform1f(this.u(prog, "u_scale"), scale);
      gl.uniform4fv(this.u(prog, "u_p"), this.packParams(layer));
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[next].fbo);
      this.draw();
      cur = this.targets[next];
      next = next === 1 ? 2 : 1;
    }

    // 3) overlays on a 2D canvas, refreshed when something visible changes
    const date = opts.date ?? new Date();
    const hasOverlay = overlays.length > 0;
    if (hasOverlay) {
      const key = `${opts.preset?.id}|${opts.lcd}|${w}x${h}|${Math.floor(time)}|${date.getMinutes()}`;
      if (key !== this.overlayKey) {
        const ctx = this.overlayCanvas.getContext("2d")!;
        drawOverlays(ctx, w, h, overlays, date);
        gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.overlayCanvas);
        this.overlayKey = key;
      }
    }

    // 4) composite to the screen canvas
    const cm = this.program("composite", COMPOSITE_FRAG);
    gl.useProgram(cm.program);
    this.bindTex(0, cur.tex);
    this.bindTex(1, this.targets[0].tex);
    this.bindTex(2, this.overlayTex);
    gl.uniform1i(this.u(cm, "u_tex"), 0);
    gl.uniform1i(this.u(cm, "u_base"), 1);
    gl.uniform1i(this.u(cm, "u_overlay"), 2);
    gl.uniform1f(this.u(cm, "u_intensity"), opts.preset ? opts.intensity : 0);
    gl.uniform1f(this.u(cm, "u_hasOverlay"), hasOverlay && opts.intensity > 0 ? 1 : 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.draw();
  }

  /** Render at full quality and return an encoded image. */
  async capture(opts: RenderOptions, time: number, type = "image/jpeg", quality = 0.92): Promise<Blob> {
    this.render({ ...opts, maxSide: opts.preset?.captureSide ?? Math.max(opts.maxSide, 2048) }, time);
    return new Promise((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Capture failed"))), type, quality),
    );
  }
}
