"use client";
import { motion } from "framer-motion";

const N = 12, R = 31;
const pts = Array.from({ length: N }, (_, i) => { const a = (i / N) * Math.PI * 2 - Math.PI / 2; return [48 + Math.cos(a) * R, 48 + Math.sin(a) * R] as const; });

/** The Pixi mark: a lens ringed by 12 pixels, one of them the flash. Static or assembling. */
export function PixiMark({ size = 96, animate = false, tile = true }: { size?: number; animate?: boolean; tile?: boolean }) {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} role="img" aria-label="Pixi">
      <defs>
        <linearGradient id="pm-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#232329" /><stop offset="1" stopColor="#0a0a0d" /></linearGradient>
        <radialGradient id="pm-lens" cx=".35" cy=".3" r=".9"><stop offset="0" stopColor="#ffb066" /><stop offset=".45" stopColor="#ff7a1a" /><stop offset="1" stopColor="#7a2a00" /></radialGradient>
      </defs>
      {tile && <rect width="96" height="96" rx="22" fill="url(#pm-tile)" />}
      {pts.map(([x, y], i) => {
        const flash = i === 2;
        const el = <rect key={i} x={x - 3.2} y={y - 3.2} width="6.4" height="6.4" rx="1.6" fill={flash ? "#ffd8a8" : "#f4f1ea"} opacity={flash ? 1 : 0.85} />;
        return animate
          ? <motion.g key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 + i * 0.045, type: "spring", stiffness: 520, damping: 22 }} style={{ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" }}>{el}</motion.g>
          : el;
      })}
      {animate
        ? <motion.circle cx="48" cy="48" r="19" fill="url(#pm-lens)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.7, type: "spring", stiffness: 260, damping: 18 }} style={{ transformOrigin: "48px 48px" }} />
        : <circle cx="48" cy="48" r="19" fill="url(#pm-lens)" />}
      <circle cx="48" cy="48" r="11" fill="#0b0b0e" />
      <circle cx="48" cy="48" r="11" fill="none" stroke="#ffffff" strokeOpacity=".14" strokeWidth="1.5" />
      <circle cx="43" cy="43" r="3.2" fill="#fff" opacity=".55" />
    </svg>
  );
}
