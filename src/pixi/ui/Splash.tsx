"use client";
import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PixiMark } from "./Logo";

export function Splash({ show, onDone }: { show: boolean; onDone: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => { if (!show) return; const t = setTimeout(onDone, reduce ? 500 : 1900); return () => clearTimeout(t); }, [show, onDone, reduce]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div key="splash" className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black" exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ duration: 1.6, ease: "easeOut" }}>
            <PixiMark size={112} animate={!reduce} />
          </motion.div>
          <motion.h1 className="mt-6 text-[1.75rem] font-bold" initial={{ opacity: 0, letterSpacing: "0.5em" }} animate={{ opacity: 1, letterSpacing: "0.12em" }} transition={{ delay: 1.0, duration: 0.7, ease: "easeOut" }}>PIXI</motion.h1>
          <motion.p className="mt-2 text-[0.8125rem] text-white/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.35 }}>retro cameras. on your phone.</motion.p>
          <motion.div className="pointer-events-none absolute inset-0 bg-white" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 0.85, 0] }} transition={{ delay: 0.5, duration: 0.5, times: [0, 0.2, 0.3, 1] }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
