import { Module } from "module";
import path from "path";
import fs from "fs"; // <-- ADDED
import os from "os"; // <-- ADDED
import { getFirebaseCliRoot } from "../runner/paths.js";
import { getMocks } from "./tool-mocks.js";

const LOG_FILE_PATH = path.join(os.homedir(), "Desktop", "mcp_logs.txt");

/**
 * Appends a log message to the specified log file.
 * Includes a timestamp and error handling.
 */
const logToFile = (message: string) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    // Use appendFileSync to synchronously add to the file
    fs.appendFileSync(LOG_FILE_PATH, logMessage, "utf8");
  } catch (err) {
    // Fallback to console if file logging fails
    console.error(`[AGENT-EVALS-MOCK-ERROR] Failed to write log to ${LOG_FILE_PATH}:`, err);
    console.error(`[AGENT-EVALS-MOCK-ERROR] Original message: ${message}`);
  }
};
// --- END: File Logging Setup ---

// The path to the module whose exports we want to intercept.
const MCP_TOOLS_INDEX_PATH = "lib/mcp/tools/index.js";

const originalRequire = Module.prototype.require;
const mocks = getMocks();

// --- CHANGED ---
logToFile(`[AGENT-EVALS-MOCK] Mocking enabled for tools: ${Object.keys(mocks).join(", ")}`);

Module.prototype.require = function (id: string) {
  const requiredModule = originalRequire.apply(this, arguments as any);
  const absolutePath = Module.createRequire(this.filename).resolve(id);
  const pathRelativeToCliRoot = path.relative(getFirebaseCliRoot(), absolutePath);
  logToFile(`Checking: ${pathRelativeToCliRoot} against ${MCP_TOOLS_INDEX_PATH}`);
  if (!pathRelativeToCliRoot.endsWith(MCP_TOOLS_INDEX_PATH)) {
    return requiredModule;
  }

  // --- CHANGED ---
  logToFile(`[AGENT-EVALS-MOCK] Creating proxy for ${pathRelativeToCliRoot}`);
  return new Proxy(requiredModule, {
    get(target, prop, receiver) {
      // Check if the property being accessed is 'availableTools'.
      if (prop !== "availableTools") {
        return Reflect.get(target, prop, receiver);
      }

      // --- CHANGED ---
      logToFile(`[AGENT-EVALS-MOCK] Intercepting access to 'availableTools'`);

      const originalAvailableTools = Reflect.get(target, prop, receiver);
      return (ctx: any, features?: string[]): any[] => {
        const realTools: any[] = originalAvailableTools(ctx, features);
        const finalTools = realTools.map((tool) => {
          const toolName = tool.mcp.name;
          if (!mocks[toolName]) {
            return tool;
          }
          // --- CHANGED ---
          logToFile(`[AGENT-EVALS-MOCK] Applying mock for tool: ${toolName}`);
          return {
            ...tool,
            fn: async () => mocks[toolName],
          };
        });

        return finalTools;
      };
    },
  });
};
