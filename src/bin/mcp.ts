#!/usr/bin/env node

import { resolve } from "path";
import { parseArgs } from "util";
import { useFileLogger } from "../logger";
import { FirebaseMcpServer } from "../mcp/index";
import { markdownDocsOfPrompts } from "../mcp/prompts/index.js";
import { markdownDocsOfResources } from "../mcp/resources/index.js";
import { markdownDocsOfTools } from "../mcp/tools/index.js";
import { SERVER_FEATURES, ServerFeature } from "../mcp/types";

const STARTUP_MESSAGE = `
This is a running process of the Firebase MCP server. This command should only be executed by an MCP client. An example MCP client configuration might be:

{
  "mcpServers": {
    "firebase": {
      "command": "firebase",
      "args": ["mcp", "--dir", "/path/to/firebase/project"]
    }
  }
}
`;

const HELP_TEXT = `Usage: firebase mcp [options]

Description:
  Starts the Model Context Protocol (MCP) server for the Firebase CLI. This server provides a
  standardized way for AI agents and IDEs to interact with your Firebase project.

Tool Discovery & Loading:
  The server automatically determines which tools to expose based on your project context.

  1. Auto-Detection (Default):
     - Scans 'firebase.json' for configured services (e.g., Hosting, Firestore).
     - Checks enabled Google Cloud APIs for the active project.
     - Inspects project files for specific SDKs (e.g., Crashlytics in Android/iOS).

  2. Manual Overrides:
     - Use '--only' to restrict tool discovery to specific feature sets (e.g., core, firestore).
     - Use '--tools' to disable auto-detection entirely and load specific tools by name.

Options:
  --dir <path>              Project root directory (defaults to current working directory).
  --only <features>         Comma-separated list of features to enable (e.g. core, firestore).
                            If specified, auto-detection is disabled for other features.
  --tools <tools>           Comma-separated list of specific tools to enable. Disables
                            auto-detection entirely.
  -h, --help                Show this help message.
`;

export async function mcp(): Promise<void> {
  const { values } = parseArgs({
    options: {
      only: { type: "string", default: "" },
      tools: { type: "string", default: "" },
      dir: { type: "string" },
      "generate-tool-list": { type: "boolean", default: false },
      "generate-prompt-list": { type: "boolean", default: false },
      "generate-resource-list": { type: "boolean", default: false },
      help: { type: "boolean", default: false, short: "h" },
    },
    allowPositionals: true,
  });

  let earlyExit = false;
  if (values.help) {
    console.log(HELP_TEXT);
    earlyExit = true;
  }
  if (values["generate-tool-list"]) {
    console.log(await markdownDocsOfTools());
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
    .map((f) => f.trim())
    .filter((f) => SERVER_FEATURES.includes(f as ServerFeature)) as ServerFeature[];
  const enabledTools = (values.tools || "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const server = new FirebaseMcpServer({
    activeFeatures,
    enabledTools,
    projectRoot: values.dir ? resolve(values.dir) : undefined,
  });
  await server.start();
  if (process.stdin.isTTY) process.stderr.write(STARTUP_MESSAGE);
}
