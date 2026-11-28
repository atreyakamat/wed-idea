import { packText, unpackText } from "./store";

export type NearbyState = "idle" | "waiting" | "connecting" | "open" | "closed" | "failed";
export interface Received { kind: "file"; name: string; blob: Blob }
export interface ReceivedLook { kind: "look"; code: string }

const CHUNK = 16 * 1024;

/**
 * Direct phone-to-phone link over the local network (hotspot or Wi-Fi). No server and no internet:
 * the two phones swap their connection details as QR codes (offer and answer).
 */
export class Nearby {
  private pc = new RTCPeerConnection({ iceServers: [] });
  private dc: RTCDataChannel | null = null;
  state: NearbyState = "idle";
  onState: (s: NearbyState) => void = () => {};
  onItem: (i: Received | ReceivedLook) => void = () => {};
  onProgress: (sent: number, total: number) => void = () => {};
  private incoming: { name: string; type: string; size: number; parts: BlobPart[]; got: number } | null = null;

  constructor() {
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === "failed") this.set("failed"); else if (s === "disconnected" || s === "closed") this.set("closed");
    };
  }
  private set(s: NearbyState) { this.state = s; this.onState(s); }

  private wire(dc: RTCDataChannel) {
    this.dc = dc; dc.binaryType = "arraybuffer"; dc.bufferedAmountLowThreshold = 256 * 1024;
    dc.onopen = () => this.set("open");
    dc.onclose = () => this.set("closed");
    dc.onmessage = (e) => this.receive(e.data);
  }

  private async gather(): Promise<void> {
    if (this.pc.iceGatheringState === "complete") return;
    await new Promise<void>((res) => {
      const t = setTimeout(res, 3000);
      this.pc.onicegatheringstatechange = () => { if (this.pc.iceGatheringState === "complete") { clearTimeout(t); res(); } };
    });
  }

  /** Sender: returns the offer code to show as a QR. */
  async createOffer(): Promise<string> {
    this.wire(this.pc.createDataChannel("pixi", { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.gather();
    this.set("waiting");
    return packText("PIXIO", JSON.stringify(this.pc.localDescription));
  }
  /** Receiver: consumes the offer, returns the answer code to show as a QR. */
  async acceptOffer(code: string): Promise<string | null> {
    const txt = await unpackText("PIXIO", code); if (!txt) return null;
    this.pc.ondatachannel = (e) => this.wire(e.channel);
    await this.pc.setRemoteDescription(JSON.parse(txt));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this.gather();
    this.set("connecting");
    return packText("PIXIA", JSON.stringify(this.pc.localDescription));
  }
  /** Sender: consumes the answer to finish the link. */
  async acceptAnswer(code: string): Promise<boolean> {
    const txt = await unpackText("PIXIA", code); if (!txt) return false;
    await this.pc.setRemoteDescription(JSON.parse(txt));
    this.set("connecting");
    return true;
  }

  private async drain() {
    const dc = this.dc!;
    while (dc.bufferedAmount > 1024 * 1024) await new Promise<void>((r) => { dc.onbufferedamountlow = () => r(); });
  }
  async sendFile(blob: Blob, name: string) {
    const dc = this.dc; if (!dc || dc.readyState !== "open") throw new Error("Not connected");
    dc.send(JSON.stringify({ t: "file", name, type: blob.type, size: blob.size }));
    const buf = await blob.arrayBuffer();
    for (let o = 0; o < buf.byteLength; o += CHUNK) {
      await this.drain();
      dc.send(buf.slice(o, o + CHUNK));
      this.onProgress(Math.min(o + CHUNK, buf.byteLength), buf.byteLength);
    }
    dc.send(JSON.stringify({ t: "end" }));
  }
  sendLook(code: string) { if (this.dc?.readyState === "open") this.dc.send(JSON.stringify({ t: "look", code })); }

  private receive(d: unknown) {
    if (typeof d === "string") {
      let m: { t?: string; name?: string; type?: string; size?: number; code?: string };
      try { m = JSON.parse(d); } catch { return; }
      if (m.t === "file" && typeof m.size === "number" && m.size <= 400 * 1024 * 1024) this.incoming = { name: String(m.name ?? "file").replace(/[^\w.\- ]/g, "_").slice(0, 80), type: String(m.type ?? ""), size: m.size, parts: [], got: 0 };
      else if (m.t === "end" && this.incoming) { const f = this.incoming; this.incoming = null; if (f.got === f.size) this.onItem({ kind: "file", name: f.name, blob: new Blob(f.parts, { type: f.type }) }); }
      else if (m.t === "look" && typeof m.code === "string" && m.code.length < 20000) this.onItem({ kind: "look", code: m.code });
    } else if (d instanceof ArrayBuffer && this.incoming) {
      this.incoming.parts.push(d); this.incoming.got += d.byteLength;
      this.onProgress(this.incoming.got, this.incoming.size);
      if (this.incoming.got > this.incoming.size) this.incoming = null;
    }
  }
  close() { try { this.dc?.close(); this.pc.close(); } catch { /* already closed */ } this.set("closed"); }
}
