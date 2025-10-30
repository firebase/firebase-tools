import { McpContext, ServerFeature } from "../types";
import { ServerPrompt } from "../prompt";
import { corePrompts } from "./core";
import { dataconnectPrompts } from "./dataconnect";
import { crashlyticsPrompts } from "./crashlytics";

const prompts: Record<ServerFeature, ServerPrompt[]> = {
  core: namespacePrompts(corePrompts, "core"),
  firestore: [],
  storage: [],
  dataconnect: namespacePrompts(dataconnectPrompts, "dataconnect"),
  auth: [],
  messaging: [],
  functions: [],
  remoteconfig: [],
  crashlytics: namespacePrompts(crashlyticsPrompts, "crashlytics"),
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
export async function availablePrompts(
  ctx: McpContext,
  activeFeatures?: ServerFeature[],
): Promise<ServerPrompt[]> {
  const allPrompts = getAllPrompts(activeFeatures);

  const availabilities = await Promise.all(
    allPrompts.map((p) => {
      if (p.isAvailable) {
        return p.isAvailable(ctx);
      }
      return true;
    }),
  );
  return allPrompts.filter((_, i) => availabilities[i]);
}

function getAllPrompts(activeFeatures?: ServerFeature[]): ServerPrompt[] {
  const promptDefs: ServerPrompt[] = [];
  if (!activeFeatures?.length) {
    activeFeatures = Object.keys(prompts) as ServerFeature[];
  }
  if (!activeFeatures.includes("core")) {
    activeFeatures.unshift("core");
  }
  for (const feature of activeFeatures) {
    promptDefs.push(...prompts[feature]);
  }
  return promptDefs;
}

/**
 * Generates a markdown table of all available prompts and their descriptions.
 * This is used for generating documentation.
 */
export function markdownDocsOfPrompts(): string {
  const allPrompts = getAllPrompts();
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
