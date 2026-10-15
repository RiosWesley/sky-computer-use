// End-to-end smoke test: starts the MCP server over stdio and drives Windows Calculator.
// Approval prompts are auto-accepted only for Calculator; screenshots land in ./e2e-output.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "e2e-output");
mkdirSync(outDir, { recursive: true });

const client = new Client({ name: "sky-e2e", version: "0.0.0" }, { capabilities: { elicitation: {} } });
client.setRequestHandler(ElicitRequestSchema, async ({ params }) => {
  const isCalculator = /Calculadora|Calculator|ApplicationFrameHost/i.test(params.message);
  console.log(`elicitation: ${params.message} -> ${isCalculator ? "accept" : "decline"}`);
  return isCalculator ? { action: "accept", content: { remember: false } } : { action: "decline" };
});

await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "src", "index.js")],
    env: { ...process.env, SKY_APPROVALS_PATH: path.join(mkdtempSync(path.join(os.tmpdir(), "sky-e2e-")), "a.json") },
  }),
);

let shotCount = 0;
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  for (const block of result.content) {
    if (block.type === "image") {
      const file = path.join(outDir, `${String(++shotCount).padStart(2, "0")}-${name}.jpg`);
      writeFileSync(file, Buffer.from(block.data, "base64"));
      console.log(`  image -> ${file}`);
    } else {
      console.log(`  ${block.text.slice(0, 300).replaceAll("\n", " | ")}`);
    }
  }
  if (result.isError) throw new Error(`${name} failed`);
  return result;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const findCalculator = async () => {
  const apps = JSON.parse((await call("list_apps", { query: "calculator" })).content[0].text);
  if (apps.length > 0) return apps[0];
  const wins = JSON.parse((await call("list_windows", {})).content[0].text);
  const hit = wins.find((w) => /calculator|calculadora/i.test(`${w.app} ${w.title}`));
  return hit ? { id: hit.app, windows: [hit] } : null;
};

try {
  const tools = await client.listTools();
  console.log("tools:", tools.tools.map((tool) => tool.name).join(", "));

  let calculator = await findCalculator();
  if (!calculator) {
    console.log("calculator not running, launching calc.exe");
    await call("launch_app", { app: "calc.exe" });
    await sleep(2500);
    calculator = await findCalculator();
  }
  if (!calculator) throw new Error("calculator still not found after launch");
  const window = calculator.windows[0];

  console.log("observe:");
  const state = await call("get_window_state", { window });
  const summary = JSON.parse(state.content[0].text);
  const [imageWidth, imageHeight] = summary.screenshots[0].image_size.split("x").map(Number);

  console.log("keyboard: Escape, 12+30, Return");
  await call("press_key", { window: summary.window, key: "Escape", observe: "none" });
  await call("type_text", { window: summary.window, text: "12+30", observe: "none" });
  await call("press_key", { window: summary.window, key: "Return" });

  console.log("coordinate click on the '2' key (expected display: 2):");
  await call("get_window_state", { window: summary.window });
  await call("click", {
    window: summary.window,
    x: Math.round(imageWidth * (122 / 322)),
    y: Math.round(imageHeight * (450 / 534)),
    screenshot_id: summary.screenshots[0].screenshot_id,
  });

  console.log("close calculator:");
  await call("press_key", { window: summary.window, key: "Alt+F4", observe: "none" });
} finally {
  await client.close();
}
