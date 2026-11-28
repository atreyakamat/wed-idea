import type { GpuLayerKind, ParamDef } from "./types";

// Each GPU layer = parameter list + a GLSL body. Parameters are packed into u_p[] in order and
// exposed to the shader as p_<key>, so presets and the future builder UI share one schema.

const p = (
  key: string,
  def: number,
  min: number,
  max: number,
  step = 0.01,
  label?: string,
): ParamDef => ({ key, def, min, max, step, label: label ?? key });

export interface LayerDef {
  label: string;
  params: ParamDef[];
  /** GLSL statements. In scope: uv, c (current colour), u_tex, u_res, u_time, u_scale, p_*. */
  body: string;
}

export const HEADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_scale;
uniform vec4 u_p[4];
float P(int i){ return u_p[i>>2][i&3]; }
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = hash21(i), b = hash21(i+vec2(1,0)), c = hash21(i+vec2(0,1)), d = hash21(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float gnoise(vec2 p){ return (vnoise(p)*2.0-1.0)*1.5; }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y)/(6.0*d + 1e-10)), d/(q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0))*6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float skinMask(vec3 c){
  vec3 h = rgb2hsv(clamp(c,0.0,1.0));
  float hd = h.x > 0.5 ? 1.0 - h.x : h.x;
  float hm = 1.0 - smoothstep(0.07, 0.12, hd);
  float sm = smoothstep(0.12, 0.25, h.y) * (1.0 - smoothstep(0.65, 0.85, h.y));
  float vm = smoothstep(0.2, 0.4, h.z);
  return hm * sm * vm;
}
vec2 sp(int i, int n){ float a = float(i)*2.39996; float r = sqrt((float(i)+0.5)/float(n)); return vec2(cos(a), sin(a))*r; }
`;

export const LAYER_DEFS: Record<GpuLayerKind, LayerDef> = {
  portraitBlur: {
    label: "Portrait blur",
    params: [
      p("fx", 0.5, 0, 1, 0.01, "Focus X"),
      p("fy", 0.45, 0, 1, 0.01, "Focus Y"),
      p("radius", 0.25, 0.05, 0.9, 0.01, "Sharp zone"),
      p("feather", 0.3, 0.02, 0.8, 0.01, "Feather"),
      p("strength", 0.8, 0, 1, 0.01, "Blur"),
      p("bokeh", 0.5, 0, 1, 0.01, "Bokeh glow"),
    ],
    body: /* glsl */ `
      vec2 asp = vec2(u_res.x/u_res.y, 1.0);
      float d = length((uv - vec2(p_fx, p_fy))*asp*vec2(1.0, 1.25));
      float m = smoothstep(p_radius, p_radius + p_feather, d);
      float rad = m * p_strength * 30.0 * u_scale;
      if (rad > 0.4) {
        vec2 px = 1.0/u_res;
        vec3 acc = vec3(0.0); float ws = 0.0;
        for (int i = 0; i < 40; i++) {
          float fi = float(i);
          float r = sqrt((fi + 0.5)/40.0);
          float a = fi*2.39996;
          vec3 s = texture(u_tex, uv + vec2(cos(a), sin(a))*r*rad*px).rgb;
          float w = 1.0 + p_bokeh*pow(luma(s), 4.0)*8.0;
          acc += s*w; ws += w;
        }
        c = mix(c, acc/ws, smoothstep(0.4, 1.5, rad));
      }
    `,
  },
  denoise: {
    label: "Night / denoise",
    params: [
      p("strength", 0.6, 0, 1, 0.01, "Denoise"),
      p("lift", 0.5, 0, 1, 0.01, "Shadow lift"),
      p("gain", 0.4, -1, 2, 0.01, "Brightness (EV)"),
    ],
    body: /* glsl */ `
      vec2 px = (1.0/u_res)*(1.0 + p_strength*1.6);
      vec3 acc = c; float ws = 1.0;
      for (int i = 0; i < 8; i++) {
        float a = float(i)*0.785398;
        vec3 s = texture(u_tex, uv + vec2(cos(a), sin(a))*px).rgb;
        vec3 dd = s - c;
        float w = exp(-dot(dd, dd)*40.0/(0.2 + p_strength));
        acc += s*w; ws += w;
      }
      c = mix(c, acc/ws, p_strength);
      c *= exp2(p_gain);
      float L = luma(c);
      c += p_lift*0.25*(1.0 - smoothstep(0.0, 0.5, L))*(c + 0.05);
      c = pow(max(c, vec3(0.0)), vec3(1.0 - p_lift*0.25));
    `,
  },
  grade: {
    label: "Color grade",
    params: [
      p("exposure", 0, -2, 2, 0.01, "Exposure"),
      p("contrast", 0, -1, 1, 0.01, "Contrast"),
      p("saturation", 0, -1, 1, 0.01, "Saturation"),
      p("temperature", 0, -1, 1, 0.01, "Temperature (+warm)"),
      p("tint", 0, -1, 1, 0.01, "Tint (+green)"),
      p("fade", 0, 0, 1, 0.01, "Fade (lift blacks)"),
      p("highlights", 0, -1, 1, 0.01, "Highlights"),
      p("shadows", 0, -1, 1, 0.01, "Shadows"),
      p("skinProtect", 0, 0, 1, 0.01, "Protect skin tones"),
    ],
    body: /* glsl */ `
      vec3 c0 = c;
      c *= exp2(p_exposure);
      c *= vec3(1.0 + p_temperature*0.22, 1.0 + p_tint*0.12, 1.0 - p_temperature*0.22);
      float l = luma(c);
      c += p_shadows * 0.22 * (1.0 - smoothstep(0.0, 0.55, l));
      c += p_highlights * 0.22 * smoothstep(0.45, 1.0, l);
      c = (c - 0.5) * (1.0 + p_contrast) + 0.5;
      c = mix(vec3(luma(c)), c, 1.0 + p_saturation);
      c = c * (1.0 - p_fade*0.55) + p_fade*0.13;
      float sk = skinMask(c0);
      c = mix(c, mix(c, c0, 0.65), sk * p_skinProtect);
      c = max(c, 0.0);
    `,
  },
  splitTone: {
    label: "Split tone",
    params: [
      p("shadowHue", 200, 0, 360, 1, "Shadow hue"),
      p("shadowAmt", 0, 0, 1, 0.01, "Shadow amount"),
      p("highHue", 40, 0, 360, 1, "Highlight hue"),
      p("highAmt", 0, 0, 1, 0.01, "Highlight amount"),
      p("balance", 0, -1, 1, 0.01, "Balance"),
    ],
    body: /* glsl */ `
      float l = luma(c);
      float b = smoothstep(0.0, 1.0, l + p_balance*0.3);
      vec3 sc = hsv2rgb(vec3(p_shadowHue/360.0, 0.6, 1.0));
      vec3 hc = hsv2rgb(vec3(p_highHue/360.0, 0.6, 1.0));
      sc /= dot(sc, vec3(0.3333));
      hc /= dot(hc, vec3(0.3333));
      c = mix(c, c*sc, p_shadowAmt*(1.0-b));
      c = mix(c, c*hc, p_highAmt*b);
    `,
  },
  channelMix: {
    label: "Channel mix",
    params: [
      p("rGain", 1, 0.5, 1.5),
      p("gGain", 1, 0.5, 1.5),
      p("bGain", 1, 0.5, 1.5),
      p("rLift", 0, -0.1, 0.2),
      p("gLift", 0, -0.1, 0.2),
      p("bLift", 0, -0.1, 0.2),
    ],
    body: /* glsl */ `
      c = c*vec3(p_rGain, p_gGain, p_bGain) + vec3(p_rLift, p_gLift, p_bLift)*(1.0-c);
    `,
  },
  filmCurve: {
    label: "Film curve",
    params: [
      p("black", 0, 0, 0.2),
      p("white", 1, 0.8, 1),
      p("toe", 0, 0, 1, 0.01, "Toe (contrast)"),
      p("shoulder", 0, 0, 1, 0.01, "Highlight roll-off"),
      p("gamma", 1, 0.5, 2),
    ],
    body: /* glsl */ `
      c = clamp((c - p_black)/max(p_white - p_black, 0.01), 0.0, 1.0);
      c = pow(c, vec3(1.0/p_gamma));
      c = mix(c, c*c*(3.0-2.0*c), p_toe);
      vec3 s = (1.0 - exp(-c*3.0))/(1.0 - exp(-3.0));
      c = mix(c, s, p_shoulder);
    `,
  },
  grain: {
    label: "Film grain",
    params: [
      p("amount", 0.3, 0, 1),
      p("size", 1.2, 0.5, 4),
      p("chroma", 0.3, 0, 1),
      p("response", 0.6, 0, 1, 0.01, "Mid-tone bias"),
      p("animate", 1, 0, 1, 1),
    ],
    body: /* glsl */ `
      float sc = max(p_size, 0.3)*u_scale;
      vec2 px = uv*u_res/sc;
      float t = p_animate > 0.5 ? floor(u_time*14.0) : 0.0;
      vec2 sd = vec2(t*13.7, t*7.3);
      // Two octaves, not one: a soft clump the size of p_size, plus a sharp, un-smoothed speck
      // layer at roughly twice the density. Real negative grain is clumped at several scales at
      // once; a single blurred noise field just looks like mush blown up.
      vec2 fpx = px*2.3;
      float nBase = gnoise(px + sd);
      float nFine = hash21(floor(fpx) + sd*1.7)*2.0 - 1.0;
      float n = mix(nBase, nFine, 0.45);
      vec3 cnBase = vec3(gnoise(px+sd+11.1), gnoise(px+sd+37.7), gnoise(px+sd+71.3));
      vec3 cnFine = vec3(hash21(floor(fpx)+sd*1.7+11.1), hash21(floor(fpx)+sd*1.7+37.7), hash21(floor(fpx)+sd*1.7+71.3))*2.0 - 1.0;
      vec3 cn = mix(cnBase, cnFine, 0.45);
      float l = luma(c);
      float w = mix(1.0, 4.0*l*(1.0-l) + 0.15, p_response);
      c += mix(vec3(n), cn, p_chroma) * p_amount * 0.3 * w;
    `,
  },
  lofi: {
    label: "Lo-fi sensor",
    params: [
      p("pixel", 1, 1, 24, 0.5, "Pixel size"),
      p("levels", 0, 0, 1, 0.01, "Posterize"),
      p("noise", 0, 0, 1, 0.01, "Luma noise"),
      p("chromaNoise", 0, 0, 1, 0.01, "Colour noise"),
      p("blocks", 0, 0, 1, 0.01, "JPEG blocks"),
      p("sharpen", 0, 0, 1, 0.01, "Over-sharpen halos"),
      p("bayer", 0, 0, 1, 0.01, "Bayer pattern"),
    ],
    body: /* glsl */ `
      float ps = max(p_pixel*u_scale, 1.0);
      vec2 cell = floor(uv*u_res/ps);
      vec2 suv = (cell + 0.5)*ps/u_res;
      c = texture(u_tex, p_pixel > 1.001 ? suv : uv).rgb;
      vec2 o = vec2(ps)/u_res;
      vec3 avg = (texture(u_tex, suv+vec2(o.x,0.0)).rgb + texture(u_tex, suv-vec2(o.x,0.0)).rgb
                + texture(u_tex, suv+vec2(0.0,o.y)).rgb + texture(u_tex, suv-vec2(0.0,o.y)).rgb)*0.25;
      c += (c - avg)*p_sharpen*2.2;
      float bs = 8.0*ps;
      vec2 bc = (floor(uv*u_res/bs) + 0.5)*bs/u_res;
      vec3 cb = texture(u_tex, bc).rgb;
      c = mix(c, vec3(luma(c)) + (cb - vec3(luma(cb))), p_blocks);
      vec2 g = mod(cell, 2.0);
      vec3 pat = (g.x < 0.5 && g.y < 0.5) ? vec3(1,0,0) : ((g.x > 0.5 && g.y > 0.5) ? vec3(0,0,1) : vec3(0,1,0));
      c *= 1.0 + (pat - vec3(0.3333))*p_bayer*0.5;
      float tq = floor(u_time*10.0);
      float nl = hash21(cell + tq) - 0.5;
      vec3 nc = vec3(hash21(cell+3.1+tq), hash21(cell+7.7+tq), hash21(cell+9.3+tq)) - 0.5;
      c += nl*p_noise*0.3 + nc*p_chromaNoise*0.3;
      float lv = mix(256.0, 10.0, p_levels);
      c = floor(c*lv + 0.5)/lv;
    `,
  },
  vignette: {
    label: "Vignette",
    params: [
      p("amount", 0.4, 0, 1),
      p("softness", 0.6, 0.05, 1),
      p("roundness", 0.5, 0, 1),
      p("warmth", 0, -1, 1, 0.01, "Edge tint (+warm)"),
    ],
    body: /* glsl */ `
      vec2 q = (uv - 0.5)*vec2(mix(1.0, u_res.x/u_res.y, p_roundness), 1.0);
      float d = length(q)*1.25;
      float v = smoothstep(0.55 - p_softness*0.3, 0.55 + p_softness*0.9, d);
      vec3 tint = vec3(1.0 + p_warmth*0.25, 1.0, 1.0 - p_warmth*0.25);
      c = mix(c, c*tint*(1.0 - p_amount), v);
    `,
  },
  bloom: {
    label: "Bloom / halation",
    params: [
      p("threshold", 0.6, 0, 0.95),
      p("intensity", 0.5, 0, 2),
      p("radius", 14, 1, 60, 1),
      p("warmth", 0.3, -1, 1, 0.01, "Tint (+warm/red)"),
    ],
    body: /* glsl */ `
      vec3 acc = vec3(0.0);
      float j = hash21(uv*u_res)*6.2831;
      float r = p_radius*u_scale;
      for (int i = 0; i < 24; i++) {
        vec2 o = sp(i, 24);
        o = vec2(o.x*cos(j) - o.y*sin(j), o.x*sin(j) + o.y*cos(j))*r/u_res;
        vec3 s = texture(u_tex, uv + o).rgb;
        acc += max(s - p_threshold, 0.0)/(1.0 - p_threshold + 0.001);
      }
      acc /= 24.0;
      vec3 tint = vec3(1.0 + p_warmth*0.35, 1.0 - abs(p_warmth)*0.05, 1.0 - p_warmth*0.35);
      c = 1.0 - (1.0 - c)*(1.0 - acc*p_intensity*tint);
    `,
  },
  diffuse: {
    label: "Soft diffusion",
    params: [p("radius", 18, 1, 80, 1), p("amount", 0.4, 0, 1)],
    body: /* glsl */ `
      vec3 acc = vec3(0.0);
      float j = hash21(uv*u_res+4.0)*6.2831;
      float r = p_radius*u_scale;
      for (int i = 0; i < 24; i++) {
        vec2 o = sp(i, 24);
        o = vec2(o.x*cos(j) - o.y*sin(j), o.x*sin(j) + o.y*cos(j))*r/u_res;
        acc += texture(u_tex, uv + o).rgb;
      }
      vec3 b = acc/24.0;
      c = mix(c, 1.0 - (1.0 - c)*(1.0 - b), p_amount);
    `,
  },
  chromatic: {
    label: "Chromatic fringe",
    params: [p("amount", 0.3, 0, 1), p("lateral", 0, -1, 1)],
    body: /* glsl */ `
      vec2 d = uv - 0.5;
      float k = p_amount*0.012*(0.3 + dot(d,d)*4.0);
      vec2 l = vec2(p_lateral*0.004*p_amount, 0.0);
      c.r = texture(u_tex, uv + d*k + l).r;
      c.b = texture(u_tex, uv - d*k - l).b;
    `,
  },
  blur: {
    label: "Blur / motion",
    params: [
      p("radius", 0, 0, 60, 1),
      p("angle", 0, 0, 360, 1),
      p("mode", 0, 0, 1, 1, "0 soft, 1 directional"),
      p("edgeOnly", 0, 0, 1, 0.01, "Edges only"),
    ],
    body: /* glsl */ `
      float em = mix(1.0, smoothstep(0.15, 0.75, length((uv-0.5)*vec2(u_res.x/u_res.y, 1.0))), p_edgeOnly);
      float r = p_radius*u_scale*em;
      vec2 dir = vec2(cos(radians(p_angle)), sin(radians(p_angle)));
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 16; i++) {
        float f = (float(i) + 0.5)/16.0;
        vec2 o = p_mode > 0.5 ? dir*(f - 0.5)*2.0*r : sp(i, 16)*r;
        acc += texture(u_tex, uv + o/u_res).rgb;
      }
      c = acc/16.0;
    `,
  },
  lightLeak: {
    label: "Light leak",
    params: [
      p("hue", 20, 0, 360, 1),
      p("sat", 0.9, 0, 1),
      p("intensity", 0.5, 0, 1.5),
      p("x", 1, -0.2, 1.2),
      p("y", 0.5, -0.2, 1.2),
      p("size", 0.5, 0.1, 1.5),
      p("streak", 0.3, 0, 1),
      p("spread", 1, 0.3, 3),
      p("hue2", 40, -90, 90, 1, "Gradient hue shift"),
    ],
    body: /* glsl */ `
      vec2 asp = vec2(u_res.x/u_res.y, 1.0);
      vec2 d = (uv - vec2(p_x, p_y))*asp;
      d.x /= p_spread;
      float r2 = dot(d, d);
      float g = exp(-r2/(p_size*p_size));
      vec3 c1 = hsv2rgb(vec3(fract(p_hue/360.0), p_sat, 1.0));
      vec3 c2 = hsv2rgb(vec3(fract((p_hue + p_hue2)/360.0), p_sat, 1.0));
      vec3 col = mix(c1, c2, smoothstep(0.0, 1.0, sqrt(r2)/p_size));
      float st = exp(-abs(uv.x - p_x)*14.0)*p_streak*(0.6 + 0.4*vnoise(vec2(uv.y*6.0, 1.0)));
      float fl = 0.92 + 0.08*sin(u_time*0.9);
      vec3 leak = col*(g + st*0.6)*p_intensity*fl;
      c = 1.0 - (1.0 - c)*(1.0 - leak);
    `,
  },
  flare: {
    label: "Sun flare",
    params: [
      p("x", 0.7, -0.2, 1.2),
      p("y", 0.4, -0.2, 1.2),
      p("intensity", 0.6, 0, 1.5),
      p("hue", 35, 0, 360, 1),
      p("size", 0.35, 0.05, 1),
      p("streakLen", 0.5, 0, 1),
      p("angle", 0, 0, 180, 1),
      p("ghosts", 0.3, 0, 1),
    ],
    body: /* glsl */ `
      vec2 asp = vec2(u_res.x/u_res.y, 1.0);
      vec2 cen = vec2(p_x, p_y);
      vec2 d = (uv - cen)*asp;
      vec3 col = hsv2rgb(vec3(fract(p_hue/360.0), 0.55, 1.0));
      float core = exp(-dot(d,d)/(p_size*p_size*0.35));
      vec2 dir = vec2(cos(radians(p_angle)), sin(radians(p_angle)));
      float along = dot(d, dir);
      float perp = dot(d, vec2(-dir.y, dir.x));
      float streak = exp(-abs(perp)*55.0)*exp(-abs(along)/(0.05 + p_streakLen*0.9));
      float gh = 0.0;
      for (int i = 1; i <= 3; i++) {
        vec2 gp = mix(cen, vec2(1.0) - cen, float(i)*0.32);
        vec2 gd = (uv - gp)*asp;
        gh += exp(-dot(gd,gd)/(0.0035*float(i)))*(0.5/float(i));
      }
      vec3 fl = col*(core*0.9 + streak*0.8 + gh*p_ghosts)*p_intensity;
      c = 1.0 - (1.0 - c)*(1.0 - fl);
    `,
  },
  dust: {
    label: "Dust & scratches",
    params: [
      p("density", 0.5, 0, 1),
      p("scratches", 0.2, 0, 1),
      p("size", 1, 0.5, 3),
      p("strength", 0.5, 0, 1),
      p("darkRatio", 0.6, 0, 1, 0.01, "Dark vs bright specks"),
    ],
    body: /* glsl */ `
      float sc = u_scale*max(p_size, 0.3);
      vec2 g = uv*u_res/(28.0*sc);
      vec2 id = floor(g); vec2 f = fract(g);
      float h = hash21(id + 17.0);
      float spec = 0.0;
      if (h > 1.0 - p_density*0.12) {
        vec2 pos = vec2(hash21(id+3.3), hash21(id+9.1))*0.8 + 0.1;
        float rad = 0.03 + 0.10*hash21(id+5.5);
        spec = smoothstep(rad, rad*0.5, length(f - pos));
      }
      float dark = step(hash21(id + 23.0), p_darkRatio);
      c = mix(c, c*0.3, spec*dark*p_strength);
      c = mix(c, c + 0.45, spec*(1.0 - dark)*p_strength);
      vec2 sg = vec2(uv.x*u_res.x/(60.0*sc), uv.y*u_res.y/(260.0*sc));
      float sid = floor(sg.x);
      vec2 key = vec2(sid, floor(sg.y));
      if (hash21(key + 41.0) > 1.0 - p_scratches*0.12) {
        float lx = hash21(key + 7.0);
        float dx = abs(fract(sg.x) - lx);
        float line = smoothstep(1.5/(60.0*sc), 0.0, dx)*step(fract(sg.y), 0.8);
        c += line*0.3*p_strength;
      }
    `,
  },
  scanlines: {
    label: "Scanlines / CRT / VHS",
    params: [
      p("lines", 480, 60, 1080, 1, "Lines per frame"),
      p("intensity", 0.3, 0, 1),
      p("angle", 0, 0, 90, 1, "Angle (0 horizontal)"),
      p("glitch", 0, 0, 1),
      p("bleed", 0, 0, 1, 0.01, "Colour bleed"),
      p("roll", 0, 0, 1, 0.01, "Roll bar"),
    ],
    body: /* glsl */ `
      vec2 uvm = uv;
      float rowN = floor(uv.y*u_res.y/(2.0*u_scale));
      float gt = floor(u_time*6.0);
      float bandY = fract(u_time*0.11);
      float inBand = step(bandY, uv.y)*step(uv.y, bandY + 0.035)*step(0.001, p_glitch);
      uvm.x += inBand*sin(uv.y*140.0 + u_time*20.0)*0.02*p_glitch;
      c = texture(u_tex, uvm).rgb;
      if (p_bleed > 0.0) {
        vec3 b = vec3(0.0);
        for (int i = 0; i < 6; i++) b += texture(u_tex, uvm - vec2((float(i) - 1.0)*2.5*u_scale/u_res.x, 0.0)).rgb;
        b /= 6.0;
        c = mix(c, vec3(luma(c)) + (b - vec3(luma(b))), p_bleed);
      }
      float a = radians(p_angle);
      float coord = dot(uv*u_res, vec2(sin(a), cos(a)));
      float period = u_res.y/p_lines;
      float s = 0.5 + 0.5*cos(6.28318*coord/period);
      c *= 1.0 - p_intensity*pow(1.0 - s, 1.5);
      float drop = step(0.9985 - p_glitch*0.002, hash21(vec2(rowN, floor(uv.x*14.0) + gt)))*step(0.001, p_glitch);
      c += drop*0.6;
      float rb = smoothstep(0.0, 0.5, fract(uv.y - u_time*0.07));
      c *= 1.0 + p_roll*0.14*(rb - 0.5);
    `,
  },
  distort: {
    label: "Lens distortion",
    params: [
      p("fisheye", 0, 0, 1),
      p("zoom", 1, 0.6, 2),
      p("circle", 0, 0, 1, 0.01, "Round mask"),
    ],
    body: /* glsl */ `
      vec2 asp = vec2(u_res.x/u_res.y, 1.0);
      // Zoom is applied to the sampling coordinate first, so bend and zoom stay independent:
      // multiplied in afterwards, every change of zoom also changed how strong the bend looked.
      vec2 q = (uv - 0.5)*asp*2.0/p_zoom;
      float r2 = dot(q, q);
      // A barrel bulge: the sampled radius grows more slowly than the output radius, so the middle
      // swells and the edges compress. Dividing keeps every sample inside the frame.
      // Multiplying (which this did) is the inverse map — it pinched the picture and dragged
      // black wedges in from outside the texture at the corners.
      vec2 q2 = q/(1.0 + p_fisheye*r2*0.55);
      vec2 suv = q2/(2.0*asp) + 0.5;
      // A soft edge. The old per-pixel test cut to black with no blend, which left a stair-stepped
      // border wherever a sample did fall outside (zoom below 1 still does).
      vec2 edge = min(suv, 1.0 - suv);
      float inside = smoothstep(0.0, 0.0045, min(edge.x, edge.y));
      c = mix(vec3(0.0), texture(u_tex, clamp(suv, 0.0, 1.0)).rgb, inside);
      float m = mix(1.0, 1.0 - smoothstep(0.86, 1.0, length(q)), p_circle);
      c *= m;
    `,
  },
  flash: {
    label: "Direct flash",
    params: [
      p("intensity", 0.5, 0, 1),
      p("falloff", 0.7, 0.2, 1.5),
      p("hue", 40, 0, 360, 1),
      p("x", 0.5, 0, 1),
      p("y", 0.45, 0, 1),
      p("blow", 0.3, 0, 1, 0.01, "Blown highlights"),
    ],
    body: /* glsl */ `
      vec2 asp = vec2(u_res.x/u_res.y, 1.0);
      vec2 d = (uv - vec2(p_x, p_y))*asp;
      float g = exp(-dot(d,d)/(p_falloff*p_falloff));
      vec3 fc = mix(vec3(1.0), hsv2rgb(vec3(fract(p_hue/360.0), 0.45, 1.0)), 0.6);
      c *= mix(1.0 - p_intensity*0.55, 1.0 + p_intensity*0.55, g);
      c += fc*g*p_intensity*0.12;
      c = mix(c, 1.0 - exp(-c*(1.0 + p_blow*3.0)), p_blow);
    `,
  },
  texture: {
    label: "Paper / canvas texture",
    params: [
      p("amount", 0.3, 0, 1),
      p("scale", 1, 0.3, 4),
      p("weave", 0.5, 0, 1, 0.01, "Canvas weave"),
    ],
    body: /* glsl */ `
      vec2 pp = uv*u_res/(u_scale*max(p_scale, 0.3)*3.0);
      vec2 e = vec2(0.6, 0.0);
      #define HH(q) (vnoise(q)*0.5 + vnoise((q)*2.3)*0.35 + p_weave*0.25*sin((q).x*3.0)*sin((q).y*3.0))
      vec2 grad = vec2(HH(pp + e.xy) - HH(pp - e.xy), HH(pp + e.yx) - HH(pp - e.yx));
      vec3 L = normalize(vec3(-0.5, 0.6, 0.8));
      float lit = dot(normalize(vec3(-grad*2.0, 1.0)), L);
      c *= 1.0 + (lit - L.z)*p_amount*1.8;
    `,
  },
};

export function defaultParams(kind: GpuLayerKind): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of LAYER_DEFS[kind].params) out[d.key] = d.def;
  return out;
}

export function buildFragment(kind: GpuLayerKind): string {
  const def = LAYER_DEFS[kind];
  const defines = def.params.map((d, i) => `#define p_${d.key} P(${i})`).join("\n");
  return `${HEADER}
${defines}
void main(){
  vec2 uv = v_uv;
  vec3 c = texture(u_tex, uv).rgb;
  ${def.body}
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
}

export const GPU_KINDS = Object.keys(LAYER_DEFS) as GpuLayerKind[];