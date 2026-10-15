import { spawn } from "node:child_process";
import { UserStoppedError, isUserStopMessage } from "./errors.js";

const ESCAPE_EXIT_CODE = 130;
const BUDGET_META_KEY = "x-oai-cua-request-budget-ms";
const STDERR_TAIL_CHARS = 2000;

/**
 * Talks to codex-computer-use.exe over stdio using newline-delimited JSON:
 *   -> {"id":1,"method":"list_apps","params":{},"meta":{...}}
 *   <- {"id":1,"ok":true,"result":...} | {"id":1,"ok":false,"error":"..."} | {"id":1,"ok":false,"approvalRequest":{...}}
 * The helper is spawned lazily, requests are serialized, and a crashed or
 * timed-out helper is respawned on the next request.
 */
export class HelperTransport {
  #options;
  #child = null;
  #stdoutBuffer = "";
  #stderrTail = "";
  #nextId = 1;
  #pending = new Map();
  #queue = Promise.resolve();

  /**
   * @param {{ helperPath: string|null, codexCliPath: string|null, requestTimeoutMs: number,
   *           launchTimeoutMs: number, onUserStop?: () => void }} options
   */
  constructor(options) {
    this.#options = options;
  }

  /** Sends one request and resolves with the raw response message. */
  request(method, params, meta = {}) {
    const run = () => this.#send(method, params, meta);
    const response = this.#queue.then(run, run);
    this.#queue = response.catch(() => {});
    return response;
  }

  async close() {
    const child = this.#child;
    if (child == null) return;
    await this.request("close", {}).catch(() => {});
    child.kill();
  }

  #send(method, params, meta) {
    const child = this.#ensureChild();
    const id = this.#nextId++;
    const timeoutMs = method === "launch_app" ? this.#options.launchTimeoutMs : this.#options.requestTimeoutMs;
    const frame = `${JSON.stringify({ id, method, params, meta: { ...meta, [BUDGET_META_KEY]: timeoutMs } })}\n`;

    return new Promise((resolve, reject) => {
      // The helper enforces the budget itself; the extra grace only catches a hung process.
      const timer = setTimeout(() => {
        this.#terminate(child, new Error(`computer-use request timed out: ${method}`));
      }, timeoutMs + 5_000);
      this.#pending.set(id, { child, resolve, reject, timer });
      child.stdin.write(frame, "utf8", (error) => {
        if (error != null) this.#settle(id, { error });
      });
    });
  }

  #ensureChild() {
    if (this.#child != null) return this.#child;
    const { helperPath, codexCliPath } = this.#options;
    if (!helperPath) {
      throw new Error(
        "codex-computer-use.exe was not found. Install/open the Codex desktop app once, or set SKY_HELPER_PATH.",
      );
    }

    const child = spawn(helperPath, ["--parent-pid", String(process.pid)], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, ...(codexCliPath ? { CODEX_CLI_PATH: codexCliPath } : {}) },
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.#onStdout(child, chunk));
    child.stderr.on("data", (chunk) => this.#onStderr(child, chunk));
    child.on("exit", (code, signal) => this.#onExit(child, code, signal));
    child.on("error", (error) => this.#terminate(child, error));

    this.#child = child;
    this.#stdoutBuffer = "";
    this.#stderrTail = "";
    return child;
  }

  #onStdout(child, chunk) {
    if (child !== this.#child) return;
    this.#stdoutBuffer += chunk;
    let newline;
    while ((newline = this.#stdoutBuffer.indexOf("\n")) !== -1) {
      const line = this.#stdoutBuffer.slice(0, newline).trim();
      this.#stdoutBuffer = this.#stdoutBuffer.slice(newline + 1);
      if (line !== "") this.#onMessage(child, line);
    }
  }

  #onMessage(child, line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.#terminate(child, new Error(`computer-use helper emitted invalid JSON: ${line.slice(0, 200)}`));
      return;
    }
    if (typeof message.id !== "number") return; // unsolicited event; nothing consumes these yet

    if (message.ok === false && isUserStopMessage(message.error)) {
      this.#terminate(child, new UserStoppedError());
      return;
    }
    this.#settle(message.id, { message });
  }

  #onStderr(child, chunk) {
    if (child !== this.#child) return;
    this.#stderrTail = (this.#stderrTail + chunk).slice(-STDERR_TAIL_CHARS);
    process.stderr.write(`[codex-computer-use] ${chunk}`);
  }

  #onExit(child, code, signal) {
    if (code === ESCAPE_EXIT_CODE) {
      this.#terminate(child, new UserStoppedError());
      return;
    }
    const reason = signal == null ? `exit code ${code}` : `signal ${signal}`;
    const stderr = child === this.#child ? this.#stderrTail.trim() : "";
    this.#terminate(child, new Error(`computer-use helper exited with ${reason}${stderr ? `: ${stderr}` : ""}`));
  }

  /** Fails every request owned by `child` and forgets the process so the next request respawns it. */
  #terminate(child, error) {
    if (error instanceof UserStoppedError && child === this.#child) this.#options.onUserStop?.();
    for (const [id, entry] of this.#pending) {
      if (entry.child === child) this.#settle(id, { error });
    }
    if (child === this.#child) this.#child = null;
    if (child.exitCode == null && child.signalCode == null) child.kill();
  }

  #settle(id, { message, error }) {
    const entry = this.#pending.get(id);
    if (entry == null) return;
    this.#pending.delete(id);
    clearTimeout(entry.timer);
    if (error != null) entry.reject(error);
    else entry.resolve(message);
  }
}
