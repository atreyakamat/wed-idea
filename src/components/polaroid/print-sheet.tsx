import { computeSheetLayout } from "@/lib/polaroid/sheet";
import { CARD_HEIGHT_MM, CARD_WIDTH_MM, type CardText, type Palette, type PolaroidTemplate } from "@/lib/polaroid/types";
import { PolaroidCard } from "./polaroid-card";

export type SheetCard = {
  key: string;
  template: PolaroidTemplate;
  palette: Palette;
  text: CardText;
  photoHref: string | null;
};

const MARK_GAP_MM = 1.5;
const MARK_COLOR = "#9a9a9a";
const MARK_WIDTH_MM = 0.15;

/**
 * One A4 sheet of mini polaroids with crop marks in the margins. Rendered at
 * true size (210 × 297 mm); print at 100% / "Actual size" with no margins.
 */
export function PrintSheet({ cards, uid }: { cards: SheetCard[]; uid: string }) {
  const layout = computeSheetLayout();
  const { pageWidth: W, pageHeight: H, slots, cutsX, cutsY } = layout;
  const top = Math.min(...slots.map((s) => s.y));
  const bottom = Math.max(...slots.map((s) => s.y + s.h));
  const left = Math.min(...slots.map((s) => s.x));
  const right = Math.max(...slots.map((s) => s.x + s.w));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={`${W}mm`}
      height={`${H}mm`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Print sheet with ${Math.min(cards.length, slots.length)} polaroids`}
      className="block bg-white"
    >
      <rect width={W} height={H} fill="#ffffff" />

      <g stroke={MARK_COLOR} strokeWidth={MARK_WIDTH_MM}>
        {cutsX.map((x) => (
          <g key={`x${x}`}>
            <line x1={x} x2={x} y1={0.5} y2={top - MARK_GAP_MM} />
            <line x1={x} x2={x} y1={bottom + MARK_GAP_MM} y2={H - 0.5} />
          </g>
        ))}
        {cutsY.map((y) => (
          <g key={`y${y}`}>
            <line y1={y} y2={y} x1={0.5} x2={left - MARK_GAP_MM} />
            <line y1={y} y2={y} x1={right + MARK_GAP_MM} x2={W - 0.5} />
          </g>
        ))}
      </g>

      {slots.map((slot, i) => {
        const card = cards[i];
        if (!card) return null;
        const inner = (
          <PolaroidCard
            uid={`${uid}-${card.key}`}
            template={card.template}
            palette={card.palette}
            text={card.text}
            photoHref={card.photoHref}
            width={CARD_WIDTH_MM}
            height={CARD_HEIGHT_MM}
          />
        );
        // Sideways slots: turn the card 90° clockwise around the slot's top-right corner.
        return slot.rotated ? (
          <g key={card.key} transform={`translate(${slot.x + slot.w} ${slot.y}) rotate(90)`}>
            {inner}
          </g>
        ) : (
          <g key={card.key} transform={`translate(${slot.x} ${slot.y})`}>
            {inner}
          </g>
        );
      })}
    </svg>
  );
}
