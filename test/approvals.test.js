import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ApprovalManager } from "../src/approvals/manager.js";
import { ApprovalStore } from "../src/approvals/store.js";
import { ComputerUseClient } from "../src/helper/client.js";
import { UserStoppedError } from "../src/helper/errors.js";

const APPROVED = "x-oai-cua-approved-app";
const EXPLORER = { app: "process:C:\\Windows\\explorer.exe", id: 1 };
const REQUEST = { app: "explorer.exe", displayName: "explorer", riskLevel: "low", allowPersistentApproval: true };

/** Mimics codex-computer-use.exe: demands approval unless the request carries the approved-app meta. */
function fakeTransport() {
  const sent = [];
  return {
    sent,
    stopNext: false,
    async request(method, params, meta) {
      sent.push({ method, meta });
      if (this.stopNext) {
        this.stopNext = false;
        throw new UserStoppedError();
      }
      return meta[APPROVED] === REQUEST.app
        ? { id: sent.length, ok: true, result: "state" }
        : { id: sent.length, ok: false, approvalRequest: REQUEST };
    },
  };
}

function setup(decisions) {
  const prompts = [];
  const prompter = {
    available: true,
    askAppAccess: async (request) => (prompts.push(request.app), decisions.shift() ?? "deny"),
    askResume: async () => (prompts.push("resume"), decisions.shift() === "resume"),
  };
  const filePath = path.join(mkdtempSync(path.join(os.tmpdir(), "sky-test-")), "approvals.json");
  const transport = fakeTransport();
  const client = new ComputerUseClient({
    transport,
    approvals: new ApprovalManager({ store: new ApprovalStore(filePath), prompter }),
  });
  return { client, transport, prompts, filePath };
}

test("asks once, retries with the approved-app meta, then reuses the session approval", async () => {
  const { client, transport, prompts } = setup(["session"]);

  assert.equal(await client.call("get_window_state", { window: EXPLORER }), "state");
  assert.equal(await client.call("get_window_state", { window: EXPLORER }), "state");

  assert.deepEqual(prompts, ["explorer.exe"]);
  assert.deepEqual(
    transport.sent.map((request) => request.meta[APPROVED]),
    [undefined, "explorer.exe", "explorer.exe"],
  );
});

test("denial surfaces an error and never sends the approved-app meta", async () => {
  const { client, transport } = setup(["deny"]);

  await assert.rejects(client.call("click", { window: EXPLORER, x: 1, y: 1 }), /did not allow/);
  assert.ok(transport.sent.every((request) => request.meta[APPROVED] == null));
});

test("'always' approvals are persisted to the approvals file", async () => {
  const { client, filePath } = setup(["always"]);

  await client.call("get_window_state", { window: EXPLORER });
  assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), { alwaysAllow: ["explorer.exe"] });
});

test("after an Escape stop, nothing reaches the helper until the user agrees to resume", async () => {
  const { client, transport } = setup(["session", "no"]);
  await client.call("get_window_state", { window: EXPLORER });

  transport.stopNext = true;
  await assert.rejects(client.call("click", { window: EXPLORER, x: 1, y: 1 }), UserStoppedError);
  const sentBefore = transport.sent.length;
  await assert.rejects(client.call("click", { window: EXPLORER, x: 1, y: 1 }), UserStoppedError);
  assert.equal(transport.sent.length, sentBefore);
});
