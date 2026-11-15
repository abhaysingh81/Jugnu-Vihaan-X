import { readFile } from "node:fs/promises";
import { join } from "node:path";

const assets = new Set(["audio_bundle.mjs", "audio_wasm_internal.js", "audio_wasm_internal.wasm", "audio_wasm_module_internal.js", "audio_wasm_module_internal.wasm"]);

export async function GET(_: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  if (!assets.has(asset)) return new Response(null, { status: 404 });
  const root = join(process.cwd(), "node_modules", "@mediapipe", "tasks-audio");
  const file = await readFile(asset === "audio_bundle.mjs" ? join(root, asset) : join(root, "wasm", asset));
  return new Response(new Uint8Array(file), { headers: {
    "Content-Type": asset.endsWith(".wasm") ? "application/wasm" : "application/javascript",
    "Cache-Control": "public, max-age=86400",
  } });
}
