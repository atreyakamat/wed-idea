import { BOX_DECORATIONS, type Decoration } from "@/lib/polaroid/types";

// Original line drawings for templates. Centred shapes are drawn in a
// 10 × 10 box around (0, 0) and scaled to the decoration's size in mm. Box
// decorations (bands, sprockets, barcodes, dashed lines) use x, y, w, h.

const UNIT = 10;
/** Line weight on the printed card, in mm. */
const STROKE_MM = 0.32;

type CentredKind = Exclude<Decoration["kind"], (typeof BOX_DECORATIONS)[number]>;
type ShapeProps = { color: string; strokeWidth: number; filled: boolean };

function line(color: string, strokeWidth: number) {
  return {
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function Leaf({ x, y, angle, length, color }: { x: number; y: number; angle: number; length: number; color: string }) {
  const l = length;
  return (
    <path
      transform={`translate(${x} ${y}) rotate(${angle})`}
      d={`M0 0 Q${l / 2} ${-l * 0.38} ${l} 0 Q${l / 2} ${l * 0.38} 0 0Z`}
      fill={color}
    />
  );
}

const PAISLEY = "M-1 4.6 C-4.6 4.6 -4.8 -0.4 -2 -2.6 C0 -4.2 2.6 -4.8 4.6 -4.4 C2.8 -3.4 2.4 -1.6 2.8 0.4 C3.2 3 1.6 4.6 -1 4.6Z";

const shapes: Record<CentredKind, (p: ShapeProps) => React.ReactNode> = {
  sun: ({ color, strokeWidth }) => (
    <g {...line(color, strokeWidth)}>
      <circle r={2.1} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line key={i} x1={Math.cos(a) * 3.1} y1={Math.sin(a) * 3.1} x2={Math.cos(a) * 4.6} y2={Math.sin(a) * 4.6} />
        );
      })}
    </g>
  ),
  wave: ({ color, strokeWidth }) => (
    <g {...line(color, strokeWidth)}>
      <path d="M-5 -0.6 q1.25 -1.5 2.5 0 t2.5 0 t2.5 0 t2.5 0" />
      <path d="M-3.75 1.3 q1.25 -1.5 2.5 0 t2.5 0 t2.5 0" />
    </g>
  ),
  sparkle: ({ color, strokeWidth, filled }) => (
    <path
      d="M0 -5 C0.5 -0.5 0.5 -0.5 5 0 C0.5 0.5 0.5 0.5 0 5 C-0.5 0.5 -0.5 0.5 -5 0 C-0.5 -0.5 -0.5 -0.5 0 -5Z"
      {...(filled ? { fill: color } : line(color, strokeWidth))}
    />
  ),
  heart: ({ color, strokeWidth, filled }) => (
    <path
      d="M0 4 C-5 0.6 -4.6 -4 -2.1 -4 C-0.9 -4 0 -3.1 0 -2 C0 -3.1 0.9 -4 2.1 -4 C4.6 -4 5 0.6 0 4Z"
      {...(filled ? { fill: color } : line(color, strokeWidth))}
    />
  ),
  shell: ({ color, strokeWidth }) => (
    <g {...line(color, strokeWidth)}>
      <path d="M0 4 L-4.4 -0.8 Q-4 -4.4 0 -4.6 Q4 -4.4 4.4 -0.8 Z" />
      <path d="M0 4 L-2.8 -3.7 M0 4 L-1 -4.5 M0 4 L1 -4.5 M0 4 L2.8 -3.7" />
      <path d="M-1.3 4.6 H1.3" />
    </g>
  ),
  palm: ({ color, strokeWidth }) => (
    <g {...line(color, strokeWidth)}>
      <path d="M-0.4 5 Q0.7 1.2 0 -2" />
      <path d="M0 -2 Q-2.6 -4.2 -4.8 -2.1" />
      <path d="M0 -2 Q-2.2 -2.2 -3.6 0.4" />
      <path d="M0 -2 Q2.6 -4.2 4.8 -2.1" />
      <path d="M0 -2 Q2.2 -2.2 3.6 0.4" />
      <path d="M0 -2 Q0.4 -4.5 -0.9 -5" />
      <path d="M-0.5 1.6 H0.7 M-0.3 3.3 H0.8" />
    </g>
  ),
  leafSprig: ({ color, strokeWidth }) => (
    <g>
      <path d="M-4.6 4.6 Q-0.6 1.2 4.6 -4.6" {...line(color, strokeWidth)} />
      <Leaf x={-2.6} y={2.5} angle={-150} length={2.6} color={color} />
      <Leaf x={-1.6} y={1.6} angle={-20} length={2.6} color={color} />
      <Leaf x={0.4} y={-0.1} angle={-165} length={2.8} color={color} />
      <Leaf x={1.4} y={-1.2} angle={-35} length={2.8} color={color} />
      <Leaf x={3.1} y={-3} angle={-170} length={2.4} color={color} />
      <Leaf x={4.6} y={-4.6} angle={-60} length={2} color={color} />
    </g>
  ),
  blossom: ({ color }) => (
    <g>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        return <circle key={i} cx={Math.cos(a) * 2.2} cy={Math.sin(a) * 2.2} r={2.1} fill={color} />;
      })}
      <circle r={1.3} fill="#ffffff" opacity={0.75} />
      <circle r={0.6} fill={color} />
    </g>
  ),
  flourish: ({ color, strokeWidth }) => (
    <g {...line(color, strokeWidth)}>
      <path d="M-4.6 4.6 V-0.8 Q-4.6 -4.6 -0.8 -4.6 H4.6" />
      <path d="M-4.6 -0.4 Q-2 -0.4 -2 -2.4 Q-2 -3.9 -3.4 -3.4" />
      <path d="M-0.4 -4.6 Q-0.4 -2 -2.4 -2" />
      <circle cx={4.6} cy={-4.6} r={0.35} fill={color} />
      <circle cx={-4.6} cy={4.6} r={0.35} fill={color} />
    </g>
  ),
  bow: ({ color }) => (
    <g fill={color}>
      <path d="M0 0 C-2 -3.6 -5 -2.6 -4.7 0 C-4.4 2.4 -1.6 1.7 0 0Z" />
      <path d="M0 0 C2 -3.6 5 -2.6 4.7 0 C4.4 2.4 1.6 1.7 0 0Z" />
      <path d="M-0.6 0.6 L-2.3 4.6 L-1 4 L-0.2 4.9Z" />
      <path d="M0.6 0.6 L2.3 4.6 L1 4 L0.2 4.9Z" />
      <rect x={-1.1} y={-1.1} width={2.2} height={2.2} rx={0.6} />
      <rect x={-1.1} y={-1.1} width={2.2} height={2.2} rx={0.6} fill="#000000" opacity={0.15} />
    </g>
  ),
  plane: ({ color }) => (
    <path
      fill={color}
      d="M5 0.4 L1 0.6 L-1.6 4.6 L-2.6 4.6 L-1.2 0.6 L-3.6 0.5 L-4.4 1.6 L-5 1.6 L-4.6 0 L-5 -1.6 L-4.4 -1.6 L-3.6 -0.5 L-1.2 -0.6 L-2.6 -4.6 L-1.6 -4.6 L1 -0.6 L5 -0.4 Q5.4 0 5 0.4Z"
    />
  ),
  paisley: ({ color, strokeWidth }) => (
    <g>
      <path d={PAISLEY} {...line(color, strokeWidth)} />
      <path d={PAISLEY} transform="translate(-0.2 0.5) scale(0.55)" {...line(color, strokeWidth / 0.55)} />
      <circle cx={-0.9} cy={1.6} r={0.5} fill={color} />
      {[
        [-4.1, 2.4],
        [-4.5, 0.4],
        [-3.8, -1.6],
        [-2.2, -3.3],
        [0, -4.4],
      ].map(([cx, cy]) => (
        <circle key={`${cx}${cy}`} cx={cx * 1.12} cy={cy * 1.08} r={0.28} fill={color} />
      ))}
    </g>
  ),
  mandala: ({ color, strokeWidth }) => (
    <g>
      <circle r={4.1} {...line(color, strokeWidth)} />
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={i} cx={0} cy={-2.4} rx={0.9} ry={1.6} transform={`rotate(${i * 45})`} {...line(color, strokeWidth)} />
      ))}
      <circle r={0.9} fill={color} />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * Math.PI) / 8;
        return <circle key={i} cx={Math.cos(a) * 4.75} cy={Math.sin(a) * 4.75} r={0.25} fill={color} />;
      })}
    </g>
  ),
  dot: ({ color }) => <circle r={5} fill={color} />,
  tape: ({ color }) => (
    <g>
      <path
        fill={color}
        d="M-5 -1.6 L5 -1.6 L4.4 -1.07 L5 -0.53 L4.4 0 L5 0.53 L4.4 1.07 L5 1.6 L-5 1.6 L-4.4 1.07 L-5 0.53 L-4.4 0 L-5 -0.53 L-4.4 -1.07Z"
      />
      <path d="M-4 -1.6 L-3 1.6 M-1.5 -1.6 L-0.5 1.6 M1 -1.6 L2 1.6 M3.5 -1.6 L4.2 0.6" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={0.45} />
    </g>
  ),
};

