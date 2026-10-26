import { fitFontSize, MM_PER_PT } from "@/lib/polaroid/fit-text";
import { getFilter, type FilterStep } from "@/lib/polaroid/filters";
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  type CardText,
  type ColorRef,
  type FontRole,
  type Palette,
  type PolaroidTemplate,
  type TextSlot,
} from "@/lib/polaroid/types";
import { DecorationShape } from "./decorations";

// CSS variables set by the fonts in src/lib/polaroid/fonts.ts and the root layout.
const FONT_FAMILY: Record<FontRole, string> = {
  script: "var(--font-polaroid-script), cursive",
  serif: "var(--font-polaroid-serif), Georgia, serif",
  hand: "var(--font-polaroid-hand), cursive",
  display: "var(--font-heading), Georgia, serif",
  sans: "var(--font-body), system-ui, sans-serif",
  mono: "var(--font-polaroid-mono), ui-monospace, monospace",
};

type Props = {
  template: PolaroidTemplate;
  palette: Palette;
  text: CardText;
  /** Photo URL; a soft placeholder is drawn when missing. */
  photoHref?: string | null;
  /** Photo filter id from src/lib/polaroid/filters.ts. */
  filterId?: string | null;
  /** Unique per card on the page, for SVG ids. */
  uid: string;
  className?: string;
  /** Position when nested inside a larger SVG (the print sheet). */
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
};

function slotValue(slot: TextSlot, text: CardText): string {
  const raw =
    slot.field === "static" ? (slot.value ?? "") : slot.field === "place" ? (text.place ?? "") : text[slot.field];
  return slot.uppercase ? raw.toUpperCase() : raw;
}

function FilterPrimitive({ step }: { step: FilterStep }) {
  switch (step.type) {
    case "matrix":
      return <feColorMatrix type="matrix" values={step.values.join(" ")} />;
    case "saturate":
      return <feColorMatrix type="saturate" values={String(step.value)} />;
    case "levels":
      return (
        <feComponentTransfer>
          <feFuncR type="linear" slope={step.slope} intercept={step.intercept} />
          <feFuncG type="linear" slope={step.slope} intercept={step.intercept} />
          <feFuncB type="linear" slope={step.slope} intercept={step.intercept} />
        </feComponentTransfer>
      );
  }
}

/** One azulejo tile, drawn in a square of side s. */
function AzulejoTile({ s, color }: { s: number; color: string }) {
  const c = s / 2;
  const stroke = { fill: "none", stroke: color, strokeWidth: s * 0.03 };
  return (
    <g>
      <rect x={s * 0.04} y={s * 0.04} width={s * 0.92} height={s * 0.92} {...stroke} />
      {[0, 1, 2, 3].map((i) => (
        <ellipse key={i} cx={c} cy={c - s * 0.2} rx={s * 0.09} ry={s * 0.19} fill={color} transform={`rotate(${i * 90} ${c} ${c})`} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <ellipse key={`d${i}`} cx={c} cy={c - s * 0.17} rx={s * 0.04} ry={s * 0.11} fill={color} opacity={0.55} transform={`rotate(${45 + i * 90} ${c} ${c})`} />
      ))}
      <circle cx={c} cy={c} r={s * 0.07} fill="#ffffff" stroke={color} strokeWidth={s * 0.025} />
      {[
        [0, 0],
        [s, 0],
        [0, s],
        [s, s],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={s * 0.2} fill={color} />
      ))}
    </g>
  );
}

/**
 * Renders one polaroid card as SVG in millimetre units (viewBox 54 × 86).
 * The same component draws the on-screen preview and the print sheet, so
 * what the couple approves is exactly what gets printed.
 */
