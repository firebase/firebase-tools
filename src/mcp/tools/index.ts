import { ServerTool } from "../tool.js";
import { ServerFeature } from "../types.js";
import { authTools } from "./auth/index.js";
import { dataconnectTools } from "./dataconnect/index.js";
import { firestoreTools } from "./firestore/index.js";
import { projectTools } from "./project/index.js";
import { storageTools } from "./storage/index.js";

export const tools: Record<ServerFeature, ServerTool[]> = {
  project: projectTools,
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
