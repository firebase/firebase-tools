import { Module } from "module";
import path from "path";
import fs from "fs";
import os from "os";
import { getFirebaseCliRoot } from "../runner/paths.js";
import { getToolMocks } from "./tool-mocks.js";

//
// This file is run as a node --import parameter before the Firebase CLI to
// patch the implementation for tools with the mocked implementation
//

// Path to the built MCP Tools implementation in the Firebase CLI, relative to
// the repo's root
const MCP_TOOLS_INDEX_PATH = "lib/mcp/tools/index.js";
const LOG_FILE_PATH = path.join(os.homedir(), "Desktop", "agent_evals_mock_logs.txt");
// Enable this to turn on file logging. This can be helpful for debugging
// because console logs get swallowed
const ENABLE_FILE_LOGGING = true;

const mocks = getToolMocks();

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  const requiredModule = originalRequire.apply(this, arguments as any);
  const absolutePath = Module.createRequire(this.filename).resolve(id);
  const pathRelativeToCliRoot = path.relative(getFirebaseCliRoot(), absolutePath);
  if (!pathRelativeToCliRoot.endsWith(MCP_TOOLS_INDEX_PATH)) {
    return requiredModule;
  }

  logToFile(`Creating proxy implementation for file: ${pathRelativeToCliRoot} with tool mocks: ${JSON.stringify(Object.keys(mocks))}`);

  return new Proxy(requiredModule, {
    get(target, prop, receiver) {
      if (prop !== "availableTools") {
        return Reflect.get(target, prop, receiver);
      }

      logToFile(`Intercepting access to 'availableTools'`);

      const originalAvailableTools = Reflect.get(target, prop, receiver);
      return (ctx: any, features?: string[]): Promise<any[]> => {
        const realToolsPromise: Promise<any[]> = originalAvailableTools(ctx, features);
        return realToolsPromise.then((realTools) => {
          if (!Array.isArray(realTools)) {
            logToFile(`Error: Real tools is not an array: ${JSON.stringify(realTools)}`);
            return realTools;
          }

          const finalTools = realTools.map((tool) => {
            const toolName = tool.mcp.name;
            if (!mocks[toolName]) {
              return tool;
            }
            logToFile(`Applying mock for tool: ${toolName}`);
            return {
              ...tool,
              fn: async () => mocks[toolName],
            };
          });

          return finalTools;
        });
      };
    },
  });
};

const logToFile = (message: string) => {
  if (!ENABLE_FILE_LOGGING) {
    return;
  }
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE_PATH, logMessage, "utf8");
  } catch (err) {
    console.error(`[AGENT-EVALS-MOCK-ERROR] Failed to write log to ${LOG_FILE_PATH}:`, err);
    console.error(`[AGENT-EVALS-MOCK-ERROR] Original message: ${message}`);
  }
};
