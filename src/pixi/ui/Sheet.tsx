"use client";
import { AnimatePresence, motion } from "framer-motion";
import { sheet as sheetT } from "./motion";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bd" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={sheetT} onClick={onClose} />
          <motion.div key="sh" role="dialog" aria-label={title}
            className="fixed inset-x-0 bottom-0 z-[51] mx-auto flex max-h-[76dvh] w-full max-w-md flex-col rounded-t-[28px] bg-[#131316] safe-b"
            style={{ boxShadow: "0 -1px 0 rgba(255,255,255,.09), 0 -24px 60px rgba(0,0,0,.6)" }}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={sheetT}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 700) onClose(); }}>
            <div className="flex shrink-0 flex-col items-center pt-2.5">
              <span className="h-[5px] w-9 rounded-full bg-white/18" />
              <h2 className="pb-2.5 pt-3 text-[0.8125rem] font-semibold text-white/50">{title}</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
