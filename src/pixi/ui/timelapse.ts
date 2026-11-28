/** Encodes collected JPEG frames into a sped-up video by replaying them into a recorded canvas. */
export async function encodeTimelapse(frames: Blob[], w: number, h: number, fps = 24): Promise<{ blob: Blob; ext: string } | null> {
  if (frames.length < 2 || typeof MediaRecorder === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d")!;
  const types: [string, string][] = [["video/mp4;codecs=avc1", "mp4"], ["video/webm;codecs=vp9", "webm"], ["video/webm", "webm"]];
  const found = types.find(([m]) => MediaRecorder.isTypeSupported(m));
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, found ? { mimeType: found[0], videoBitsPerSecond: 6_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));
  rec.start(250);
  for (const f of frames) {
    const bmp = await createImageBitmap(f);
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
  rec.stop();
  await done;
  return { blob: new Blob(chunks, { type: rec.mimeType || "video/webm" }), ext: found?.[1] ?? "webm" };
}
