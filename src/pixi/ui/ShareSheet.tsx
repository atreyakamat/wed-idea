"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { NearbyPanel, type NearbyShot } from "./NearbyPanel";
import { decodeLook, encodeLook, type SavedLook } from "./store";
import { profileCodeFrom } from "./profile";
import { AnimatePresence, motion } from "framer-motion";
import { I } from "./icons";
import { Card } from "./Card";
import { press, snappy } from "./motion";

interface Props {
  looks: SavedLook[];
  focusId?: string;
  camLive: boolean;
  startCamera: () => void;
  getFrame: () => ImageData | null;
  onImport: (l: SavedLook) => void;
  /** Someone else's profile code: adds their looks and returns what to tell the person, or null if it is not one. */
  onImportProfile: (code: string) => Promise<string | null>;
  shots: NearbyShot[];
  onReceiveFile: (blob: Blob, name: string) => void;
  onClose: () => void;
}

export function ShareSheet({ looks, focusId, camLive, startCamera, getFrame, onImport, onImportProfile, shots, onReceiveFile, onClose }: Props) {
  const [sel, setSel] = useState(focusId ?? looks[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [note, setNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const done = useRef(false);

  // A new focus from outside replaces the selection; the sheet is keyed on it by the caller as well.
  const [seenFocus, setSeenFocus] = useState(focusId);
  if (focusId !== seenFocus) { setSeenFocus(focusId); if (focusId) setSel(focusId); }

  useEffect(() => {
    const l = looks.find((x) => x.id === sel);
    let dead = false;
    void (async () => {
      // Clearing after a tick keeps the previous code on screen until the new one is ready, with no synchronous setState in the effect.
      await Promise.resolve();
      if (dead) return;
      setQr(""); setCode(""); setNote("");
      if (!l) return;
      const c = await encodeLook(l);
      if (dead) return;
      setCode(c);
      try { const u = await QRCode.toDataURL(c, { errorCorrectionLevel: "L", margin: 2, width: 360 }); if (!dead) setQr(u); }
      catch { if (!dead) setNote("This look is too large for one QR code. Copy the code instead."); }
    })();
    return () => { dead = true; };
  }, [sel, looks]);

  const importCode = async (c: string) => {
    const pc = profileCodeFrom(c);
    if (pc) {
      const told = await onImportProfile(pc);
      setMsg(told ?? "That profile code is damaged. Ask for a fresh one.");
      return !!told;
    }
    const l = await decodeLook(c);
    if (!l) { setMsg("That is not a valid Pixi look."); return false; }
    onImport(l); setMsg(`Added “${l.name}” to My Looks.`); return true;
  };

  useEffect(() => {
    if (!scanning) return;
    done.current = false;
    const id = setInterval(async () => {
      if (done.current) return;
      const f = getFrame();
      if (!f) return;
      const r = jsQR(f.data, f.width, f.height, { inversionAttempts: "dontInvert" });
      if (r?.data.includes("PIXI")) { done.current = true; setScanning(false); await importCode(r.data); }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const copy = async () => { try { await navigator.clipboard.writeText(code); setMsg("Code copied."); } catch { setMsg("Could not copy. Select the code by hand."); } };

  return (
    <section className="px-4 pb-8">
      <header className="safe-t flex items-center justify-between pb-4 pt-3">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.02em]">Share</h1>
        <motion.button whileTap={press} transition={snappy} aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09]"><I n="close" className="h-[18px] w-[18px]" /></motion.button>
      </header>

      <div className="space-y-4">
        <Card title="Share a look" note="The other phone scans this. No internet needed.">
          {looks.length === 0 ? (
            <p className="text-[0.9375rem] leading-relaxed text-white/45">Save a look in Build first, then it will show up here to share.</p>
          ) : (
            <>
              <div className="relative">
                <select aria-label="Look to share" value={sel} onChange={(e) => setSel(e.target.value)}
                  className="w-full appearance-none rounded-xl bg-white/[0.07] px-3.5 py-3 pr-9 text-[0.9375rem] font-medium outline-none">
                  {looks.map((l) => <option key={l.id} value={l.id} className="bg-[#1c1c1f]">{l.name}</option>)}
                </select>
                <I n="chevR" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-white/40" />
              </div>
              <div className="flex justify-center py-1">
                {qr ? <motion.img key={qr} src={qr} alt="QR code for this look" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={snappy} className="w-56 rounded-2xl bg-white p-2.5" />
                  : note ? <p className="py-6 text-center text-[0.9375rem] text-[var(--accent)]">{note}</p>
                    : <div className="h-56 w-56 rounded-2xl bg-white/[0.05]" />}
              </div>
              <button onClick={copy} disabled={!code} className="w-full rounded-xl bg-white/[0.07] py-3 text-[0.9375rem] font-medium disabled:opacity-40">Copy code instead</button>
            </>
          )}
        </Card>

        <Card title="Receive a look" note="Scan someone's QR code, or paste the code they sent you.">
          {!camLive ? (
            <button onClick={startCamera} className="w-full rounded-xl bg-white py-3 text-[0.9375rem] font-semibold text-black">Start the camera to scan</button>
          ) : (
            <button onClick={() => { setMsg(""); setScanning(!scanning); }} className={`w-full rounded-xl py-3 text-[0.9375rem] font-semibold ${scanning ? "bg-white/[0.07] text-white" : "bg-white text-black"}`}>
              {scanning ? "Stop scanning" : "Scan a QR code"}
            </button>
          )}
          {scanning && <p className="text-center text-[0.8125rem] text-white/45">Point the camera at the code. Watch the preview on the Camera tab.</p>}
          <div className="flex gap-2">
            <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="A look or profile code"
              className="min-w-0 flex-1 rounded-xl bg-white/[0.07] px-3.5 py-3 text-[0.9375rem] outline-none placeholder:text-white/30 focus:ring-2 focus:ring-[var(--accent)]" />
            <button disabled={!paste.trim()} onClick={async () => { if (await importCode(paste)) setPaste(""); }}
              className="shrink-0 rounded-xl bg-white/[0.07] px-5 text-[0.9375rem] font-semibold disabled:opacity-40">Add</button>
          </div>
        </Card>

        <NearbyPanel shots={shots} camLive={camLive} startCamera={startCamera} getFrame={getFrame} onReceiveFile={onReceiveFile}
          onReceiveLook={async (c) => { const l = await decodeLook(c); if (!l) return false; onImport(l); return true; }} />
      </div>

      <AnimatePresence>
        {msg && <motion.p key={msg} role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={snappy} className="pt-4 text-center text-[0.8125rem] text-[var(--accent)]">{msg}</motion.p>}
      </AnimatePresence>
    </section>
  );
}
