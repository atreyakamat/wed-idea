import { fitFontSize, MM_PER_PT } from "@/lib/polaroid/fit-text";
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

// CSS variables set by the fonts in src/lib/polaroid/fonts.ts.
const FONT_FAMILY: Record<FontRole, string> = {
  script: "var(--font-polaroid-script), cursive",
  serif: "var(--font-polaroid-serif), Georgia, serif",
  hand: "var(--font-polaroid-hand), cursive",
  display: "var(--font-heading), Georgia, serif",
};

type Props = {
  template: PolaroidTemplate;
  palette: Palette;
  text: CardText;
  /** Photo URL; a soft placeholder is drawn when missing. */
  photoHref?: string | null;
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

/**
 * Renders one polaroid card as SVG in millimetre units (viewBox 54 × 86).
 * The same component draws the on-screen preview and the print sheet, so
 * what the couple approves is exactly what gets printed.
 */
export function PolaroidCard({ template, palette, text, photoHref, uid, className, x, y, width, height }: Props) {
  const c = (ref: ColorRef) => (ref.startsWith("#") ? ref : palette[ref as keyof Palette]);
  const { photo, background } = template;
  const clipId = `${uid}-photo`;
  const patternId = `${uid}-pattern`;
  const label = `${template.name} polaroid for ${text.names}`;

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
        {background.pattern ? (
          <pattern
            id={patternId}
            width={background.pattern.spacingMm}
            height={background.pattern.spacingMm}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={background.pattern.spacingMm / 2}
              cy={background.pattern.spacingMm / 2}
              r={background.pattern.radiusMm}
              fill={c(background.pattern.color)}
            />
          </pattern>
        ) : null}
      </defs>

      <rect width={CARD_WIDTH_MM} height={CARD_HEIGHT_MM} fill={c(background.color)} />
      {background.pattern ? <rect width={CARD_WIDTH_MM} height={CARD_HEIGHT_MM} fill={`url(#${patternId})`} /> : null}

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
        />
      ) : null}
      {photo.stroke ? (
        <rect
          x={photo.x}
          y={photo.y}
          width={photo.w}
          height={photo.h}
          fill="none"
          stroke={c(photo.stroke.color)}
          strokeWidth={photo.stroke.widthMm}
        />
      ) : null}

      {template.decorations.map((d, i) => (
        <DecorationShape key={i} decoration={d} color={c(d.color)} />
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
