import { ServerTool } from "../tool";
import { ServerFeature } from "../types";
import { authTools } from "./auth/index";
import { dataconnectTools } from "./dataconnect/index";
import { firestoreTools } from "./firestore/index";
import { coreTools } from "./core/index";
import { storageTools } from "./storage/index";
import { messagingTools } from "./messaging/index";
import { remoteConfigTools } from "./remoteconfig/index";
import { crashlyticsTools } from "./crashlytics/index";
import { appHostingTools } from "./apphosting/index";
import { rtdbTools } from "./rtdb/index";
import { functionsTools } from "./functions/index";

/** availableTools returns the list of MCP tools available given the server flags */
export function availableTools(activeFeatures?: ServerFeature[]): ServerTool[] {
  const toolDefs: ServerTool[] = [];
  if (!activeFeatures?.length) {
    activeFeatures = Object.keys(tools) as ServerFeature[];
  }
  if (!activeFeatures.includes("core")) {
    activeFeatures = ["core", ...activeFeatures];
  }
  for (const key of activeFeatures) {
    toolDefs.push(...tools[key]);
  }
  return toolDefs;
}

const tools: Record<ServerFeature, ServerTool[]> = {
  core: addFeaturePrefix("firebase", coreTools),
  firestore: addFeaturePrefix("firestore", firestoreTools),
  auth: addFeaturePrefix("auth", authTools),
  dataconnect: addFeaturePrefix("dataconnect", dataconnectTools),
  storage: addFeaturePrefix("storage", storageTools),
  messaging: addFeaturePrefix("messaging", messagingTools),
  functions: addFeaturePrefix("functions", functionsTools),
  remoteconfig: addFeaturePrefix("remoteconfig", remoteConfigTools),
  crashlytics: addFeaturePrefix("crashlytics", crashlyticsTools),
  apphosting: addFeaturePrefix("apphosting", appHostingTools),
  rtdb: addFeaturePrefix("rtdb", rtdbTools),
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
    const description = (tool.mcp?.description || "").replaceAll("\n", "<br>");
    doc += `
| ${tool.mcp.name} | ${feature} | ${description} |`;
  }
  return doc;
}
