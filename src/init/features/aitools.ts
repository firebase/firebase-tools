import * as utils from "../../utils";
import { checkbox, confirm } from "../../prompt";
import { Setup } from "../index";
import { Config } from "../../config";
import { AI_TOOLS, AIToolChoice } from "./aitools/index";

interface AgentsInitSelections {
  tools?: string[];
  includeFeatures?: boolean;
}

const AGENT_CHOICES: AIToolChoice[] = Object.values(AI_TOOLS).map((tool) => ({
  value: tool.name,
  name: tool.displayName,
  checked: false,
}));

/**
 *
 */
export async function doSetup(setup: Setup, config: Config) {
  console.log();
  console.log("This command will configure AI coding assistants to work with your Firebase project by:");
  utils.logBullet("• Setting up the Firebase MCP server for direct Firebase operations");
  utils.logBullet("• Installing context files that help AI understand:");
  utils.logBullet("  - Firebase project structure and firebase.json configuration");
  utils.logBullet("  - Common Firebase CLI commands and debugging practices");
  utils.logBullet("  - Product-specific guidance (Functions, Firestore, Hosting, etc.)");
  console.log();

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

  console.log();
  console.log("Configuring selected tools...");
  console.log();

  const projectPath = config.projectDir;
  const detectedFeatures = getEnabledFeatures(setup.config, true);
  const enabledFeatures = detectedFeatures;

  // Configure each selected tool
  for (const toolName of selections.tools) {
    const tool = AI_TOOLS[toolName];
    if (tool) {
      await tool.configure(config, projectPath, enabledFeatures);
    } else {
      utils.logWarning(`Unknown tool: ${toolName}`);
    }
  }

  console.log();
  utils.logSuccess("✓ Configuration complete!");
  console.log();
  console.log("Next steps:");
  utils.logBullet("1. Restart your AI tools to load the new configuration");
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