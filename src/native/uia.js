import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const DIR = path.dirname(fileURLToPath(import.meta.url));

function runPowershell(args, timeout = 30000) {
  return execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ...args], {
    timeout,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
}

export async function dumpTree(hwnd) {
  const { stdout } = await runPowershell([path.join(DIR, "uia-dump.ps1"), "-Hwnd", String(hwnd)]);
  return JSON.parse(stdout.trim());
}

export function formatTree(elements) {
  return elements.map((e) => {
    const indent = "  ".repeat(Math.min(8, e.depth));
    const type = String(e.type || "").split(".").pop();
    const name = (e.name || "").replace(/\s+/g, " ").slice(0, 80);
    const pats = (e.patterns || []).join(",");
    const geo = `[${e.x},${e.y} ${e.w}x${e.h}]`;
    const settable = (e.patterns || []).includes("Value") ? " settable" : "";
    return `${indent}[${e.index}] ${type} "${name}"${pats ? ` (${pats})` : ""} ${geo}${settable}`;
  }).join("\n");
}

export async function actOnElement(hwnd, runtimeId, mode, { value = "", action = "" } = {}) {
  const args = [path.join(DIR, "uia-act.ps1"), "-Hwnd", String(hwnd), "-Mode", mode, "-RuntimeId", JSON.stringify(runtimeId)];
  if (mode === "setvalue") args.push("-Value", value);
  if (mode === "secondary") args.push("-Action", action);
  await runPowershell(args, 20000);
}
