// Core data model. A "look" is just data: an ordered stack of GPU layers plus CPU-drawn overlays.

export type GpuLayerKind =
  | "portraitBlur"
  | "denoise"
  | "grade"
  | "splitTone"
  | "channelMix"
  | "filmCurve"
  | "grain"
  | "lofi"
  | "vignette"
  | "bloom"
  | "diffuse"
  | "chromatic"
  | "blur"
  | "lightLeak"
  | "flare"
  | "dust"
  | "scanlines"
  | "distort"
  | "flash"
  | "texture";

export interface LayerSpec {
  kind: GpuLayerKind;
  params?: Record<string, number>;
  enabled?: boolean;
}

export type StampStyle = "seg7" | "dot" | "sans" | "mono" | "vcr";

export type OverlaySpec =
  | {
      kind: "stamp";
      style: StampStyle;
      /** Tokens: YYYY YY MM DD HH hh mm AMPM. Anything else is literal. */
      format: string;
      color: string;
      /** Anchor in 0..1 (x from left, y from top). */
      x: number;
      y: number;
      /** Text height as a fraction of image height. */
      size: number;
      /** 0 = horizontal, 90 = reads bottom-to-top (rotated). */
      rotate?: 0 | 90;
      glow?: number;
      align?: "left" | "right" | "center";
    }
  | {
      kind: "osd";
      /** Lines drawn in a tape/camcorder on-screen-display style. */
      lines: { text: string; x: number; y: number; align?: "left" | "right" | "center" }[];
      color: string;
      size: number;
      outline?: boolean;
    }
  | {
      kind: "hud";
      /** Generic digicam LCD overlay (battery, file number, date, prompts). Our own layout, no brand marks. */
      variant: "play" | "shoot";
      color: string;
    }
  | {
      kind: "frame";
      style: "polaroid" | "thin" | "rounded" | "film";
      color: string;
    };

export interface Preset {
  id: string;
  name: string;
  family: string;
  /** One line: what the look is, in plain words. */
  blurb: string;
  /** Output aspect ratio (width / height). Default 3/4. */
  aspect?: number;
  /** Long-side pixels for photo capture. Low-res cameras (0.1MP) save at their true size, upscaled in whole pixels. */
  captureSide?: number;
  layers: LayerSpec[];
  overlays?: OverlaySpec[];
}

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
}
