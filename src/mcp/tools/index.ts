import { ONEMCP_SERVERS } from "../onemcp/index";
import { ServerTool } from "../tool";
import { McpContext, ServerFeature } from "../types";
import { appHostingTools } from "./apphosting/index";
import { apptestingTools } from "./apptesting/index";
import { authTools } from "./auth/index";
import { coreTools } from "./core/index";
import { crashlyticsTools } from "./crashlytics/index";
import { dataconnectTools } from "./dataconnect/index";
import { firestoreTools } from "./firestore/index";
import { functionsTools } from "./functions/index";
import { messagingTools } from "./messaging/index";
import { realtimeDatabaseTools } from "./realtime_database/index";
import { remoteConfigTools } from "./remoteconfig/index";
import { storageTools } from "./storage/index";

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

const tools: Record<ServerFeature, ServerTool[]> = {
  apphosting: addFeaturePrefix("apphosting", appHostingTools),
  apptesting: addFeaturePrefix("apptesting", apptestingTools),
  auth: addFeaturePrefix("auth", authTools),
  core: addFeaturePrefix("firebase", coreTools),
  crashlytics: addFeaturePrefix("crashlytics", crashlyticsTools),
  database: addFeaturePrefix("realtimedatabase", realtimeDatabaseTools),
  dataconnect: addFeaturePrefix("dataconnect", dataconnectTools),
  firestore: addFeaturePrefix("firestore", firestoreTools),
  functions: addFeaturePrefix("functions", functionsTools),
  messaging: addFeaturePrefix("messaging", messagingTools),
  remoteconfig: addFeaturePrefix("remoteconfig", remoteConfigTools),
  storage: addFeaturePrefix("storage", storageTools),
  // No local tools for developer knowledge
  developerknowledge: [],
};

const allToolsMap = new Map(
  Object.values(tools)
    .flat()
    .sort((a, b) => a.mcp.name.localeCompare(b.mcp.name))
    .map((t) => [t.mcp.name, t]),
);

async function getToolsByName(names: string[]): Promise<ServerTool[]> {
  const selectedTools = new Set<ServerTool>();

  const remoteTools = new Map((await getRemoteToolsByFeature()).map((t) => [t.mcp.name, t]));

  for (const toolName of names) {
    const tool = allToolsMap.get(toolName) || remoteTools.get(toolName);
    if (tool) {
      selectedTools.add(tool);
    }
  }

  return Array.from(selectedTools);
}

export async function getToolsByFeature(serverFeatures?: ServerFeature[]): Promise<ServerTool[]> {
  const features = new Set(
    serverFeatures?.length
      ? serverFeatures
      : (Object.keys({ ...tools, ...ONEMCP_SERVERS }) as ServerFeature[]),
  );
  features.add("core");

  const featureList = Array.from(features);
  const localTools = featureList.flatMap((feature) => tools[feature] || []);
  const remoteTools = await getRemoteToolsByFeature(featureList);
  return [...localTools, ...remoteTools];
}

/**
 * Fetches tools from remote MCP servers.
 */
export async function getRemoteToolsByFeature(features?: ServerFeature[]): Promise<ServerTool[]> {
  const remoteToolsPromises: Promise<ServerTool[]>[] = [];
  for (const feature of features || (Object.keys(ONEMCP_SERVERS) as ServerFeature[])) {
    const server = ONEMCP_SERVERS[feature];
    if (server) {
      remoteToolsPromises.push(server.fetchRemoteTools());
    }
  }
  return Promise.all(remoteToolsPromises).then((tools) => tools.flat());
}

/**
 * Discover all all available tools. When `activeFeatures` is provided, tool discovery will only
 * consider those features. When `enabledTools` is provided, discovery is skipped entirely, and
 * only tools with exactly those names are returned.
 */
export async function availableTools(
  ctx: McpContext,
  activeFeatures?: ServerFeature[],
  detectedFeatures?: ServerFeature[],
  enabledTools?: string[],
): Promise<ServerTool[]> {
  if (enabledTools?.length) {
    return getToolsByName(enabledTools);
  }

  if (activeFeatures?.length) {
    return getToolsByFeature(activeFeatures);
  }

  const allTools = await getToolsByFeature(detectedFeatures);
  const availabilities = await Promise.all(
    allTools.map((t) => {
      if (t.isAvailable) {
        return t.isAvailable(ctx);
      }
      return true;
    }),
  );
  return allTools.filter((_, i) => availabilities[i]);
}

/**
 * Generates a markdown table of all available tools and their descriptions.
 * This is used for generating documentation.
 */
export async function markdownDocsOfTools(): Promise<string> {
  const allTools = await getToolsByFeature([]);
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
