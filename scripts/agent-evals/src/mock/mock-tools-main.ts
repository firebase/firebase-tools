import { Module } from "module";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { getFirebaseCliRoot } from "../runner/paths.js";
import { getToolMocks } from "./tool-mocks.js";

//
// This file is run as a node --import parameter before the Firebase CLI to
// patch the implementation for tools with the mocked implementation
//

// Path to the built MCP Tools implementation in the Firebase CLI, relative to
// the repo's root
const MCP_TOOLS_INDEX_PATH = "lib/mcp/tools/index.js";
// NOTE: This will be in the output directory "home", not your real home
// directory, because the HOME environment variable is changed for the evals
const LOG_FILE_PATH = path.join(os.homedir(), "agent_evals_mock_logs.txt");
// Enable this to turn on file logging. This can be helpful for debugging
// because console logs get swallowed
const ENABLE_FILE_LOGGING = false;

const MCP_KEY = "mcp";
const META_KEY = "_meta";

const mocks = getToolMocks();

const originalRequire = Module.prototype.require;
(Module.prototype as any).require = function (id: string) {
  const requiredModule = originalRequire.apply(this, [id]);
  const absolutePath = Module.createRequire(this.filename).resolve(id);
  const pathRelativeToCliRoot = path.relative(getFirebaseCliRoot(), absolutePath);

  if (!pathRelativeToCliRoot.endsWith(MCP_TOOLS_INDEX_PATH)) {
    return requiredModule;
  }

  logToFile(
    `Creating proxy implementation for file: ${pathRelativeToCliRoot} with tool mocks: ${JSON.stringify(Object.keys(mocks))}`,
  );

  return new Proxy(requiredModule, {
    get(target, prop, receiver) {
      if (prop !== "availableTools") {
        return Reflect.get(target, prop, receiver);
      }

      logToFile(`Intercepting access to 'availableTools'`);

      const originalAvailableTools = Reflect.get(target, prop, receiver);
      return async (ctx: any, features?: string[]): Promise<any[]> => {
        const realTools = await originalAvailableTools(ctx, features);
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
            ...removeToolRequirements(tool),
            fn: async () => mocks[toolName],
          };
        });

        return finalTools;
      };
    },
  });
};

function removeToolRequirements(tool: any) {
  if (!tool[MCP_KEY] || !tool[MCP_KEY][META_KEY]) {
    return tool;
  }
  tool[MCP_KEY][META_KEY]["optionalProjectDir"] = false;
  tool[MCP_KEY][META_KEY]["requiresAuth"] = false;
  tool[MCP_KEY][META_KEY]["requiresProject"] = false;
  return tool;
}

function logToFile(message: string) {
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
}
