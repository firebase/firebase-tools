import { ServerTool } from "../tool.js";
import { ServerFeature } from "../types.js";
import { authTools } from "./auth/index.js";
import { dataconnectTools } from "./dataconnect/index.js";
import { firestoreTools } from "./firestore/index.js";
import { directoryTools } from "./directory/index.js";
import { coreTools } from "./core/index.js";
import { storageTools } from "./storage/index.js";
import { messagingTools } from "./messaging/index.js";

/** availableTools returns the list of MCP tools available given the server flags */
export function availableTools(fixedRoot: boolean, activeFeatures?: ServerFeature[]): ServerTool[] {
  // Core tools are always present.
  const toolDefs: ServerTool[] = addProductGroupPrefix("firebase", coreTools);
  if (!fixedRoot) {
    // Present if the root is not fixed.
    toolDefs.push(...directoryTools);
  }
  if (!activeFeatures?.length) {
    activeFeatures = Object.keys(tools) as ServerFeature[];
  }
  for (const key of activeFeatures) {
    toolDefs.push(...tools[key]);
  }
  return toolDefs;
}

const tools: Record<ServerFeature, ServerTool[]> = {
  firestore: addProductGroupPrefix("firestore", firestoreTools),
  auth: addProductGroupPrefix("auth", authTools),
  dataconnect: addProductGroupPrefix("dataconnect", dataconnectTools),
  storage: addProductGroupPrefix("storage", storageTools),
  messaging: addProductGroupPrefix("messaging", messagingTools),
};

function addProductGroupPrefix(productGroup: string, tools: ServerTool[]): ServerTool[] {
  return tools.map((tool) => ({
    ...tool,
    mcp: {
      ...tool.mcp,
      name: `${productGroup}_${tool.mcp.name}`,
      productGroup,
    },
  }));
}

/**
 * Generates a markdown table of all available tools and their descriptions.
 * This is used for generating documentation.
 */
export function markdownDocsOfTools(): string {
  const allTools = availableTools(false, []);
  let doc = `
| Tool Name                        | Feature Group | Description         |
| -------------------------------- | ------------- | ------------------- |`;
  for (const tool of allTools) {
    let productGroup = tool.mcp.productGroup || "directory";
    if (productGroup === "firebase") {
      productGroup = "core";
    }
    doc += `
| ${tool.mcp.name} | ${productGroup} | ${tool.mcp.description} |`;
  }
  return doc;
}
