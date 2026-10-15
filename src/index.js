#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const config = loadConfig();
const { server, shutdown } = createServer(config);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  shutdown().finally(() => process.exit(0));
};
server.server.onclose = stop;
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await server.connect(new StdioServerTransport());
process.stderr.write(`[sky-native] approvals=${config.approvalsPath}\n`);
