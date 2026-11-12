// Copies MediaPipe's face-landmark WebAssembly into public/ so the browser
// loads it from this site (no third-party script runs in our pages).
// Runs before `next build` and `next dev`; the copies are not committed.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const from = join("node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join("public", "vendor", "mediapipe");
const files = ["vision_wasm_module_internal.js", "vision_wasm_module_internal.wasm"];

if (!existsSync(from)) {
  console.warn("copy-mediapipe: @mediapipe/tasks-vision isn't installed; skipping.");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`copy-mediapipe: ${files.length} files -> ${to}`);
