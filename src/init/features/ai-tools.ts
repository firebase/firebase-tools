import * as utils from "../../utils";
import { checkbox, confirm } from "../../prompt";
import { Setup } from "../index";
import { Config } from "../../config";
import { AI_TOOLS, AIToolChoice } from "./ai-tools/index";

interface AgentsInitSelections {
  tools?: string[];
  optimizeForFeatures?: boolean;
}

const AGENT_CHOICES: AIToolChoice[] = Object.values(AI_TOOLS).map(tool => ({
  value: tool.name,
  name: tool.displayName,
  checked: false,
}));

export async function doSetup(setup: Setup, config: Config) {
  utils.logBullet("🔥 Welcome to Firebase AI Tools Setup");

  const selections: AgentsInitSelections = {};
  
  selections.tools = await checkbox<string>({
    message: "Which tools would you like to configure?",
    choices: AGENT_CHOICES,
    validate: (choices) => {
      if (choices.length === 0) {
        return "Must select at least one tool.";
      }
      return true;
    },
  });

  if (!selections.tools || selections.tools.length === 0) {
    return;
  }

  selections.optimizeForFeatures = await confirm({
    message: "Select Firebase features to optimize for? (Optional - improves performance)",
    default: false,
  });

  const projectPath = config.projectDir;
  const enabledFeatures = getEnabledFeatures(setup.config, selections.optimizeForFeatures);

  utils.logBullet("Configuring selected tools...");

  // Configure each selected tool
  for (const toolName of selections.tools) {
    const tool = AI_TOOLS[toolName];
    if (tool) {
      await tool.configure(config, projectPath, enabledFeatures);
    } else {
      utils.logWarning(`Unknown tool: ${toolName}`);
    }
  }

  utils.logBullet("✓ Configuration complete!");
  utils.logBullet("");
  utils.logBullet("Next steps:");
  if (selections.tools?.includes("cursor") || selections.tools?.includes("gemini")) {
    utils.logBullet("1. Restart your AI tools to load the new configuration");
  }
  if (selections.tools?.includes("studio")) {
    utils.logBullet("1. Refresh your Firebase Studio workspace to load new AI rules");
  }
  utils.logBullet("2. Try asking your AI assistant about your Firebase project structure");
  utils.logBullet("3. AI assistants now understand Firebase CLI commands and debugging");
}

function getEnabledFeatures(config: any, optimize: boolean): string[] {
  if (!optimize) return [];
  
  const features = [];
  if (config.functions) features.push("functions");
  if (config.firestore) features.push("firestore");
  if (config.hosting) features.push("hosting");
  if (config.storage) features.push("storage");
  if (config.database) features.push("database");
  if (config.dataconnect) features.push("dataconnect");
  
  return features;
}