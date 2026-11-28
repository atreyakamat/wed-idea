"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { I } from "./icons";
import { press, smooth, snappy, tap } from "./motion";
import { DEFAULTS, type Settings as S } from "./settings";
import { rollClear, rollSize } from "./roll";
import { backupRoll, keepStorage, restoreRoll, storageEstimate } from "./backup";
import { exportDocument } from "./native";
import { BUDGET, report } from "./perf";
import { isNative } from "./native";
import { SiteSendPanel } from "./SiteSendPanel";

// Wedding Pola's panel loads only in that build, so the public app never fetches its code.
import { canPickFolder, loadSaveTarget, pickFolder, saveSaveTarget } from "./saveTarget";
import { cameraState, locationState, micState, type PermState, requestLocation, requestMedia, settingsPath } from "./permissions";

const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="px-5 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white/35">{title}</h2>
      <div className="mx-4 divide-y divide-white/[0.06] overflow-hidden rounded-[18px] bg-white/[0.05]">{children}</div>
      {note && <p className="px-5 pt-2 text-[0.75rem] leading-relaxed text-white/35">{note}</p>}
    </section>
  );
}

function PerfRows() {
  const [r] = useState(report);
  if (!r.frames) return <Row label="No measurements yet" sub="Open the camera for a few seconds first" />;
  const mark = (v: number, max: number) => (v && v <= max ? " ✓" : "");
  return (
    <>
      <Row label="Viewfinder" sub={`${r.fps} fps · median ${r.medianMs} ms${mark(r.medianMs, BUDGET.frameMs + 0.5)} · 95th ${r.p95Ms} ms · ${r.jank} stutters in ${r.frames} frames`} />
      <Row label="Shutter" sub={r.feedbackMs ? `On screen in ${r.feedbackMs} ms${mark(r.feedbackMs, BUDGET.feedbackMs)} · in your roll in ${r.savedMs || "–"} ms${mark(r.savedMs, BUDGET.savedMs)}` : "Take a photo to measure"} />
    </>
  );
}

/** Where saved photos land, and a way to change it. Android only; elsewhere there is no choice. */
function WhereGroup({ say }: { say: (m: string) => void }) {
  const [target, setTarget] = useState<ReturnType<typeof loadSaveTarget>>(null);
  const [checking, setChecking] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is read after mount
  useEffect(() => { setTarget(loadSaveTarget()); }, []);
  if (!canPickFolder()) return null;

  const choose = async () => {
    setChecking(true);
    try {
      const t = await pickFolder();
      if (t) { setTarget(t); say(`Photos will be saved to ${t.label}`); }
    } catch { say("That folder couldn't be used. Pixi will keep saving to your gallery."); }
    setChecking(false);
  };
  const clear = () => { saveSaveTarget(null); setTarget(null); say("Photos will go to your gallery"); };

  return (
    <Group title="Where photos go" note={target
      ? "Pixi can write only to this one folder. Move or delete it and Pixi will ask you to pick again."
      : "Without a folder, photos go to a Pixi album in your gallery."}>
      <Row label={target ? target.label : "Your gallery"} sub={target ? "The folder you picked" : "A Pixi album"}>
        <button onClick={() => { tap(); void choose(); }} disabled={checking}
          className="shrink-0 rounded-full bg-white/[0.12] px-3.5 py-1.5 text-[0.8125rem] font-medium disabled:opacity-50">
          {target ? "Change" : "Choose"}
        </button>
      </Row>
      {target && (
        <Row label="Use my gallery instead">
          <button onClick={() => { tap(); clear(); }} className="shrink-0 rounded-full bg-white/[0.12] px-3.5 py-1.5 text-[0.8125rem] font-medium">Switch</button>
        </Row>
      )}
    </Group>
  );
}

