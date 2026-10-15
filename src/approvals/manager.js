import { ApprovalDeniedError } from "../helper/errors.js";

/** Decides whether the helper may touch an app, asking the human when needed. */
export class ApprovalManager {
  #store;
  #prompter;
  #inflight = new Map();

  /**
   * @param {{ store: import("./store.js").ApprovalStore,
   *           prompter: { available: boolean, askAppAccess: Function, askResume: Function } }} deps
   */
  constructor({ store, prompter }) {
    this.#store = store;
    this.#prompter = prompter;
  }

  isApproved(app) {
    return this.#store.has(app);
  }

  /** Resolves when `request.app` is approved; throws ApprovalDeniedError otherwise. */
  ensureApproved(request) {
    if (this.#store.has(request.app)) return Promise.resolve();
    // Parallel tool calls for the same app share one prompt.
    let pending = this.#inflight.get(request.app);
    if (pending == null) {
      pending = this.#askHuman(request).finally(() => this.#inflight.delete(request.app));
      this.#inflight.set(request.app, pending);
    }
    return pending;
  }

  async confirmResume() {
    return this.#prompter.available && (await this.#prompter.askResume());
  }

  async #askHuman(request) {
    const { app, displayName } = request;
    if (!this.#prompter.available) {
      throw new ApprovalDeniedError(
        `Computer Use needs the user's approval to control "${displayName}" (${app}), and this MCP client cannot ` +
          `show approval prompts. Ask the user to add "${app}" to "alwaysAllow" in ${this.#store.filePath}. ` +
          "Never edit that file yourself.",
      );
    }

    const decision = await this.#prompter.askAppAccess(request);
    if (decision === "deny") {
      throw new ApprovalDeniedError(`The user did not allow Computer Use to control "${displayName}". Do not retry.`);
    }
    if (decision === "always" && request.allowPersistentApproval) this.#store.grantAlways(app);
    else this.#store.grantSession(app);
  }
}
