"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PixiMark } from "./Logo";
import { I } from "./icons";
import { press, reveal, snappy, tap } from "./motion";
import { canPickFolder, pickFolder } from "./saveTarget";
import { isNative } from "./native";
import { requestLocation } from "./permissions";

type Ask = "idle" | "asking" | "denied" | "done";

/**
 * Five screens: the promise, then one ask each for camera, microphone, location and where files go.
 * Every ask says what it is for before the system prompt appears, and every one can be skipped — a
 * refused permission costs one feature, never the app.
 */
export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [i, setI] = useState(0);
  const [cam, setCam] = useState<Ask>("idle");
  const [mic, setMic] = useState<Ask>("idle");
  const [loc, setLoc] = useState<Ask>("idle");
  const [folder, setFolder] = useState<Ask>("idle");
  const [folderName, setFolderName] = useState("");

  const next = () => { tap(); setI((n) => n + 1); };

  const allowCamera = async () => {
    tap(); setCam("asking");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      setCam("done");
      setI(2);
    } catch { setCam("denied"); }
  };

  const allowMic = async () => {
    tap(); setMic("asking");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setMic("done");
    } catch { setMic("denied"); }
    setI(3);
  };

  const allowLocation = async () => {
    tap(); setLoc("asking");
    setLoc((await requestLocation()) ? "done" : "denied");
    setI(4);
  };

  const choose = async () => {
    tap(); setFolder("asking");
    try {
      const t = await pickFolder();
      if (t) { setFolderName(t.label); setFolder("done"); }
      else setFolder("idle");
    } catch { setFolder("denied"); }
  };

  // The folder step is Android-only; elsewhere the gallery is the only destination there is.
  const steps = canPickFolder() ? 5 : 4;
  const done = () => { tap(); onFinish(); };

  return (
    <motion.div className="fixed inset-0 z-[90] flex flex-col bg-black safe-t safe-b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex justify-center gap-1.5 pt-4" aria-hidden>
        {Array.from({ length: steps }, (_, n) => (
          <span key={n} className={`h-1 w-7 rounded-full transition-colors ${n <= i ? "bg-white/70" : "bg-white/15"}`} />
        ))}
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-8">
        <AnimatePresence mode="wait" initial={false}>
          {i === 0 && (
            <Screen key="promise">
              <PixiMark size={88} />
              <h1 className="t-large mt-10">Free. On-device.<br />No account.</h1>
              <p className="t-body mt-4 max-w-[18rem] text-white/50">A retro camera that develops every shot like an instant print. Your photos never leave the phone.</p>
            </Screen>
          )}

          {i === 1 && (
            <Screen key="camera" icon="camera">
              <h1 className="t-title1 mt-10">The camera</h1>
              <p className="t-body mt-4 max-w-[18rem] text-white/50">
                {cam === "denied"
                  ? "The camera is blocked. Open your phone's Settings, then Apps, Pixi, Permissions, and allow Camera. Then tap Try again."
                  : "For the viewfinder. Nothing it sees is uploaded, and Pixi has no way to send it anywhere."}
              </p>
            </Screen>
          )}

          {i === 2 && (
            <Screen key="mic" icon="mic">
              <h1 className="t-title1 mt-10">Sound in videos</h1>
              <p className="t-body mt-4 max-w-[18rem] text-white/50">
                {mic === "denied"
                  ? "No microphone, so videos will record silent. You can allow it later in Settings."
                  : "Only used while you hold the shutter to record. Skip it and videos record silent."}
              </p>
            </Screen>
          )}

          {i === 3 && (
            <Screen key="loc" icon="pin">
              <h1 className="t-title1 mt-10">Where it was taken</h1>
              <p className="t-body mt-4 max-w-[18rem] text-white/50">
                {loc === "denied"
                  ? "No location, so shots won't carry where they were taken. You can allow it later in Settings."
                  : "Tags each shot with roughly where it was taken, for your own Roll. Never a map, never sent anywhere."}
              </p>
            </Screen>
          )}

          {i === 4 && (
            <Screen key="save" icon="save">
              <h1 className="t-title1 mt-10">Where photos go</h1>
              <p className="t-body mt-4 max-w-[18rem] text-white/50">
                {folder === "done"
                  ? `Saved to ${folderName}. You can change this any time in Settings.`
                  : folder === "denied"
                    ? "That folder couldn't be used. Pixi will save to your gallery instead."
                    : "Pick a folder and Pixi saves there. Otherwise photos go to a Pixi album in your gallery."}
              </p>
            </Screen>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col items-center gap-3 px-6 pb-8">
        {i === 0 && <Primary onClick={next}>Continue</Primary>}

        {i === 1 && (
          <>
            <Primary onClick={allowCamera} disabled={cam === "asking"}>{cam === "denied" ? "Try again" : "Allow camera"}</Primary>
            <Skip onClick={() => setI(2)}>Not now</Skip>
          </>
        )}

        {i === 2 && (
          <>
            <Primary onClick={allowMic} disabled={mic === "asking"}>Allow microphone</Primary>
            <Skip onClick={() => setI(3)}>Skip, silent videos</Skip>
          </>
        )}

        {i === 3 && (
          <>
            <Primary onClick={allowLocation} disabled={loc === "asking"}>Allow location</Primary>
            <Skip onClick={() => setI(4)}>Skip, no location tag</Skip>
          </>
        )}

        {i === 4 && (
          <>
            {folder === "done"
              ? <Primary onClick={done}>Start shooting</Primary>
              : <Primary onClick={choose} disabled={folder === "asking"}>Choose a folder</Primary>}
            {folder !== "done" && <Skip onClick={done}>Use my gallery</Skip>}
          </>
        )}
      </div>
    </motion.div>
  );
}

function Screen({ children, icon }: { children: React.ReactNode; icon?: "camera" | "mic" | "save" | "pin" }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={reveal} className="flex flex-col items-center text-center">
      {icon && (
        <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[26px] bg-white/[0.07]">
          <I n={icon} className="h-11 w-11" w={1.5} />
        </div>
      )}
      {children}
    </motion.div>
  );
}

function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <motion.button whileTap={press} transition={snappy} disabled={disabled} onClick={onClick}
      className="t-headline w-full max-w-xs rounded-2xl bg-white py-4 text-black disabled:opacity-60">
      {children}
    </motion.button>
  );
}

function Skip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={() => { tap(); onClick(); }} className="t-subhead py-2 text-white/45">{children}</button>;
}

/** Kept so the app does not have to know which platform offers a folder. */
export const onboardingHasFolderStep = () => canPickFolder() && isNative();
