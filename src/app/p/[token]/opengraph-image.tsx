import { ImageResponse } from "next/og";
import { galleryCoverThumbnail, getProjectGallery } from "@/lib/projects/gallery";

export const alt = "Your photos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The preview WhatsApp shows when a gallery link is shared: the cover photo,
 * the shoot's name and the studio. Only someone with the link can request it.
 */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gallery = await getProjectGallery(token).catch(() => null);
  const open = gallery?.state === "open" ? gallery : null;
  const title = open?.projectName ?? "Photos";
  const studio = open?.studioName ?? "";
  const bytes = open?.cover ? await galleryCoverThumbnail(token, open.cover.id).catch(() => null) : null;
  const cover = bytes ? `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}` : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: open?.cover?.tone ?? "#2a2420" }}>
        {cover ? (
          <img src={cover} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 330, display: "flex", background: "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))" }} />
        <div style={{ position: "absolute", left: 64, bottom: 56, display: "flex", flexDirection: "column", color: "#fff" }}>
          <div style={{ fontSize: 72, fontStyle: "italic", fontFamily: "serif" }}>{title}</div>
          <div style={{ fontSize: 30, opacity: 0.9, marginTop: 8 }}>{open ? `${open.photoCount} photos${studio ? ` · ${studio}` : ""}` : "This gallery has closed"}</div>
        </div>
      </div>
    ),
    size,
  );
}
