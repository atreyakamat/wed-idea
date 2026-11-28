"use client";
import { useCallback, useEffect, useState } from "react";
import { CAMERA_LOGIN_HREF, dayProjectName, type CameraState } from "@/lib/camera/rules";
import { Group, Row } from "./Settings";
import { fetchCameraState, sendRollToStudio, type SendTarget } from "./siteSend";

const NEW = "new";

/**
 * The Studio section of Settings on the website. Signed out, it asks people to sign in to
 * send. Signed in, it lists the studio's projects and sends the Roll to one of them, or to
 * a project named for today.
 */
export function SiteSendPanel({ say }: { say: (m: string) => void }) {
  const [state, setState] = useState<CameraState | null>(null);
  const [failed, setFailed] = useState(false);
  const [choice, setChoice] = useState(NEW);
  const [busy, setBusy] = useState("");

  const refresh = useCallback(() => {
    fetchCameraState().then(setState).catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (failed) {
    return <Group title="Studio" note="Sending to a studio isn't available right now."><Row label="Try again later" /></Group>;
  }
  if (!state) {
    return <Group title="Studio"><div className="px-4 py-3 text-sm text-white/60">Checking your studio…</div></Group>;
  }
  if (!state.signedIn) {
    return (
      <Group title="Studio" note="Your photos stay on this phone until you send them.">
        <Row label="Sign in to send to your studio" sub="Use the account your studio gave you.">
          <a href={CAMERA_LOGIN_HREF} className="flex min-h-11 items-center rounded-full bg-white/[0.16] px-5 text-sm font-semibold">Sign in</a>
        </Row>
      </Group>
    );
  }
  if (!state.studio) {
    return (
      <Group title="Studio" note="Your photos stay on this phone until you send them.">
        <Row label="No studio yet" sub="Ask your studio owner to add this account." />
      </Group>
    );
  }

  const { studio, projects, blocked } = state;
  const today = dayProjectName(new Date());

  const send = async () => {
    if (busy || blocked) return;
    const picked = projects.find((p) => p.id === choice);
    const target: SendTarget = picked
      ? { kind: "existing", projectId: picked.id, projectName: picked.name }
      : { kind: "new", name: today };
    setBusy("Sending…");
    const r = await sendRollToStudio(target, (d, t) => setBusy(`Sending ${d}/${t}…`));
    setBusy("");
    say(r.ok ? `Sent ${r.sent} ${r.sent === 1 ? "photo" : "photos"} to ${r.project}${r.skipped ? `, skipped ${r.skipped}` : ""}.` : r.reason);
    if (r.ok) refresh();
  };

  return (
    <Group title="Studio" note={`Send your Roll to ${studio.name}. Only when you press Send; nothing is sent in the background.`}>
      {blocked && <Row label="Sending is paused" sub={blocked} />}
      <div className="px-4 py-3">
        <label htmlFor="studio-project" className="block pb-2 text-[0.9375rem]">Send the Roll to</label>
        <select
          id="studio-project"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={!!busy}
          className="min-h-11 w-full min-w-0 rounded-xl bg-white/[0.08] px-3 text-[1rem] text-white disabled:opacity-50"
        >
          <option value={NEW}>A project for {today}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <Row label="Send the Roll">
        <button type="button" onClick={() => void send()} disabled={!!busy || !!blocked} className="min-h-11 rounded-full bg-white/[0.16] px-5 text-sm font-semibold disabled:opacity-50">
          {busy || "Send"}
        </button>
      </Row>
    </Group>
  );
}
