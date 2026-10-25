import type { Decoration } from "@/lib/polaroid/types";

// Original line drawings for templates. Each shape is drawn in a 10 × 10
// box centred on (0, 0) and scaled to the decoration's size in mm.

const UNIT = 10;
/** Line weight on the printed card, in mm. */
const STROKE_MM = 0.32;

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

const shapes: Record<Exclude<Decoration["kind"], "band">, (p: ShapeProps) => React.ReactNode> = {
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
};

export function DecorationShape({ decoration, color }: { decoration: Decoration; color: string }) {
  const d = decoration;

  if (d.kind === "band") {
    return <rect x={d.x} y={d.y} width={d.w ?? 0} height={d.h ?? 0} rx={d.radius} fill={color} />;
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
    <g transform={transform}>
      {shapes[d.kind]({ color, strokeWidth: STROKE_MM / scale, filled: Boolean(d.filled) })}
    </g>
  );
}