export function PolaroidCard({ template, palette, text, photoHref, filterId, uid, className, x, y, width, height }: Props) {
  const c = (ref: ColorRef) => (ref.startsWith("#") ? ref : palette[ref as keyof Palette]);
  const { photo, background } = template;
  const pattern = background.pattern;
  const filter = getFilter(filterId);
  const clipId = `${uid}-photo`;
  const patternId = `${uid}-pattern`;
  const filterSvgId = `${uid}-filter`;
  const label = `${template.name} polaroid for ${text.names}`;
  const photoTransform = photo.rotate
    ? `rotate(${photo.rotate} ${photo.x + photo.w / 2} ${photo.y + photo.h / 2})`
    : undefined;

  return (
    <svg
      viewBox={`0 0 ${CARD_WIDTH_MM} ${CARD_HEIGHT_MM}`}
      x={x}
      y={y}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={photo.x} y={photo.y} width={photo.w} height={photo.h} />
        </clipPath>
        {pattern ? (
          <pattern id={patternId} width={pattern.spacingMm} height={pattern.spacingMm} patternUnits="userSpaceOnUse">
            {pattern.kind === "dots" ? (
              <circle
                cx={pattern.spacingMm / 2}
                cy={pattern.spacingMm / 2}
                r={pattern.radiusMm}
                fill={c(pattern.color)}
              />
            ) : (
              <AzulejoTile s={pattern.spacingMm} color={c(pattern.color)} />
            )}
          </pattern>
        ) : null}
        {filter.steps.length ? (
          <filter id={filterSvgId} colorInterpolationFilters="sRGB">
            {filter.steps.map((step, i) => (
              <FilterPrimitive key={i} step={step} />
            ))}
          </filter>
        ) : null}
      </defs>

      <rect width={CARD_WIDTH_MM} height={CARD_HEIGHT_MM} fill={c(background.color)} />
      {pattern ? <rect width={CARD_WIDTH_MM} height={CARD_HEIGHT_MM} fill={`url(#${patternId})`} /> : null}

      <g transform={photoTransform}>
        {photo.stroke ? (
          // Stroke drawn first and outside the photo, like a print border.
          <rect
            x={photo.x - photo.stroke.widthMm / 2}
            y={photo.y - photo.stroke.widthMm / 2}
            width={photo.w + photo.stroke.widthMm}
            height={photo.h + photo.stroke.widthMm}
            fill="none"
            stroke={c(photo.stroke.color)}
            strokeWidth={photo.stroke.widthMm}
          />
        ) : null}
        <rect x={photo.x} y={photo.y} width={photo.w} height={photo.h} fill="#e9e3da" />
        {photoHref ? (
          <image
            href={photoHref}
            x={photo.x}
            y={photo.y}
            width={photo.w}
            height={photo.h}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            filter={filter.steps.length ? `url(#${filterSvgId})` : undefined}
          />
        ) : null}
      </g>

      {template.decorations.map((d, i) => (
        <DecorationShape
          key={i}
          decoration={d}
          color={c(d.color)}
          outlineColor={d.outline ? c(d.outline.color) : undefined}
        />
      ))}

      {template.text.map((slot, i) => {
        const value = slotValue(slot, text);
        if (!value) return null;
        const { sizePt, overflows } = fitFontSize(value, slot);
        const sizeMm = sizePt * MM_PER_PT;
        return (
          <text
            key={i}
            x={slot.x}
            y={slot.y}
            fill={c(slot.color)}
            textAnchor={slot.anchor ?? "start"}
            transform={slot.rotate ? `rotate(${slot.rotate} ${slot.x} ${slot.y})` : undefined}
            style={{
              fontFamily: FONT_FAMILY[slot.font],
              fontSize: sizeMm,
              fontStyle: slot.italic ? "italic" : "normal",
              letterSpacing: slot.letterSpacingEm ? slot.letterSpacingEm * sizeMm : undefined,
            }}
            {...(overflows ? { textLength: slot.maxWidthMm, lengthAdjust: "spacingAndGlyphs" } : {})}
          >
            {value}
          </text>
        );
      })}
    </svg>
  );
}
