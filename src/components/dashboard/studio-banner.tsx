import type { StudioNotice } from "@/lib/studio/status";

const TONES: Record<StudioNotice["tone"], string> = {
  info: "border-accent/30 bg-accent/10",
  warning: "border-[#c98a1b]/40 bg-[#c98a1b]/10",
  danger: "border-danger/40 bg-danger/10",
};

export function StudioBanner({ notice }: Readonly<{ notice: StudioNotice }>) {
  return (
    <div role={notice.tone === "danger" ? "alert" : "status"} className={`mb-8 rounded-2xl border px-5 py-4 text-sm ${TONES[notice.tone]}`}>
      <p className="font-semibold">{notice.title}</p>
      <p className="mt-0.5 text-muted">{notice.body}</p>
    </div>
  );
}
