import { ServerTool } from "../tool.js";
import { ServerFeature } from "../types.js";
import { authTools } from "./auth/index.js";
import { dataconnectTools } from "./dataconnect/index.js";
import { firestoreTools } from "./firestore/index.js";
import { directoryTools } from "./directory/index.js";
import { coreTools } from "./core/index.js";
import { storageTools } from "./storage/index.js";

/** availableTools returns the list of MCP tools available given the server flags */
export function availableTools(fixedRoot: boolean, activeFeatures?: ServerFeature[]): ServerTool[] {
  // Core tools are always present.
  const toolDefs: ServerTool[] = addPrefixToToolName("firebase_", coreTools);
  if (!fixedRoot) {
    // Present if the root is not fixed.
    toolDefs.push(...directoryTools);
  }
  if (!activeFeatures || !activeFeatures.length) {
    activeFeatures = Object.keys(tools) as ServerFeature[];
  }
  for (const key of activeFeatures) {
    toolDefs.push(...tools[key]);
  }
  return toolDefs;
}

const tools: Record<ServerFeature, ServerTool[]> = {
  firestore: addPrefixToToolName("firestore_", firestoreTools),
  auth: addPrefixToToolName("auth_", authTools),
  dataconnect: addPrefixToToolName("dataconnect_", dataconnectTools),
  storage: addPrefixToToolName("storage_", storageTools),
};

function addPrefixToToolName(prefix: string, tools: ServerTool[]): ServerTool[] {
  return tools.map((tool) => ({
    ...tool,
    mcp: {
      ...tool.mcp,
      name: `${prefix}${tool.mcp.name}`,
    },
  }));
}
