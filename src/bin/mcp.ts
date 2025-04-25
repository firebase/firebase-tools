#!/usr/bin/env node

import { Command } from "../command";
import { requireAuth } from "../requireAuth";

import { silenceStdout } from "../logger";
silenceStdout();

import { FirebaseMcpServer } from "../mcp/index";
import { parseArgs } from "util";
import { SERVER_FEATURES, ServerFeature } from "../mcp/types";

export async function mcp() {
  const { values } = parseArgs({
    options: {
      only: { type: "string", default: "" },
      dir: { type: "string" },
    },
    allowPositionals: true,
  });
  const activeFeatures = (values.only || "")
    .split(",")
    .filter((f) => SERVER_FEATURES.includes(f as any)) as ServerFeature[];
  const server = new FirebaseMcpServer({ activeFeatures });
  await server.start();
}
