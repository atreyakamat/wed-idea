// Photo filters, defined as SVG filter steps so the preview and the printed
// card are processed identically (no separate image pipeline to drift).

export type FilterStep =
  /** 4 × 5 colour matrix, row by row (R, G, B, A). */
  | { type: "matrix"; values: number[] }
  /** 0 = black & white, 1 = unchanged, above 1 = punchier colour. */
  | { type: "saturate"; value: number }
  /** Contrast and brightness: out = slope × in + intercept, per channel. */
  | { type: "levels"; slope: number; intercept: number };

export type PhotoFilter = {
  id: string;
  name: string;
  description: string;
  steps: FilterStep[];
};

export const PHOTO_FILTERS: readonly PhotoFilter[] = [
  { id: "classic", name: "Classic", description: "The photo as shot.", steps: [] },
  {
    id: "warm-goa",
    name: "Warm Goa",
    description: "Golden-hour warmth, a little more colour.",
    steps: [
      { type: "matrix", values: [1.06, 0.03, 0, 0, 0.01, 0.02, 1.01, 0, 0, 0.005, 0, 0, 0.92, 0, 0, 0, 0, 0, 1, 0] },
      { type: "saturate", value: 1.06 },
    ],
  },
  {
    id: "film-fade",
    name: "Film Fade",
    description: "Soft, faded blacks like an old print.",
    steps: [
      { type: "saturate", value: 0.8 },
      { type: "levels", slope: 0.82, intercept: 0.1 },
      { type: "matrix", values: [1.03, 0, 0, 0, 0.01, 0, 1, 0, 0, 0, 0, 0, 0.95, 0, 0.02, 0, 0, 0, 1, 0] },
    ],
  },
  {
    id: "black-white",
    name: "Black & White",
    description: "Classic monochrome with a touch of contrast.",
    steps: [
      { type: "saturate", value: 0 },
      { type: "levels", slope: 1.12, intercept: -0.04 },
    ],
  },
  {
    id: "soft-pink",
    name: "Soft Pink",
    description: "A rosy, dreamy glow.",
    steps: [
      { type: "matrix", values: [1.02, 0.02, 0.02, 0, 0.03, 0, 0.96, 0.02, 0, 0.015, 0.01, 0.02, 0.98, 0, 0.03, 0, 0, 0, 1, 0] },
      { type: "levels", slope: 0.96, intercept: 0.03 },
    ],
  },
  {
    id: "vintage",
    name: "Vintage",
    description: "Sepia tones from a family album.",
    steps: [
      { type: "matrix", values: [0.6, 0.38, 0.12, 0, 0.02, 0.24, 0.68, 0.1, 0, 0.01, 0.17, 0.33, 0.42, 0, 0, 0, 0, 0, 1, 0] },
      { type: "levels", slope: 0.9, intercept: 0.06 },
    ],
  },
];

export const DEFAULT_FILTER_ID = "classic";

export function getFilter(id: string | null | undefined): PhotoFilter {
  return PHOTO_FILTERS.find((f) => f.id === id) ?? PHOTO_FILTERS[0];
}
