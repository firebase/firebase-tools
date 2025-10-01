#!/usr/bin/env node

import { useFileLogger } from "../logger";
import { FirebaseMcpServer } from "../mcp/index";
import { parseArgs } from "util";
import { SERVER_FEATURES, ServerFeature } from "../mcp/types";
import { markdownDocsOfTools } from "../mcp/tools/index.js";
import { markdownDocsOfPrompts } from "../mcp/prompts/index.js";
import { markdownDocsOfResources } from "../mcp/resources/index.js";
import { resolve } from "path";

const STARTUP_MESSAGE = `
This is a running process of the Firebase MCP server. This command should only be executed by an MCP client. An example MCP client configuration might be:

An example MCP client configuration for apps using Firebase Build tools might be:
{
  "mcpServers": {
    "firebase": {
      "command": "firebase",
      "args": ["mcp", "--dir", "/path/to/firebase/project"]
    }
  }
}
`;

export async function mcp(): Promise<void> {
  const { values } = parseArgs({
    options: {
      only: { type: "string", default: "" },
      dir: { type: "string" },
      project: { type: "string" },
      "generate-tool-list": { type: "boolean", default: false },
      "generate-prompt-list": { type: "boolean", default: false },
      "generate-resource-list": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  let earlyExit = false;
  if (values["generate-tool-list"]) {
    console.log(markdownDocsOfTools());
    earlyExit = true;
  }
  if (values["generate-prompt-list"]) {
    console.log(markdownDocsOfPrompts());
    earlyExit = true;
  }
  if (values["generate-resource-list"]) {
    console.log(markdownDocsOfResources());
    earlyExit = true;
  }
  if (earlyExit) return;

  process.env.IS_FIREBASE_MCP = "true";
  useFileLogger();
  const activeFeatures = (values.only || "")
    .split(",")
    .filter((f) => SERVER_FEATURES.includes(f as ServerFeature)) as ServerFeature[];

  const server = new FirebaseMcpServer({
    activeFeatures,
    projectRoot: values.dir ? resolve(values.dir) : undefined,
    projectId: values["project"],
  });
  await server.start();
  if (process.stdin.isTTY) process.stderr.write(STARTUP_MESSAGE);
}
