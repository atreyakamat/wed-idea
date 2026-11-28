/** Procedural test scene: sky, sun, buildings, trees, a skin-tone portrait, a lamp and deep shadows. */
export function sampleScene(w = 1200, h = 1600): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, "#3d6aa8"); sky.addColorStop(0.55, "#9cc4e8"); sky.addColorStop(1, "#ffd9a8");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff6d6"; g.beginPath(); g.arc(w * 0.78, h * 0.5, 90, 0, 7); g.fill();
  // buildings with windows
  for (let i = 0; i < 8; i++) {
    const bx = i * (w / 8), bh = 260 + ((i * 97) % 220), bw = w / 8 - 6;
    g.fillStyle = ["#7b6f6a", "#a8957f", "#5d6672", "#8c7a6a"][i % 4]; g.fillRect(bx, h * 0.62 - bh, bw, bh);
    g.fillStyle = "#ffd98a"; for (let y = 0; y < bh - 30; y += 46) for (let x = 12; x < bw - 20; x += 34) if ((x + y + i) % 3) g.fillRect(bx + x, h * 0.62 - bh + 14 + y, 16, 24);
  }
  g.fillStyle = "#2f7a3f"; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(80 + i * 210, h * 0.62, 110 + (i % 2) * 30, 0, 7); g.fill(); }
  g.fillStyle = "#3a3733"; g.fillRect(0, h * 0.62, w, h * 0.38);
  // portrait
  g.fillStyle = "#c0392b"; g.beginPath(); g.ellipse(w * 0.34, h * 0.9, 220, 190, 0, 0, 7); g.fill();
  g.fillStyle = "#e0ac8c"; g.beginPath(); g.ellipse(w * 0.34, h * 0.72, 115, 140, 0, 0, 7); g.fill();
  g.fillStyle = "#2b1d16"; g.beginPath(); g.ellipse(w * 0.34, h * 0.655, 120, 80, 0, Math.PI, 0); g.fill();
  g.fillStyle = "#222"; g.beginPath(); g.arc(w * 0.34 - 42, h * 0.72, 9, 0, 7); g.arc(w * 0.34 + 42, h * 0.72, 9, 0, 7); g.fill();
  g.strokeStyle = "#8a3d33"; g.lineWidth = 7; g.beginPath(); g.arc(w * 0.34, h * 0.755, 36, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  // lamp (bright source) and neon sign
  const lamp = g.createRadialGradient(w * 0.82, h * 0.78, 5, w * 0.82, h * 0.78, 160);
  lamp.addColorStop(0, "#ffffff"); lamp.addColorStop(0.2, "#ffe9a6"); lamp.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = lamp; g.beginPath(); g.arc(w * 0.82, h * 0.78, 160, 0, 7); g.fill();
  g.fillStyle = "#ff3d8b"; g.fillRect(w * 0.62, h * 0.9, 300, 26);
  g.fillStyle = "#33d6ff"; g.fillRect(w * 0.62, h * 0.94, 220, 22);
  return c;
}
