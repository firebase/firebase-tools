#!/usr/bin/env node

import { useFileLogger } from "../logger";
import { FirebaseMcpServer } from "../mcp/index";
import { parseArgs } from "util";
import { SERVER_FEATURES, ServerFeature } from "../mcp/types";

const STARTUP_MESSAGE = `
This is a running process of the Firebase MCP server. This command should only be executed by an MCP client. An example MCP client configuration might be:

{
  "mcpServers": {
    "firebase": {
      "command": "firebase",
      "args": ["experimental:mcp", "--dir", "/path/to/firebase/project"]
    }
  }
}
`;

export async function mcp(): Promise<void> {
  const { values } = parseArgs({
    options: {
      only: { type: "string", default: "" },
      dir: { type: "string" },
    },
    allowPositionals: true,
  });
  useFileLogger();
  const activeFeatures = (values.only || "")
    .split(",")
    .filter((f) => SERVER_FEATURES.includes(f as ServerFeature)) as ServerFeature[];
  const server = new FirebaseMcpServer({ activeFeatures, projectRoot: values.dir });
  await server.start();
  if (process.stdin.isTTY) process.stderr.write(STARTUP_MESSAGE);
}
