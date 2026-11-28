"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { Nearby, type NearbyState } from "./nearby";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "./Card";
import { press, snappy } from "./motion";

export interface NearbyShot { url: string; kind: "photo" | "video"; ext: string; blob: Blob }
interface Props {
  shots: NearbyShot[];
  camLive: boolean;
  startCamera: () => void;
  getFrame: () => ImageData | null;
  onReceiveFile: (blob: Blob, name: string) => void;
  onReceiveLook: (code: string) => Promise<boolean>;
}

type Role = "none" | "send" | "recv";
const shotName = (ext: string) => `pixi-${Date.now()}.${ext}`;
const ghost = "rounded-xl bg-white/[0.07] px-4 py-2.5 text-[0.8125rem] font-medium text-white/80 disabled:opacity-40";
const pri = "flex-1 rounded-xl bg-white py-3 text-[0.9375rem] font-semibold text-black disabled:opacity-40";

export function NearbyPanel({ shots, camLive, startCamera, getFrame, onReceiveFile, onReceiveLook }: Props) {
  const nb = useRef<Nearby | null>(null);
  const [role, setRole] = useState<Role>("none");
  const [state, setState] = useState<NearbyState>("idle");
  const [qr, setQr] = useState("");
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState("");
  const [prog, setProg] = useState<[number, number] | null>(null);
  const scanFor = useRef<"PIXIO" | "PIXIA" | null>(null);

  const reset = () => { nb.current?.close(); nb.current = null; setRole("none"); setState("idle"); setQr(""); setScanning(false); setMsg(""); setProg(null); };
  useEffect(() => () => { nb.current?.close(); }, []);

  const make = () => {
    const n = new Nearby();
    n.onState = setState;
    n.onProgress = (a, b) => setProg(a >= b ? null : [a, b]);
    n.onItem = async (i) => {
      if (i.kind === "file") { onReceiveFile(i.blob, i.name); setMsg(`Received ${i.name}.`); }
      else setMsg((await onReceiveLook(i.code)) ? "Received a look." : "Received an invalid look.");
    };
    nb.current = n; return n;
  };
  const show = async (code: string) => {
    try { setQr(await QRCode.toDataURL(code, { errorCorrectionLevel: "L", margin: 2, width: 420 })); }
    catch { setMsg("Connection code too large for a QR."); }
  };

  const startSend = async () => {
    setMsg(""); setRole("send"); setQr("");
    const code = await make().createOffer();
    await show(code); scanFor.current = "PIXIA";
  };
  const startRecv = () => { setMsg(""); setRole("recv"); setQr(""); make(); scanFor.current = "PIXIO"; setScanning(true); };

  useEffect(() => {
    if (!scanning) return;
    let done = false;
    const id = setInterval(async () => {
      if (done) return;
      const f = getFrame(); if (!f) return;
      const r = jsQR(f.data, f.width, f.height, { inversionAttempts: "dontInvert" });
      const want = scanFor.current;
      if (!r || !want || !r.data.startsWith(want)) return;
      done = true; setScanning(false);
      const n = nb.current; if (!n) return;
      try {
        if (want === "PIXIO") { const ans = await n.acceptOffer(r.data); if (ans) { setQr(""); await show(ans); setMsg("Now let the other phone scan this."); } else setMsg("That code didn't work."); }
        else if (!(await n.acceptAnswer(r.data))) setMsg("That code didn't work.");
      } catch { setMsg("Could not connect. Make sure both phones are on the same hotspot."); }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const sendShot = async (s: NearbyShot) => {
    try { await nb.current?.sendFile(s.blob, shotName(s.ext)); setMsg("Sent."); } catch { setMsg("Send failed."); }
  };
  const open = state === "open";

  return (
    <Card title="Send photos nearby" note="Both phones on one hotspot or Wi-Fi. Photos go straight across, nothing is uploaded.">
      {role === "none" && (
        <div className="flex gap-2.5">
          <motion.button whileTap={press} transition={snappy} className={pri} onClick={startSend}>Send</motion.button>
          <motion.button whileTap={press} transition={snappy} className={pri} onClick={() => (camLive ? startRecv() : (startCamera(), setMsg("Starting the camera. Tap Receive again.")))}>Receive</motion.button>
        </div>
      )}

      {role !== "none" && !open && (
        <>
          <AnimatePresence>
            {qr && <motion.img key={qr} src={qr} alt="Connection QR code" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={snappy} className="mx-auto w-52 rounded-2xl bg-white p-2.5" />}
          </AnimatePresence>
          {role === "send" && qr && (
            <>
              <ol className="space-y-1 text-[0.8125rem] leading-relaxed text-white/45">
                <li>1. On the other phone, tap Receive and scan this code.</li>
                <li>2. Then scan the code it shows back.</li>
              </ol>
              <motion.button whileTap={press} transition={snappy} className={pri} onClick={() => { if (!camLive) startCamera(); setScanning(!scanning); }}>{scanning ? "Stop scanning" : "Scan their code"}</motion.button>
            </>
          )}
          {role === "recv" && !qr && <p className="text-[0.8125rem] text-white/45">{scanning ? "Point the camera at the sender's code." : "Starting the scanner…"}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[0.8125rem] capitalize text-white/35">{state}</span>
            <button className={ghost} onClick={reset}>Cancel</button>
          </div>
        </>
      )}

      {open && (
        <>
          <p className="flex items-center gap-2 text-[0.9375rem] font-medium text-[#30d158]"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" />Connected</p>
          {role === "send" && (shots.length === 0 ? <p className="text-[0.8125rem] text-white/45">Take a photo first, then tap it here to send.</p> : (
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {shots.map((s) => (
                <motion.button key={s.url} whileTap={press} transition={snappy} onClick={() => sendShot(s)} aria-label="Send this shot" className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-white/[0.07]">
                  {s.kind === "photo" ? <img src={s.url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[0.6875rem] font-semibold">Video</span>}
                </motion.button>
              ))}
            </div>
          ))}
          {role === "recv" && <p className="text-[0.8125rem] text-white/45">Waiting for photos…</p>}
          {prog && <div className="h-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-[var(--accent)]" animate={{ width: `${(prog[0] / prog[1]) * 100}%` }} transition={{ duration: 0.2 }} /></div>}
          <button className={ghost} onClick={reset}>Disconnect</button>
        </>
      )}

      <AnimatePresence>
        {msg && <motion.p key={msg} role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={snappy} className="text-[0.8125rem] text-[var(--accent)]">{msg}</motion.p>}
      </AnimatePresence>
    </Card>
  );
}