// Fixed bar widths so every card's barcode is the same and reproducible.
const BARS = [2, 1, 3, 1, 1, 2, 1, 4, 2, 1, 1, 3, 2, 2, 1, 1, 3, 1, 2, 4, 1, 2, 1, 1, 2, 3];

function BoxShape({ d, color }: { d: Decoration; color: string }) {
  const w = d.w ?? 0;
  const h = d.h ?? 0;

  switch (d.kind) {
    case "band":
      return (
        <rect
          x={d.x}
          y={d.y}
          width={w}
          height={h}
          rx={d.radius}
          fill={color}
          stroke={d.outline ? undefined : "none"}
        />
      );
    case "sprockets": {
      const holeH = Math.min(1.7, w * 0.75);
      const pitch = 3.6;
      const count = Math.floor((h + pitch - holeH) / pitch);
      const top = d.y + (h - (count - 1) * pitch - holeH) / 2;
      return (
        <g fill={color}>
          {Array.from({ length: count }, (_, i) => (
            <rect key={i} x={d.x} y={top + i * pitch} width={w} height={holeH} rx={0.35} />
          ))}
        </g>
      );
    }
    case "barcode": {
      const unit = w / BARS.reduce((sum, b) => sum + b + 1, 0);
      // Left edge of each bar: running total of the bars and gaps before it.
      const starts = BARS.map((_, i) => d.x + BARS.slice(0, i).reduce((sum, b) => sum + (b + 1) * unit, 0));
      return (
        <g fill={color}>
          {BARS.map((b, i) => (
            <rect key={i} x={starts[i]} y={d.y} width={b * unit} height={h} />
          ))}
        </g>
      );
    }
    case "dashedLine":
      return (
        <line
          x1={d.x}
          x2={d.x + w}
          y1={d.y}
          y2={d.y}
          stroke={color}
          strokeWidth={0.25}
          strokeDasharray="1.2 0.9"
          strokeLinecap="round"
        />
      );
    default:
      return null;
  }
}

