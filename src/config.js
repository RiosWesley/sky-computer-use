import os from "node:os";
import path from "node:path";

/**
 * Native backend config. No Codex, no helper exe.
 * Everything is npm-installable (nut-js + screenshot-desktop + sharp).
 */
export function loadConfig(env = process.env) {
  return {
    approvalsPath:
      env.SKY_APPROVALS_PATH?.trim() || path.join(os.homedir(), ".claude", "sky-computer-use", "approvals.json"),
    requestTimeoutMs: positiveNumber(env.SKY_TIMEOUT_MS, 20_000),
    launchTimeoutMs: positiveNumber(env.SKY_LAUNCH_TIMEOUT_MS, 30_000),
    image: {
      maxEdge: positiveNumber(env.SKY_MAX_IMAGE_EDGE, 1568),
      maxPixels: positiveNumber(env.SKY_MAX_IMAGE_PIXELS, 1_150_000),
      jpegQuality: positiveNumber(env.SKY_JPEG_QUALITY, 80),
    },
  };
}

function positiveNumber(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
