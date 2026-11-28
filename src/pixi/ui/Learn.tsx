"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { I, type IconName } from "./icons";
import { press, reveal, snappy, tap } from "./motion";

/**
 * Everything Pixi can do, in one place, with a way straight to each feature.
 *
 * Without this the app relies on people finding things: lenses live in the camera shelf, prints
 * under More frames, profiles behind an avatar. Each card says what a feature is for in a sentence
 * and opens it, so nobody has to go looking.
 */

export type LearnDest = "camera" | "shelf" | "lens" | "looks" | "roll" | "build" | "frames" | "prints" | "profile" | "settings" | "folder";

interface Card {
  id: string;
  icon: IconName;
  title: string;
  what: string;
  /** Where it lives, in the words someone would use to find it. */
  where: string;
  go?: LearnDest;
  /** Extra words that should match a search without cluttering the card. */
  terms?: string;
}

const CARDS: Card[] = [
  { id: "camera", icon: "camera", title: "The camera", what: "Pinch to zoom, tap to focus. Hold the shutter to record video instead of a photo.", where: "The Camera tab", go: "camera", terms: "video record zoom focus shutter" },
  { id: "cameras", icon: "film", title: "Cameras and film", what: "Each camera is a look: a disposable, a camcorder, a 2000s compact. Film changes the colour on top.", where: "Tap the camera's name under the viewfinder", go: "shelf", terms: "disposable camcorder digicam vhs y2k preset body" },
  { id: "lens", icon: "wand", title: "Lenses", what: "Fisheye, Wide, Soft, Prism and Scope sit in front of whatever camera you have loaded, so any look can be shot through any of them.", where: "Camera shelf → Lens", go: "lens", terms: "fisheye wide prism soft scope bend barrel" },
  { id: "looks", icon: "looks", title: "Looks", what: "Every look in one grid, with your favourites first. Tap one to load it into the camera.", where: "The Looks tab", go: "looks", terms: "presets filters favourites" },
  { id: "builder", icon: "sliders", title: "Build your own look", what: "Stack layers — grain, grade, distortion, flash — and save the result as your own camera. Turn on Advanced in Settings to see it.", where: "Settings → Advanced, then Looks → +", go: "settings", terms: "layers custom preset advanced make create" },
  { id: "roll", icon: "roll", title: "Your roll", what: "Everything you shoot stays here on the phone. Bring photos and videos in from your phone, save them out, or send them to Build.", where: "The Roll tab", go: "roll", terms: "import export gallery delete bin restore video" },
  { id: "like", icon: "heart", title: "Liking a shot", what: "Open any shot and tap the heart, or double-tap the photo itself. Liked shots show a small heart on the grid.", where: "Roll → open a shot", go: "roll", terms: "heart favourite double tap" },
  { id: "details", icon: "info", title: "Shot details", what: "Drag the Details handle down (or tap it) to see the look, film and camera used, and roughly where it was taken — if you've allowed location.", where: "Roll → open a shot → Details", go: "roll", terms: "metadata location gps where filter camera info" },
  { id: "build", icon: "build", title: "Build", what: "Turn your photos into something to post: a carousel, a photobooth strip, a contact sheet or a print.", where: "The Build tab", go: "build", terms: "carousel strip sheet print post make" },
  { id: "frames", icon: "grid", title: "Thirty frames", what: "Glass, Noir, Editorial, Panorama, Zine, Newsprint and more. Six are shown; the rest are under More frames.", where: "Build → Frame", go: "frames", terms: "styles templates layouts glass noir editorial panorama zine" },
  { id: "pano", icon: "image", title: "Panoramas", what: "Panorama and Film Roll stretch one photo across every page, so the picture runs on unbroken as people swipe.", where: "Build → Frame → Panorama", go: "frames", terms: "seamless continuous wide swipe" },
  { id: "prints", icon: "save", title: "Prints and stickers", what: "4×6, 8×10 and sticker sheets, exported at 300 DPI so a print shop can use them.", where: "Build → Frame → More frames", go: "prints", terms: "300 dpi sticker 4x6 8x10 paper" },
  { id: "profile", icon: "user", title: "Your profile", what: "A name, a handle and up to three looks, shared as a link or a QR. No account, and nothing is uploaded — the link carries it.", where: "Looks → your avatar", go: "profile", terms: "share handle qr link account" },
  { id: "folder", icon: "save", title: "Where photos go", what: "Pick any folder on your phone and Pixi saves there. Otherwise photos go to a Pixi album in your gallery.", where: "Settings → Where photos go", go: "folder", terms: "save storage folder gallery album download" },
];

