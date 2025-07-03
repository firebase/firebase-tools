import * as utils from "../../utils";
import { checkbox, confirm } from "../../prompt";
import { Setup } from "../index";
import { Config } from "../../config";
import { AI_TOOLS, AIToolChoice } from "./aitools/index";

interface AgentsInitSelections {
  tools?: string[];
  optimizeForFeatures?: boolean;
}

const AGENT_CHOICES: AIToolChoice[] = Object.values(AI_TOOLS).map((tool) => ({
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

  const projectPath = config.projectDir;
  const detectedFeatures = getEnabledFeatures(setup.config, true);
  
  let enabledFeatures: string[] = [];
  if (detectedFeatures.length > 0) {
    const featureList = detectedFeatures.join(", ");
    selections.optimizeForFeatures = await confirm({
      message: `Optimize for detected Firebase features (${featureList})?`,
      default: true,
    });
    enabledFeatures = selections.optimizeForFeatures ? detectedFeatures : [];
  } else {
    selections.optimizeForFeatures = await confirm({
      message: "Select Firebase features to optimize for? (Optional - improves performance)",
      default: false,
    });
    enabledFeatures = [];
  }

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
  // Only support features we have prompts for
  if (config.functions) features.push("functions");
  
  // Future: Add these when we have corresponding prompt files
  // if (config.firestore && hasPromptFile("FIREBASE_FIRESTORE.md")) features.push("firestore");
  // if (config.hosting && hasPromptFile("FIREBASE_HOSTING.md")) features.push("hosting");
  // if (config.storage && hasPromptFile("FIREBASE_STORAGE.md")) features.push("storage");
  // if (config.database && hasPromptFile("FIREBASE_DATABASE.md")) features.push("database");
  // if (config.dataconnect && hasPromptFile("FIREBASE_DATACONNECT.md")) features.push("dataconnect");

  return features;
}
