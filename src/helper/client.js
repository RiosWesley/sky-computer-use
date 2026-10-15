import { HelperError, UserStoppedError } from "./errors.js";

const APPROVED_APP_META_KEY = "x-oai-cua-approved-app";
const MAX_APPROVAL_ROUNDS = 3;

/**
 * Request/approval loop on top of the raw transport.
 * The helper answers `{ ok: false, approvalRequest }` until a request carries
 * `x-oai-cua-approved-app` for that app; it does not remember approvals itself,
 * so every approved app is replayed from the ApprovalManager on each call.
 */
export class ComputerUseClient {
  #transport;
  #approvals;
  #stopped = false;
  // Window app ids ("process:C:\\...\\explorer.exe") differ from approval keys ("explorer.exe"),
  // so remember the mapping to skip the approval round-trip on later calls.
  #approvalKeyByTarget = new Map();

  /**
   * @param {{ transport: import("./transport.js").HelperTransport,
   *           approvals: import("../approvals/manager.js").ApprovalManager }} deps
   */
  constructor({ transport, approvals }) {
    this.#transport = transport;
    this.#approvals = approvals;
  }

  /** Called by the transport when the user presses Escape. */
  markStoppedByUser() {
    this.#stopped = true;
  }

  async call(method, params = {}) {
    await this.#resumeIfStopped();

    const target = params.window?.app ?? params.app;
    let meta = this.#knownApprovalMeta(target);
    for (let round = 0; round < MAX_APPROVAL_ROUNDS; round += 1) {
      const response = await this.#request(method, params, meta);
      if (response.ok) return response.result;
      if (response.approvalRequest == null) throw new HelperError(method, response.error ?? "request failed");

      const approvalKey = response.approvalRequest.app;
      await this.#approvals.ensureApproved(response.approvalRequest);
      if (target != null) this.#approvalKeyByTarget.set(target, approvalKey);
      meta = { [APPROVED_APP_META_KEY]: approvalKey };
    }
    throw new HelperError(method, "approval loop did not converge");
  }

  #knownApprovalMeta(target) {
    const approvalKey = this.#approvalKeyByTarget.get(target);
    return approvalKey != null && this.#approvals.isApproved(approvalKey)
      ? { [APPROVED_APP_META_KEY]: approvalKey }
      : {};
  }

  close() {
    return this.#transport.close();
  }

  async #request(method, params, meta) {
    try {
      return await this.#transport.request(method, params, meta);
    } catch (error) {
      if (error instanceof UserStoppedError) this.#stopped = true;
      throw error;
    }
  }

  /** After an Escape stop, only the user (not the model) can let Computer Use continue. */
  async #resumeIfStopped() {
    if (!this.#stopped) return;
    if (!(await this.#approvals.confirmResume())) throw new UserStoppedError();
    this.#stopped = false;
  }
}
