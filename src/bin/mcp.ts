#!/usr/bin/env node

import { Command } from "../command";
import { requireAuth } from "../requireAuth";

import { silenceStdout } from "../logger";
silenceStdout();

import { FirebaseMcpServer } from "../mcp/index";

const cmd = new Command("mcp").before(requireAuth);

export async function mcp() {
  const options: any = {};
  options.cwd = process.env.PROJECT_ROOT || process.env.CWD;
  await cmd.prepare(options);
  const server = new FirebaseMcpServer({ cliOptions: options });
  await server.start();
}