function isBox(kind: Decoration["kind"]): kind is (typeof BOX_DECORATIONS)[number] {
  return (BOX_DECORATIONS as readonly string[]).includes(kind);
}

export function DecorationShape({
  decoration,
  color,
  outlineColor,
}: {
  decoration: Decoration;
  color: string;
  outlineColor?: string;
}) {
  const d = decoration;

  if (isBox(d.kind)) {
    return (
      <g opacity={d.opacity}>
        <BoxShape d={d} color={color} />
        {d.kind === "band" && d.outline && outlineColor ? (
          <rect
            x={d.x}
            y={d.y}
            width={d.w ?? 0}
            height={d.h ?? 0}
            rx={d.radius}
            fill="none"
            stroke={outlineColor}
            strokeWidth={d.outline.widthMm}
          />
        ) : null}
      </g>
    );
  }

  const scale = d.size / UNIT;
  const transform = [
    `translate(${d.x} ${d.y})`,
    d.rotate ? `rotate(${d.rotate})` : "",
    `scale(${d.flip ? -scale : scale} ${scale})`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <g transform={transform} opacity={d.opacity}>
      {shapes[d.kind as CentredKind]({ color, strokeWidth: STROKE_MM / scale, filled: Boolean(d.filled) })}
    </g>
  );
}