/** The five steps of making a carousel, which is what most people come to Build for. */
const CAROUSEL_STEPS: { n: number; title: string; body: string }[] = [
  { n: 1, title: "Pick your photos", body: "Open Build and tap Photos. Add all fills every page from your roll in one tap, or tap photos one at a time to choose the order." },
  { n: 2, title: "Pick a frame", body: "Tap Frame. Six are shown, and More frames opens the other twenty-four. Square and Story are there too, for a square post or a story." },
  { n: 3, title: "Write the words", body: "Tap Text. Each frame has its own fields — a caption, a headline, a step title. Sign it puts your @handle on the last page." },
  { n: 4, title: "Check the swipe", body: "Swipe the preview to see each page the way someone scrolling will. The counter under the title says how many pages you have." },
  { n: 5, title: "Post it", body: "Save sends every page to your roll and your phone, numbered in order. Instagram takes 20 photos per post, so a longer set becomes more than one post — Build tells you how many." },
];

export function Learn({ onClose, onGo }: { onClose: () => void; onGo: (d: LearnDest) => void }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "carousel">("all");

  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return CARDS;
    return CARDS.filter((c) => `${c.title} ${c.what} ${c.where} ${c.terms ?? ""}`.toLowerCase().includes(needle));
  }, [q]);

  return (
    <section className="pb-10">
      <header className="safe-t flex items-center justify-between px-4 pb-4 pt-3">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.02em]">Learn</h1>
        <motion.button whileTap={press} transition={snappy} aria-label="Close" onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09]"><I n="close" className="h-[18px] w-[18px]" /></motion.button>
      </header>

      <div className="mx-4 mb-4 flex rounded-xl bg-white/[0.07] p-[3px]">
        {([["all", "Everything"], ["carousel", "Make a carousel"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { tap(); setTab(k); }}
            className={`relative flex-1 rounded-[9px] py-1.5 text-[0.8125rem] font-medium ${tab === k ? "bg-white/[0.14] text-white" : "text-white/55"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "all" ? (
        <>
          <div className="px-4 pb-4">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search features" aria-label="Search features"
              className="w-full rounded-2xl bg-white/[0.07] px-4 py-3 text-[0.9375rem] outline-none placeholder:text-white/35 focus:ring-2 focus:ring-[var(--accent)]" />
          </div>

          {found.length === 0 ? (
            <p className="px-6 text-center text-[0.875rem] leading-relaxed text-white/45">
              Nothing matches “{q}”. Try “carousel”, “lens”, “save” or “print”.
            </p>
          ) : (
            <div className="space-y-3 px-4">
              {found.map((c) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reveal}
                  className="rounded-[18px] bg-white/[0.05] p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08]">
                      <I n={c.icon} className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[1rem] font-semibold">{c.title}</h2>
                      <p className="mt-1 text-[0.875rem] leading-relaxed text-white/60">{c.what}</p>
                      <p className="mt-2 text-[0.75rem] text-white/35">{c.where}</p>
                    </div>
                  </div>
                  {c.go && (
                    <button onClick={() => { tap(); onGo(c.go!); }}
                      className="mt-3 w-full rounded-xl bg-white/[0.1] py-2.5 text-[0.8125rem] font-semibold">
                      Take me there
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3 px-4">
          <p className="px-1 pb-1 text-[0.875rem] leading-relaxed text-white/55">
            A carousel is one post people swipe through. Five steps, start to finish.
          </p>
          {CAROUSEL_STEPS.map((s) => (
            <motion.div key={s.n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reveal}
              className="flex gap-3 rounded-[18px] bg-white/[0.05] p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[0.875rem] font-bold text-black">{s.n}</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[0.9375rem] font-semibold">{s.title}</h2>
                <p className="mt-1 text-[0.875rem] leading-relaxed text-white/60">{s.body}</p>
              </div>
            </motion.div>
          ))}
          <button onClick={() => { tap(); onGo("build"); }}
            className="mt-1 w-full rounded-2xl bg-white py-3.5 text-[0.9375rem] font-semibold text-black">
            Start one now
          </button>
        </div>
      )}
    </section>
  );
}
