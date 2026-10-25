"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type FadeInProps = {
  children: ReactNode;
  delay?: number;
  /** Render as a list item so it can sit directly inside <ol>/<ul>. */
  as?: "div" | "li";
  className?: string;
};

export function FadeIn({ children, delay = 0, as = "div", className }: FadeInProps) {
  const reduce = useReducedMotion();
  const Component = as === "li" ? motion.li : motion.div;
  return (
    <Component
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </Component>
  );
}
