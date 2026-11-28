"use client";
import { motion } from "framer-motion";
import { I, type IconName } from "./icons";
import { smooth, tap } from "./motion";

export type View = "camera" | "looks" | "builder" | "roll" | "share" | "build" | "settings" | "profile" | "learn";
const TABS: [View, string, IconName][] = [
  ["camera", "Camera", "camera"],
  ["looks", "Looks", "looks"],
  ["roll", "Roll", "roll"],
  ["build", "Build", "build"],
];

/** Which tab should light up for a screen that is not itself a tab. */
const GROUP: Record<string, View> = { builder: "looks", share: "looks", settings: "looks", profile: "looks" };

export function Nav({ view, onChange, disabled }: { view: View; onChange: (v: View) => void; disabled?: boolean }) {
  const active = GROUP[view] ?? view;
  return (
    <nav aria-label="Main" className="relative z-30 flex shrink-0 justify-center border-t border-white/[0.07] bg-black/80 px-3 pt-1.5 backdrop-blur-xl safe-b">
      {TABS.map(([v, label, icon]) => {
        const on = active === v;
        return (
          <button key={v} aria-current={on ? "page" : undefined} disabled={disabled} onClick={() => { tap(); onChange(v); }}
            className="flex flex-1 flex-col items-center gap-[3px] pb-1.5 pt-1 disabled:opacity-40">
            <motion.span animate={{ scale: on ? 1 : 0.94 }} transition={smooth} className={on ? "text-[var(--accent)]" : "text-white/40"}>
              <I n={icon} className="h-[23px] w-[23px]" w={1.7} />
            </motion.span>
            <span className={`text-[0.6875rem] font-medium ${on ? "text-[var(--accent)]" : "text-white/40"}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
