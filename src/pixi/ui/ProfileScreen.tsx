"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import { I } from "./icons";
import { fade, press, reveal, smooth, snappy, tap } from "./motion";
import { shareText } from "./native";
import { cleanHandle, encodeProfile, hasProfile, makeAvatar, MAX_LOOKS, MAX_PHOTOS, profileLink, siteOrigin, type Profile } from "./profile";
import { CARD_H, CARD_W, renderProfileCard } from "./profileCard";
import type { SavedLook } from "./store";

export interface ProfileShot { id: string; url: string; blob: Blob; kind: "photo" | "video" }
export interface ProfileLook { id: string; name: string; mine: boolean }

interface Props {
  profile: Profile;
  /** Always called with an updater, so quick taps build on each other instead of on a stale copy. */
  setProfile: (f: (p: Profile) => Profile) => void;
  shots: ProfileShot[];
  /** Looks the person can feature, most relevant first. */
  looks: ProfileLook[];
  myLooks: SavedLook[];
  isBuiltin: (id: string) => boolean;
  onShareImage: (blob: Blob) => Promise<void>;
  onKeepImage: (blob: Blob) => Promise<void>;
  onImportPhotos: (files: FileList | null) => void;
  onOpenCamera: () => void;
  onClose: () => void;
  say: (m: string) => void;
}

const loadImage = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

function Field({ label, value, onChange, placeholder, max, prefix, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; max: number; prefix?: string; mono?: boolean }) {
  return (
    <label className="flex items-center gap-3 px-4 py-3">
      <span className="w-[4.5rem] shrink-0 text-[0.9375rem] text-white/55">{label}</span>
      {prefix && <span className="-mr-2 text-[0.9375rem] text-white/35">{prefix}</span>}
      <input value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoCapitalize={mono ? "none" : "words"} autoCorrect="off" spellCheck={false}
        className={`min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-white/25 ${mono ? "lcd tracking-normal" : ""}`} />
    </label>
  );
}

