import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Session approvals live in memory; "always" approvals live in a JSON file
 * (`{ "alwaysAllow": ["explorer.exe", ...] }`) that the user may also edit by hand.
 * The file is re-read on every lookup so manual edits apply without a restart.
 */
export class ApprovalStore {
  #filePath;
  #session = new Set();

  constructor(filePath) {
    this.#filePath = filePath;
  }

  get filePath() {
    return this.#filePath;
  }

  has(app) {
    const want = String(app).toLowerCase();
    if ([...this.#session].some((a) => a.toLowerCase() === want)) return true;
    return this.#readAlwaysAllow().some((a) => a.toLowerCase() === want);
  }

  grantSession(app) {
    this.#session.add(app);
  }

  grantAlways(app) {
    this.#session.add(app);
    const alwaysAllow = this.#readAlwaysAllow();
    if (alwaysAllow.includes(app)) return;
    mkdirSync(path.dirname(this.#filePath), { recursive: true });
    writeFileSync(this.#filePath, `${JSON.stringify({ alwaysAllow: [...alwaysAllow, app] }, null, 2)}\n`, "utf8");
  }

  #readAlwaysAllow() {
    try {
      const data = JSON.parse(readFileSync(this.#filePath, "utf8"));
      return Array.isArray(data?.alwaysAllow) ? data.alwaysAllow.filter((app) => typeof app === "string") : [];
    } catch {
      return [];
    }
  }
}
