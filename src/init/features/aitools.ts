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

/**
 *
 */
export async function doSetup(setup: Setup, config: Config) {
  console.log();
  utils.logLabeledBullet("AI Tools", "🤖 Welcome to Firebase AI Tools Setup!");
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

  const projectPath = config.projectDir;
  const detectedFeatures = getEnabledFeatures(setup.config, true);

  let enabledFeatures: string[] = [];
  if (detectedFeatures.length > 0) {
    const featureList = detectedFeatures.join(", ");
    utils.logLabeledSuccess("Detected", `Firebase features in your project: ${featureList}`);
    console.log();
    selections.optimizeForFeatures = await confirm({
      message: `Optimize AI tools for these features?`,
      default: true,
    });
    enabledFeatures = selections.optimizeForFeatures ? detectedFeatures : [];
  } else {
    selections.optimizeForFeatures = await confirm({
      message: "Select Firebase features to optimize for? (Optional - improves AI assistance quality)",
      default: false,
    });
    enabledFeatures = [];
  }

  console.log();
  utils.logLabeledBullet("Setup", "Configuring your AI tools...");
  console.log();

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
  utils.logLabeledSuccess("Success", "AI tools configuration complete! 🎉");
  console.log();
  
  // Tool-specific next steps
  utils.logLabeledBullet("Next steps", "To start using your enhanced AI assistant:");
  console.log();
  
  if (selections.tools?.includes("gemini")) {
    utils.logBullet("🟣 Gemini CLI:");
    utils.logBullet("   • Restart Gemini to load Firebase context");
    utils.logBullet("   • Try: \"How do I deploy only my functions?\"");
    utils.logBullet("   • Try: \"Show me the Firebase emulator commands\"");
    console.log();
  }
  
  if (selections.tools?.includes("cursor")) {
    utils.logBullet("🟦 Cursor:");
    utils.logBullet("   • Restart Cursor to activate Firebase MCP server");
    utils.logBullet("   • Your AI now knows your project structure");
    utils.logBullet("   • Try: \"Create a new Cloud Function for user authentication\"");
    console.log();
  }
  
  if (selections.tools?.includes("studio")) {
    utils.logBullet("🟨 Firebase Studio:");
    utils.logBullet("   • Refresh your workspace to load AI rules");
    utils.logBullet("   • AI assistance is now Firebase-aware");
    utils.logBullet("   • Try: \"Help me set up Firestore security rules\"");
    console.log();
  }
  
  if (selections.tools?.includes("claude")) {
    utils.logBullet("🟩 Claude Code:");
    utils.logBullet("   • Restart Claude Code to activate MCP server");
    utils.logBullet("   • Look for 'firebase' in your MCP servers list");
    utils.logBullet("   • Claude can now run Firebase CLI commands directly");
    console.log();
  }
  
  if (enabledFeatures.length > 0) {
    utils.logLabeledBullet("Pro tip", `Your AI assistant is now optimized for: ${enabledFeatures.join(", ")}`);
  }
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
