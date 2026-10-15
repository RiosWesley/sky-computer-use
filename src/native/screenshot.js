import screenshot from "screenshot-desktop";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { windowRect } from "./win32.js";

const execFileAsync = promisify(execFile);
const PW_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "printwindow.ps1");

/** PrintWindow render (works even when occluded). Returns null on failure. */
async function printWindowCapture(id, width, height) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sky-pw-"));
  const out = path.join(dir, "shot.png");
  try {
    await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PW_SCRIPT, "-Hwnd", String(id), "-Out", out], { timeout: 20000, windowsHide: true });
    const data = readFileSync(out);
    const meta = await sharp(data).metadata();
    return { data, pixelWidth: meta.width, pixelHeight: meta.height };
  } catch {
    return null;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

export async function captureWindowPng(window) {
  const rect = await windowRect(window.id);
  const left = rect.left;
  const top = rect.top;
  const width = Math.max(1, rect.right - rect.left);
  const height = Math.max(1, rect.bottom - rect.top);

  // 1) PrintWindow first: renders the window itself, even when covered.
  const pw = await printWindowCapture(window.id, width, height);
  if (pw && pw.pixelWidth > 0 && pw.pixelHeight > 0) {
    return {
      data: pw.data,
      mimeType: "image/png",
      pixelWidth: pw.pixelWidth,
      pixelHeight: pw.pixelHeight,
      logicalWidth: width,
      logicalHeight: height,
      origin: { x: left, y: top },
      fullWidth: width,
      fullHeight: height,
      occluded: true,
    };
  }

  // 2) Fallback: visible-desktop crop (fails when occluded).
  const displays = await screenshot.listDisplays();
  let best = null;
  let bestArea = 0;
  const candidates = [];
  for (const d of displays) {
    const ix0 = Math.max(d.left, left);
    const iy0 = Math.max(d.top, top);
    const ix1 = Math.min(d.right, left + width);
    const iy1 = Math.min(d.bottom, top + height);
    const area = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
    if (area > 0) candidates.push({ d, ix0, iy0, ix1, iy1, area });
    if (area > bestArea) {
      bestArea = area;
      best = { d, ix0, iy0, ix1, iy1 };
    }
  }
  if (!best) throw new Error("could not capture window: it may be minimized or off-screen. Activate it and retry.");
  // Capture from the display with the largest overlap.
  let full = null;
  let origin = { x: 0, y: 0 };
  const tried = [best, ...candidates.filter((c) => c.d.id !== best.d.id)];
  for (const { d, ix0, iy0, ix1, iy1 } of tried) {
    try {
      const buf = await screenshot({ screen: d.id });
      const meta = await sharp(buf).metadata();
      const dw = d.right - d.left;
      const dh = d.bottom - d.top;
      const sx = meta.width / dw;
      const sy = meta.height / dh;
      const crop = {
        left: Math.round((ix0 - d.left) * sx),
        top: Math.round((iy0 - d.top) * sy),
        width: Math.max(1, Math.round((ix1 - ix0) * sx)),
        height: Math.max(1, Math.round((iy1 - iy0) * sy)),
      };
      full = await sharp(buf).extract(crop).png().toBuffer();
      origin = { x: ix0, y: iy0 };
      break;
    } catch {
      continue;
    }
  }
  if (!full) throw new Error("could not capture window: it may be minimized or off-screen. Activate it and retry.");

  const meta = await sharp(full).metadata();
  // Captured portion may be smaller than the full window when it spans monitors.
  // Report the captured logical size so coordinate mapping stays exact.
  const capturedW = best.ix1 - best.ix0;
  const capturedH = best.iy1 - best.iy0;
  return {
    data: full,
    mimeType: "image/png",
    pixelWidth: meta.width,
    pixelHeight: meta.height,
    logicalWidth: capturedW,
    logicalHeight: capturedH,
    origin,
    fullWidth: width,
    fullHeight: height,
  };
}

export function toDataUrl(mimeType, buffer) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