export function ProfileScreen({ profile, setProfile, shots, looks, myLooks, isBuiltin, onShareImage, onKeepImage, onImportPhotos, onOpenCamera, onClose, say }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bitmaps = useRef(new Map<string, ImageBitmap>());
  const [tick, setTick] = useState(0);
  const [avatarImg, setAvatarImg] = useState<HTMLImageElement | null>(null);
  const [qr, setQr] = useState<{ img: HTMLImageElement; url: string } | null>(null);
  const [code, setCode] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);

  const photos = useMemo(() => shots.filter((s) => s.kind === "photo"), [shots]);
  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));
  const origin = useMemo(() => siteOrigin(), []);
  const link = code && origin ? profileLink(code, origin) : "";
  const started = hasProfile(profile);

  useEffect(() => () => { bitmaps.current.forEach((b) => b.close()); bitmaps.current.clear(); }, []);

  // Avatar image.
  useEffect(() => {
    let dead = false;
    void (async () => { const img = profile.avatar ? await loadImage(profile.avatar) : null; if (!dead) setAvatarImg(img); })();
    return () => { dead = true; };
  }, [profile.avatar]);

  // Featured photos, decoded once each at a size that suits the card.
  const wanted = profile.photoIds.join(",");
  useEffect(() => {
    let dead = false;
    void (async () => {
      for (const id of profile.photoIds) {
        if (bitmaps.current.has(id)) continue;
        const s = shots.find((x) => x.id === id);
        if (!s) continue;
        try { const b = await createImageBitmap(s.blob, { resizeWidth: 720, resizeQuality: "high" }); if (dead) { b.close(); return; } bitmaps.current.set(id, b); setTick((t) => t + 1); } catch { /* unreadable photo: its slot stays empty */ }
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, shots]);

  // The shareable code, and its QR when it fits in one.
  const lookKey = profile.lookIds.join(",");
  useEffect(() => {
    let dead = false;
    void (async () => {
      if (!hasProfile(profile)) { if (!dead) { setCode(""); setQr(null); } return; }
      const c = await encodeProfile(profile, myLooks, isBuiltin);
      if (dead) return;
      setCode(c);
      try {
        const url = await QRCode.toDataURL(origin ? profileLink(c, origin) : c, { errorCorrectionLevel: "L", margin: 1, width: 600 });
        const img = await loadImage(url);
        if (!dead) setQr(img ? { img, url } : null);
      } catch { if (!dead) setQr(null); } // too much for one QR: the link and the card still work
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.name, profile.handle, profile.bio, lookKey, myLooks, origin]);

  const lookNames = profile.lookIds.map((id) => looks.find((l) => l.id === id)?.name).filter((n): n is string => !!n);
  const input = () => ({
    profile, avatar: avatarImg, qr: qr?.img ?? null, lookNames,
    photos: profile.photoIds.map((id) => bitmaps.current.get(id)).filter((b): b is ImageBitmap => !!b),
  });

  useEffect(() => {
    if (canvasRef.current) renderProfileCard(canvasRef.current, input(), 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, avatarImg, qr, tick, lookNames.join("|")]);

  const makeCard = async (): Promise<Blob | null> => {
    const c = document.createElement("canvas");
    renderProfileCard(c, input(), 1);
    return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.93));
  };
  const act = async (what: "share" | "keep") => {
    if (busy) return;
    tap(); setBusy(true);
    try {
      const b = await makeCard();
      if (!b) { say("The card didn't render. Try again."); return; }
      await (what === "share" ? onShareImage(b) : onKeepImage(b));
    } finally { setBusy(false); }
  };
  const sendLink = async () => {
    tap();
    const r = await shareText(link || code, profile.name.trim() ? `${profile.name.trim()} on Pixi` : "My Pixi profile");
    if (r === "copied") say(link ? "Link copied" : "Profile code copied");
    else if (r === "failed") say("Couldn't share or copy. Show the QR code instead.");
  };

  const togglePhoto = (id: string) => {
    tap();
    if (!profile.photoIds.includes(id) && profile.photoIds.length >= MAX_PHOTOS) say(`The card holds ${MAX_PHOTOS} photos. Tap one to take it off first.`);
    setProfile((p) => (p.photoIds.includes(id) ? { ...p, photoIds: p.photoIds.filter((x) => x !== id) } : p.photoIds.length < MAX_PHOTOS ? { ...p, photoIds: [...p.photoIds, id] } : p));
  };
  const toggleLook = (id: string) => {
    tap();
    if (!profile.lookIds.includes(id) && profile.lookIds.length >= MAX_LOOKS) say(`Pick up to ${MAX_LOOKS} looks. Tap one to swap it out.`);
    setProfile((p) => (p.lookIds.includes(id) ? { ...p, lookIds: p.lookIds.filter((x) => x !== id) } : p.lookIds.length < MAX_LOOKS ? { ...p, lookIds: [...p.lookIds, id] } : p));
  };
  const avatarFrom = async (blob: Blob | undefined) => {
    if (!blob) return;
    const a = await makeAvatar(blob);
    if (a) set({ avatar: a }); else say("That photo couldn't be used. Try another.");
  };

  const group = "overflow-hidden rounded-2xl bg-white/[0.06] divide-y divide-white/[0.06]";
  const h2 = "px-5 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white/35";

  return (
    <section className="pb-10">
      <header className="safe-t flex items-center justify-between px-4 pb-2 pt-3">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.02em]">Profile</h1>
        <motion.button whileTap={press} transition={snappy} onClick={onClose} aria-label="Close profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09]"><I n="close" className="h-[18px] w-[18px]" /></motion.button>
      </header>

      <motion.div initial={{ opacity: 0, y: 18, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={reveal} className="mx-auto mt-1 w-[min(72%,17rem)]">
        <canvas ref={canvasRef} role="img" aria-label="Your profile card" className="block w-full rounded-[14px] shadow-[0_18px_50px_rgba(0,0,0,.6)]" style={{ aspectRatio: `${CARD_W}/${CARD_H}` }} />
      </motion.div>

      <div className="mx-4 mt-5 flex gap-2">
        <motion.button whileTap={press} transition={snappy} disabled={!started || busy} onClick={() => act("share")} className="flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-white py-3.5 text-[0.9375rem] font-semibold text-black disabled:opacity-40">
          <I n="share" className="h-[18px] w-[18px] shrink-0" /> Share card
        </motion.button>
        <motion.button whileTap={press} transition={snappy} disabled={!started || busy} onClick={() => act("keep")} aria-label="Keep the card in your roll" className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-white/[0.09] disabled:opacity-40"><I n="save" className="h-[19px] w-[19px]" /></motion.button>
        <motion.button whileTap={press} transition={snappy} disabled={!code} onClick={sendLink} aria-label={link ? "Share your profile link" : "Share your profile code"} className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-white/[0.09] disabled:opacity-40"><I n="tag" className="h-[19px] w-[19px]" /></motion.button>
        <motion.button whileTap={press} transition={snappy} disabled={!qr} onClick={() => { tap(); setShowQr(true); }} aria-label="Show your profile QR code" className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-white/[0.09] disabled:opacity-40"><I n="grid" className="h-[19px] w-[19px]" /></motion.button>
      </div>
      <p className="mx-5 mt-2.5 text-[0.75rem] leading-snug text-white/40">
        {started ? "Your profile stays on this phone. The link and QR carry only your name, handle, bio and looks. Photos travel only on the card image." : "Add a name or a handle to make your card."}
      </p>

      <div className="mt-6 space-y-6 px-4">
        <div>
          <h2 className={h2}>You</h2>
          <div className={group}>
            <Field label="Name" value={profile.name} onChange={(v) => set({ name: v })} placeholder="Your name" max={40} />
            <Field label="Handle" value={profile.handle} onChange={(v) => set({ handle: cleanHandle(v) })} placeholder="yourhandle" max={24} prefix="@" mono />
            <Field label="Bio" value={profile.bio} onChange={(v) => set({ bio: v })} placeholder="One line about how you shoot" max={90} />
          </div>
        </div>

        <div>
          <h2 className={h2}>Picture</h2>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            <button onClick={() => { tap(); fileRef.current?.click(); }} className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full bg-white/[0.07] text-white/70"><I n="plus" className="h-5 w-5" /><span className="text-[0.6875rem]">Phone</span></button>
            <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Choose a profile picture" onChange={(e) => { void avatarFrom(e.target.files?.[0]); e.target.value = ""; }} />
            {profile.avatar && (
              <button onClick={() => { tap(); set({ avatar: null }); }} aria-label="Remove profile picture" className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full shadow-[inset_0_0_0_2px_var(--accent)]">
                <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/45"><I n="close" className="h-5 w-5" /></span>
              </button>
            )}
            {photos.slice(0, 18).map((s) => (
              <button key={s.id} onClick={() => { tap(); void avatarFrom(s.blob); }} aria-label="Use this photo as your picture" className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white/[0.05]">
                <img src={s.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className={h2}>Photos on your card · {profile.photoIds.length}/{MAX_PHOTOS}</h2>
          {photos.length === 0 ? (
            <div className={`${group} px-4 py-4`}>
              <p className="text-[0.9375rem] text-white/60">Your roll is empty, so there is nothing to show off yet.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => { tap(); onOpenCamera(); }} className="rounded-full bg-white px-4 py-2 text-[0.8125rem] font-semibold text-black">Take a photo</button>
                <label className="cursor-pointer rounded-full bg-white/[0.1] px-4 py-2 text-[0.8125rem] font-medium">From phone<input type="file" accept="image/*" multiple hidden onChange={(e) => { onImportPhotos(e.target.files); e.target.value = ""; }} /></label>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-[3px] overflow-hidden rounded-2xl">
              {photos.slice(0, 24).map((s) => {
                const at = profile.photoIds.indexOf(s.id);
                return (
                  <button key={s.id} onClick={() => togglePhoto(s.id)} aria-pressed={at >= 0} aria-label={at >= 0 ? `Photo ${at + 1} on your card. Tap to remove` : "Add this photo to your card"} className="relative aspect-square overflow-hidden bg-white/[0.04]">
                    <img src={s.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    <AnimatePresence>
                      {at >= 0 && (
                        <motion.span key="on" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} className="absolute inset-0 bg-black/35 shadow-[inset_0_0_0_2px_var(--accent)]">
                          <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={snappy} className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--accent)] text-[0.6875rem] font-bold text-black">{at + 1}</motion.span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h2 className={h2}>Looks you shoot with · {profile.lookIds.length}/{MAX_LOOKS}</h2>
          <div className="flex flex-wrap gap-2">
            {looks.map((l) => {
              const on = profile.lookIds.includes(l.id);
              return (
                <motion.button key={l.id} layout transition={smooth} whileTap={press} onClick={() => toggleLook(l.id)} aria-pressed={on}
                  className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[0.8125rem] font-medium transition-colors ${on ? "bg-[var(--accent)] text-black" : "bg-white/[0.08] text-white/80"}`}>
                  {l.name}{l.mine ? " · yours" : ""}
                </motion.button>
              );
            })}
          </div>
          <p className="mt-2.5 px-1 text-[0.75rem] leading-snug text-white/40">Anyone who opens your link or scans your QR can add these looks to their own Pixi.</p>
        </div>
      </div>

      <AnimatePresence>
        {showQr && qr && (
          <motion.div key="qr" role="dialog" aria-label="Your profile QR code" className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/85 px-8 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} onClick={() => setShowQr(false)}>
            <motion.div initial={{ scale: 0.86, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }} transition={reveal} className="w-full max-w-[18rem] rounded-[28px] bg-white p-5 text-center text-black">
              <img src={qr.url} alt="QR code for your Pixi profile" className="w-full" style={{ imageRendering: "pixelated" }} />
              <div className="mt-3 text-[1.0625rem] font-semibold">{profile.name.trim() || `@${profile.handle}`}</div>
              <div className="mt-0.5 text-[0.8125rem] text-black/55">{link ? "Scan with any camera" : "Scan in Pixi: Looks, Share, Scan"}</div>
            </motion.div>
            <span className="mt-6 text-[0.8125rem] text-white/50">Tap anywhere to close</span>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