/** Each permission, what it is for, and what to do when it has been refused. */
function PermissionsGroup() {
  const [cam, setCam] = useState<PermState>("unknown");
  const [mic, setMic] = useState<PermState>("unknown");
  const [loc, setLoc] = useState<PermState>("unknown");
  const refresh = () => { void cameraState().then(setCam); void micState().then(setMic); void locationState().then(setLoc); };
  // The states come from the platform asynchronously, so they land after mount by nature.
  useEffect(refresh, []);

  const word = (s: PermState) => (s === "granted" ? "Allowed" : s === "denied" ? "Blocked" : s === "prompt" ? "Not asked yet" : "Not checked");
  const ask = async (kind: "camera" | "microphone") => {
    tap();
    await requestMedia(kind);
    refresh();
  };
  const askLocation = async () => {
    tap();
    await requestLocation();
    refresh();
  };

  return (
    <Group title="Permissions" note={cam === "denied" || mic === "denied" || loc === "denied"
      ? `A blocked permission can only be changed by your phone: ${settingsPath}.`
      : "Pixi asks for these only when a feature needs them, and works without them."}>
      <Row label="Camera" sub={`${word(cam)} · the viewfinder`}>
        {cam !== "granted" && (
          <button onClick={() => void ask("camera")} className="shrink-0 rounded-full bg-white/[0.12] px-3.5 py-1.5 text-[0.8125rem] font-medium">
            {cam === "denied" ? "How to fix" : "Allow"}
          </button>
        )}
      </Row>
      <Row label="Microphone" sub={`${word(mic)} · sound in videos`}>
        {mic !== "granted" && (
          <button onClick={() => void ask("microphone")} className="shrink-0 rounded-full bg-white/[0.12] px-3.5 py-1.5 text-[0.8125rem] font-medium">
            {mic === "denied" ? "How to fix" : "Allow"}
          </button>
        )}
      </Row>
      <Row label="Location" sub={`${word(loc)} · roughly where a shot was taken`}>
        {loc !== "granted" && (
          <button onClick={() => void askLocation()} className="shrink-0 rounded-full bg-white/[0.12] px-3.5 py-1.5 text-[0.8125rem] font-medium">
            {loc === "denied" ? "How to fix" : "Allow"}
          </button>
        )}
      </Row>
    </Group>
  );
}

