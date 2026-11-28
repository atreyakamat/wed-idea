"use client";
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { reveal } from "./motion";
import { developedFeel } from "./feel";

/** How long the picture takes to come up. Long enough to watch, short enough not to be in the way. */
export const DEVELOP_MS = 2400;
const HOLD_MS = 380;

/**
 * Chemistry is not linear: an instant print stays nearly blank, then the image arrives in a rush
 * and spends the last moments settling its colour. This curve does the same.
 */
const CHEMISTRY = [0.55, 0, 0.25, 1] as const;

/**
 * The shot comes out blank and fills in, the way an instant print does. It never takes a tap and
 * the camera stays live throughout. When it is done it shrinks into the last-shot button (they share
 * a layoutId), so the photo visibly goes where it now lives.
 */
export function DevelopCard({ id, src, onDone }: { id: string; src: string; onDone: () => void }) {
  const still = useReducedMotion();

  useEffect(() => {
    const ms = still ? 400 : DEVELOP_MS;
    const done = setTimeout(developedFeel, ms);
    const end = setTimeout(onDone, ms + HOLD_MS);
    return () => { clearTimeout(done); clearTimeout(end); };
  }, [still, onDone]);

  return (
    <motion.div
      layoutId={`shot-${id}`}
      aria-hidden data-pixi="develop"
      className="pointer-events-none fixed bottom-[148px] left-6 z-[55] w-[112px] rounded-[8px] bg-[#FBF8F2] p-[7px] pb-[24px] shadow-[0_18px_40px_rgba(0,0,0,.7),0_2px_6px_rgba(0,0,0,.4)]"
      initial={still ? { opacity: 0 } : { y: 90, opacity: 0, scale: 0.7, rotate: -6 }}
      animate={{ y: 0, opacity: 1, scale: 1, rotate: still ? 0 : -1.5 }}
      transition={reveal}
    >
      <motion.img
        src={src} alt=""
        className="block aspect-square w-full rounded-[2px] bg-[#EFEAE0] object-cover"
        initial={still ? false : { opacity: 0.08, filter: "brightness(2.1) contrast(0.18) saturate(0.05) sepia(0.6) blur(1.5px)" }}
        animate={{ opacity: 1, filter: "brightness(1) contrast(1) saturate(1) sepia(0) blur(0px)" }}
        transition={{ duration: still ? 0 : DEVELOP_MS / 1000, ease: CHEMISTRY }}
      />
    </motion.div>
  );
}
