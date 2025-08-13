import { ServerFeature } from "../types";
import { ServerPrompt } from "../prompt";
import { corePrompts } from "./core";

const prompts: Record<ServerFeature, ServerPrompt[]> = {
  core: corePrompts,
  firestore: [],
  storage: [],
  dataconnect: [],
  auth: [],
  messaging: [],
  remoteconfig: [],
  crashlytics: [],
  apphosting: [],
  database: [],
};

function namespacePrompts(
  promptsToNamespace: ServerPrompt[],
  feature: ServerFeature,
): ServerPrompt[] {
  return promptsToNamespace.map((p) => {
    const newPrompt = { ...p };
    newPrompt.mcp = { ...p.mcp };
    if (newPrompt.mcp.omitPrefix) {
      // name is as-is
    } else if (feature === "core") {
      newPrompt.mcp.name = `firebase:${p.mcp.name}`;
    } else {
      newPrompt.mcp.name = `firebase:${feature}:${p.mcp.name}`;
    }
    newPrompt.mcp._meta = { ...p.mcp._meta, feature };
    return newPrompt;
  });
}

export function availablePrompts(features?: ServerFeature[]): ServerPrompt[] {
  const allPrompts: ServerPrompt[] = namespacePrompts(prompts["core"], "core");
  if (!features) {
    features = Object.keys(prompts).filter((f) => f !== "core") as ServerFeature[];
  }

  for (const feature of features) {
    if (prompts[feature] && feature !== "core") {
      allPrompts.push(...namespacePrompts(prompts[feature], feature));
    }
  }
  return allPrompts;
}
