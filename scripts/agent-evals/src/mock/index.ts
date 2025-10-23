import { Module } from "module";
import path from "path";
import { getFirebaseCliRoot } from "../runner/paths.js";
import { getMocks } from "./tool-mocks.js";
import { ServerTool } from "../../../../src/mcp/tool.js";
import { McpContext } from "../../../../src/mcp/types.js";

// The path to the module whose exports we want to intercept.
const MCP_TOOLS_INDEX_PATH = "lib/mcp/tools/index.js";

const originalRequire = Module.prototype.require;
const mocks = getMocks();

// Only apply the patch if there are mocks defined.
if (Object.keys(mocks).length > 0) {
  console.log(`[AGENT-EVALS-MOCK] Mocking enabled for tools: ${Object.keys(mocks).join(", ")}`);

  Module.prototype.require = function (id: string) {
    const requiredModule = originalRequire.apply(this, arguments as any);
    const absolutePath = Module.createRequire(this.filename).resolve(id);
    const pathRelativeToCliRoot = path.relative(getFirebaseCliRoot(), absolutePath);
    if (!pathRelativeToCliRoot.endsWith(MCP_TOOLS_INDEX_PATH)) {
      return requiredModule;
    }

    console.log(`[AGENT-EVALS-MOCK] Creating proxy for ${pathRelativeToCliRoot}`);
    return new Proxy(requiredModule, {
      get(target, prop, receiver) {
        // Check if the property being accessed is 'availableTools'.
        if (prop !== "availableTools") {
          return Reflect.get(target, prop, receiver);
        }

        console.log(`[AGENT-EVALS-MOCK] Intercepting access to 'availableTools'`);

        const originalAvailableTools = Reflect.get(target, prop, receiver);
        return (ctx: McpContext, features?: string[]): ServerTool[] => {
          const realTools: ServerTool[] = originalAvailableTools(ctx, features);
          const finalTools = realTools.map((tool) => {
            const toolName = tool.mcp.name;
            if (!mocks[toolName]) {
              return tool;
            }
            console.log(`[AGENT-EVALS-MOCK] Applying mock for tool: ${toolName}`);
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
}
