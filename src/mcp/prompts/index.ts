import { ServerFeature } from "../types";
import { ServerPrompt } from "../prompt";
import { corePrompts } from "./core";
import { dataconnectPrompts } from "./dataconnect";
import { crashlyticsPrompts } from "./crashlytics";

const prompts: Record<ServerFeature, ServerPrompt[]> = {
  core: corePrompts,
  firestore: [],
  storage: [],
  dataconnect: dataconnectPrompts,
  auth: [],
  messaging: [],
  functions: [],
  remoteconfig: [],
  crashlytics: crashlyticsPrompts,
  apptesting: [],
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
      newPrompt.mcp.name = `${feature}:${p.mcp.name}`;
    }
    newPrompt.mcp._meta = { ...p.mcp._meta, feature };
    return newPrompt;
  });
}

/**
 * Return available prompts based on the list of registered features.
 */
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

/**
 * Generates a markdown table of all available prompts and their descriptions.
 * This is used for generating documentation.
 */
export function markdownDocsOfPrompts(): string {
  const allPrompts = availablePrompts();
  let doc = `
| Prompt Name | Feature Group | Description |
| ----------- | ------------- | ----------- |`;
  for (const prompt of allPrompts) {
    const feature = prompt.mcp._meta?.feature || "";
    let description = prompt.mcp.description || "";
    if (prompt.mcp.arguments?.length) {
      const argsList = prompt.mcp.arguments.map(
        (arg) =>
          ` <br>&lt;${arg.name}&gt;${arg.required ? "" : " (optional)"}: ${arg.description || ""}`,
      );
      description += ` <br><br>Arguments:${argsList.join("")}`;
    }
    description = description.replaceAll("\n", "<br>");
    doc += `
| ${prompt.mcp.name} | ${feature} | ${description} |`;
  }
  return doc;
}
