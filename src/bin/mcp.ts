#!/usr/bin/env node

import { Command } from "../command";
import { requireAuth } from "../requireAuth";

const { silenceStdout } = require("../logger");
silenceStdout();

const { FirebaseMcpServer } = require("../mcp/index");

const cmd = new Command("mcp").before(requireAuth);

export async function mcp() {
  const options: any = {};
  await cmd.prepare(options);
  const server = new FirebaseMcpServer({ cliOptions: options });
  server.start();
}
