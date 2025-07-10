import { ServerTool } from "../tool.js";
import { ServerFeature } from "../types.js";
import { authTools } from "./auth/index.js";
import { dataconnectTools } from "./dataconnect/index.js";
import { firestoreTools } from "./firestore/index.js";
import { coreTools } from "./core/index.js";
import { storageTools } from "./storage/index.js";
import { messagingTools } from "./messaging/index.js";
import { remoteConfigTools } from "./remoteconfig/index.js";
import { crashlyticsTools } from "./crashlytics/index.js";
import { appHostingTools } from "./apphosting/index.js";
import { realtimeDatabaseTools } from "./database/index.js";

/** availableTools returns the list of MCP tools available given the server flags */
export function availableTools(activeFeatures?: ServerFeature[]): ServerTool[] {
  // Core tools are always present.
  const toolDefs: ServerTool[] = addFeaturePrefix("firebase", coreTools);
  if (!activeFeatures?.length) {
    activeFeatures = Object.keys(tools) as ServerFeature[];
  }
  for (const key of activeFeatures) {
    toolDefs.push(...tools[key]);
  }
  return toolDefs;
}

const tools: Record<ServerFeature, ServerTool[]> = {
  firestore: addFeaturePrefix("firestore", firestoreTools),
  auth: addFeaturePrefix("auth", authTools),
  dataconnect: addFeaturePrefix("dataconnect", dataconnectTools),
  storage: addFeaturePrefix("storage", storageTools),
  messaging: addFeaturePrefix("messaging", messagingTools),
  remoteconfig: addFeaturePrefix("remoteconfig", remoteConfigTools),
  crashlytics: addFeaturePrefix("crashlytics", crashlyticsTools),
  apphosting: addFeaturePrefix("apphosting", appHostingTools),
  database: addFeaturePrefix("database", realtimeDatabaseTools),
};

function addFeaturePrefix(feature: string, tools: ServerTool[]): ServerTool[] {
  return tools.map((tool) => ({
    ...tool,
    mcp: {
      ...tool.mcp,
      name: `${feature}_${tool.mcp.name}`,
      _meta: {
        ...tool.mcp._meta,
        feature,
      },
    },
  }));
}

/**
 * Generates a markdown table of all available tools and their descriptions.
 * This is used for generating documentation.
 */
export function markdownDocsOfTools(): string {
  const allTools = availableTools([]);
  let doc = `
| Tool Name | Feature Group | Description |
| --------- | ------------- | ----------- |`;
  for (const tool of allTools) {
    let feature = tool.mcp?._meta?.feature || "";
    if (feature === "firebase") {
      feature = "core";
    }
    doc += `
| ${tool.mcp.name} | ${feature} | ${tool.mcp?.description || ""} |`;
  }
  return doc;
}
