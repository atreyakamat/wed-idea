"use client";
import { motion } from "framer-motion";
import { snappy } from "./motion";

/** One button, three states: photo, idle video, recording. The ring never moves; only the core does. */
export function Shutter({ video, recording, busy, onPress }: { video: boolean; recording: boolean; busy?: boolean; onPress: () => void }) {
  return (
    <motion.button
      aria-label={video ? (recording ? "Stop recording" : "Start recording") : "Take photo"}
      disabled={busy}
      onClick={onPress}
      whileTap={{ scale: 0.9 }}
      transition={snappy}
      className="relative flex h-[74px] w-[74px] items-center justify-center rounded-full disabled:opacity-40"
    >
      <span className="absolute inset-0 rounded-full border-[3px] border-white" />
      <motion.span
        initial={false}
        animate={
          recording ? { width: 28, height: 28, borderRadius: 7, backgroundColor: "#ff3b30" }
            : video ? { width: 58, height: 58, borderRadius: 29, backgroundColor: "#ff3b30" }
              : { width: 60, height: 60, borderRadius: 30, backgroundColor: "#ffffff" }
        }
        transition={snappy}
      />
    </motion.button>
  );
}
