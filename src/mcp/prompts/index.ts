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

function addFeaturePrefixToPrompts(feature: string, prompts: ServerPrompt[]): ServerPrompt[] {
  return prompts.map((p) => {
    const newPrompt = { ...p };
    newPrompt.mcp = { ...p.mcp };
    newPrompt.mcp.name = `${feature}_${p.mcp.name}`;
    newPrompt.mcp._meta = { ...p.mcp._meta, feature };
    return newPrompt;
  });
}

export function availablePrompts(features?: ServerFeature[]): ServerPrompt[] {
  const allPrompts: ServerPrompt[] = prompts["core"];
  if (!features) {
    features = Object.keys(prompts).filter((f) => f !== "core") as ServerFeature[];
  }

  for (const feature of features) {
    if (prompts[feature] && feature !== "core") {
      allPrompts.push(...addFeaturePrefixToPrompts(feature, prompts[feature]));
    }
  }
  return allPrompts;
}
