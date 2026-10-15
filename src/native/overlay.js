import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IDLE_HIDE_MS = 15000;

/**
 * Safety overlay: topmost click-through banner + cursor ring (WPF via PowerShell).
 * Mirrors the Codex helper's "AI is using your computer" UX:
 * visible during automation, Esc aborts (reported via stdout "STOP").
 */
export class SafetyOverlay {
  #proc = null;
  #idleTimer = null;
  #ready = null;
  onStop = null;

  get visible() {
    return this.#proc != null;
  }

  poke() {
    if (this.#proc == null) this.#show();
    clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => this.hide(), IDLE_HIDE_MS);
    return this.#ready ?? Promise.resolve();
  }

  #show() {
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "overlay.ps1");
    const proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#proc = proc;
    let buf = "";
    this.#ready = new Promise((resolve) => {
      const to = setTimeout(() => resolve(), 5000);
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line === "READY") {
            clearTimeout(to);
            resolve();
          } else if (line === "STOP") {
            this.hide();
            this.onStop?.();
          }
        }
      });
    });
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (d) => process.stderr.write(`[sky-overlay] ${d}`));
    proc.on("exit", () => {
      if (this.#proc === proc) this.#proc = null;
    });
  }

  hide() {
    clearTimeout(this.#idleTimer);
    const proc = this.#proc;
    this.#proc = null;
    if (proc && proc.exitCode == null) {
      try {
        proc.kill();
      } catch {}
    }
  }
}