export function Row({ label, sub, children }: { label: string; sub?: string; children?: React.ReactNode }) {
  return (
    // Wraps at large text sizes: the control drops under its label instead of squeezing it.
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-[9.5rem] flex-1">
        <div className="text-[0.9375rem]">{label}</div>
        {sub && <div className="mt-0.5 text-[0.75rem] leading-snug text-white/40">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => { tap(); onChange(!on); }}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-[var(--accent)]" : "bg-white/15"}`}>
      <motion.span layout transition={snappy} className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow" style={{ left: on ? 22 : 2 }} />
    </button>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 rounded-lg bg-white/[0.08] p-[3px]">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => { tap(); onChange(v); }} className="relative whitespace-nowrap rounded-[7px] px-3 py-1 text-[0.8125rem] font-medium">
          {value === v && <motion.span layoutId={`seg-${options.map((o) => o[0]).join()}`} className="absolute inset-0 rounded-[7px] bg-white/[0.16]" transition={smooth} />}
          <span className={`relative ${value === v ? "text-white" : "text-white/55"}`}>{l}</span>
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen({ settings, setSettings, onClose, onCleared, onRestored, say }: { settings: S; setSettings: (s: S) => void; onClose: () => void; onCleared: () => void; onRestored: () => void; say: (m: string) => void }) {
  const [use, setUse] = useState<{ count: number; bytes: number } | null>(null);
  const [kept, setKept] = useState<boolean | null>(null);
  const [quota, setQuota] = useState<{ used: number; quota: number } | null>(null);
  const [busy, setBusy] = useState("");
  const restoreRef = useRef<HTMLInputElement>(null);
  // These helpers never reject: each reports a failure as "not granted" or "unknown".
  useEffect(() => { void keepStorage().then(setKept); void storageEstimate().then(setQuota); }, []);

  const backup = async () => {
    if (busy) return;
    tap(); setBusy("Packing…");
    try {
      const zip = await backupRoll((d, t) => setBusy(`Packing ${d}/${t}…`));
      const r = await exportDocument(zip, `pixi-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      say(r.ok ? (r.where === "files" ? "Backup saved to Documents/Pixi" : "Backup downloaded") : r.reason);
    } catch { say("The backup didn't finish. Free some space and try again."); }
    setBusy("");
  };
  const restore = async (f: File | undefined) => {
    if (!f || busy) return;
    setBusy("Restoring…");
    try {
      const r = await restoreRoll(f, (d, t) => setBusy(`Restoring ${d}/${t}…`));
      say(r.reason ?? `Restored ${r.added} ${r.added === 1 ? "shot" : "shots"}${r.skipped ? `, skipped ${r.skipped}` : ""}`);
      if (r.added) { onRestored(); void rollSize().then(setUse); }
    } catch { say("Pixi couldn't read that backup. Pick the .zip Pixi made."); }
    setBusy("");
  };
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof S>(k: K, v: S[K]) => setSettings({ ...settings, [k]: v });
  useEffect(() => { void rollSize().then(setUse); }, []);

  return (
    <section className="pb-10">
      <header className="safe-t flex items-center justify-between px-4 pb-4 pt-3">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.02em]">Settings</h1>
        <motion.button whileTap={press} transition={snappy} aria-label="Close settings" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09]"><I n="close" className="h-[18px] w-[18px]" /></motion.button>
      </header>

      <div className="space-y-6">
        <SiteSendPanel say={say} />
        <Group title="Saving" note={settings.saveMode === "auto"
          ? "Every shot is kept in Pixi and copied to your phone's gallery straight away."
          : "Shots are kept in Pixi only. Open one from the Roll and tap Save when you want it on your phone."}>
          <Row label="When you take a photo">
            <Seg value={settings.saveMode} onChange={(v) => set("saveMode", v)} options={[["auto", "Save to phone"], ["manual", "Keep in Pixi"]]} />
          </Row>
          <Row label="File type" sub={settings.format === "png" ? "Larger files, no compression marks" : "Smaller files, works everywhere"}>
            <Seg value={settings.format} onChange={(v) => set("format", v)} options={[["jpeg", "JPEG"], ["png", "PNG"]]} />
          </Row>
          {settings.format === "jpeg" && (
            <div className="px-4 py-3">
              <div className="flex items-baseline justify-between pb-1.5">
                <span className="text-[0.9375rem]">Quality</span>
                <span className="text-[0.8125rem] tabular-nums text-white/45">{Math.round(settings.quality * 100)}%</span>
              </div>
              <input aria-label="JPEG quality" type="range" min={0.6} max={1} step={0.02} value={settings.quality} onChange={(e) => set("quality", +e.target.value)} className="w-full accent-[var(--accent)]" />
            </div>
          )}
        </Group>

        <WhereGroup say={say} />

        <PermissionsGroup />

        <Group title="Photobooth strips" note="A real booth prints two identical strips so you can keep one and give one away.">
          <Row label="Print a pair" sub="Export two copies side by side">
            <Toggle on={settings.stripPair} onChange={(v) => set("stripPair", v)} label="Print a pair" />
          </Row>
        </Group>

        <Group title="Feel">
          <Row label="Develop each shot" sub="The photo comes up slowly, the way an instant print does">
            <Toggle on={settings.develop} onChange={(v) => set("develop", v)} label="Develop each shot" />
          </Row>
          <Row label="Haptics" sub="A light touch when you press a control, a firmer one for the shutter">
            <Toggle on={settings.haptics} onChange={(v) => set("haptics", v)} label="Haptics" />
          </Row>
          <Row label="Shutter sound" sub="A quiet click. Follows your phone's media volume">
            <Toggle on={settings.sound} onChange={(v) => set("sound", v)} label="Shutter sound" />
          </Row>
        </Group>

        <Group title="Advanced" note="The look builder lets you stack film, grain, light leaks and colour layer by layer, and save the result as your own look.">
          <Row label="Look builder" sub="Adds Edit and New to Looks">
            <Toggle on={settings.advanced} onChange={(v) => set("advanced", v)} label="Look builder" />
          </Row>
        </Group>

        <Group title="Performance" note={`Measured on this phone. Targets: ${BUDGET.frameMs} ms a frame (60 fps), under ${BUDGET.feedbackMs} ms from the shutter to the photo on screen, under ${BUDGET.savedMs} ms to the full shot in your roll. Use the camera for a few seconds, then come back.`}>
          <Row label="Frame meter" sub="Shows frame rate and shutter time over the viewfinder">
            <Toggle on={settings.meter} onChange={(v) => set("meter", v)} label="Frame meter" />
          </Row>
          <PerfRows />
        </Group>

        <Group title="Storage" note={`Pixi keeps your most recent ${settings.rollLimit} shots on this phone. Older ones drop off on their own.`}>
          <Row label="Your roll" sub={use ? `${use.count} ${use.count === 1 ? "shot" : "shots"} · ${mb(use.bytes)}` : "Measuring…"} />
          <Row label="How many to keep">
            <Seg value={String(settings.rollLimit)} onChange={(v) => set("rollLimit", +v)} options={[["200", "200"], ["500", "500"], ["2000", "2000"]]} />
          </Row>
          <button onClick={() => { tap(); setConfirm(true); }} className="w-full px-4 py-3 text-left text-[0.9375rem] text-[#ff453a]">Empty the roll…</button>
        </Group>

        <Group title="Keep it safe" note={kept === false ? "This browser may clear Pixi's storage when space runs low. A backup is the only copy you control." : "Your roll is marked as persistent, so the system should not clear it. A backup is still the only copy you control."}>
          <Row label="Protected storage" sub={kept === null ? "Checking…" : kept ? "On" : "Not granted by this browser"} />
          {quota && quota.quota > 0 && <Row label="Space" sub={`${mb(quota.used)} used of ${mb(quota.quota)} available to Pixi`} />}
          <button onClick={backup} disabled={!!busy} className="w-full px-4 py-3 text-left text-[0.9375rem] text-[var(--accent)] disabled:opacity-50">{busy || "Back up the roll (zip)…"}</button>
          <button onClick={() => { tap(); restoreRef.current?.click(); }} disabled={!!busy} className="w-full px-4 py-3 text-left text-[0.9375rem] text-[var(--accent)] disabled:opacity-50">Restore from a backup…</button>
          <input ref={restoreRef} type="file" accept=".zip,application/zip" className="hidden" aria-label="Choose a Pixi backup" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ""; }} />
        </Group>

        <Group title="About">
          <Row label="Pixi" sub={isNative() ? "Android app" : "Web app"} />
          <Row label="Free. On-device. No account." sub="Every look is rendered on this phone. Pixi has no server, no sign-in and no analytics, so your photos never leave the phone unless you share them." />
          <a href="/privacy/" className="block px-4 py-3 text-[0.9375rem] text-[var(--accent)]">Privacy policy</a>
        </Group>
      </div>

      {confirm && (
        <div role="dialog" aria-modal="true" aria-label="Empty the roll" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => setConfirm(false)}>
          <div className="w-full max-w-[300px] rounded-[22px] bg-[#1c1c1f] p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[1.0625rem] font-semibold">Empty the roll?</h3>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-white/50">This removes every shot Pixi is holding on this phone. Anything already saved to your gallery stays there.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirm(false)} className="flex-1 rounded-xl bg-white/[0.08] py-2.5 text-[0.9375rem] font-medium">Keep them</button>
              <button onClick={async () => { await rollClear(); setConfirm(false); setUse({ count: 0, bytes: 0 }); onCleared(); }} className="flex-1 rounded-xl bg-[#ff453a] py-2.5 text-[0.9375rem] font-semibold">Empty</button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pt-6">
        <button onClick={() => setSettings({ ...DEFAULTS })} className="w-full rounded-xl bg-white/[0.06] py-3 text-[0.9375rem] font-medium text-white/70">Reset all settings</button>
      </div>
    </section>
  );
}
