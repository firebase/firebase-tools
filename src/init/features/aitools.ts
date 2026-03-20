import * as utils from "../../utils";
import { checkbox } from "../../prompt";
import { Setup } from "../index";
import { Config } from "../../config";
import { AI_TOOLS, AIToolChoice } from "./aitools/index";
import { logger } from "../../logger";

interface AgentsInitSelections {
  tools?: string[];
}

const AGENT_CHOICES: AIToolChoice[] = Object.values(AI_TOOLS).map((tool) => ({
  value: tool.name,
  name: tool.displayName,
  checked: false,
}));

export async function doSetup(setup: Setup, config: Config) {
  logger.info();
  logger.info(
    "This command will configure AI coding assistants to work with your Firebase project by:",
  );
  utils.logBullet("• Setting up the Firebase MCP server for direct Firebase operations");
  utils.logBullet("• Installing context files that help AI understand:");
  utils.logBullet("  - Firebase project structure and firebase.json configuration");
  utils.logBullet("  - Common Firebase CLI commands and debugging practices");
  utils.logBullet("  - Product-specific guidance (Functions, Firestore, Hosting, etc.)");
  logger.info();

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

  logger.info();
  logger.info("Configuring selected tools...");

  const projectPath = config.projectDir;
  const enabledFeatures = getEnabledFeatures(setup.config);

  // Configure each selected tool
  let anyUpdates = false;

  for (const toolName of selections.tools) {
    const tool = AI_TOOLS[toolName];
    if (!tool) {
      utils.logWarning(`Unknown tool: ${toolName}`);
      continue;
    }

    const result = await tool.configure(config, projectPath, enabledFeatures);

    // Count updated files
    const updatedCount = result.files.filter((f) => f.updated).length;
    const hasChanges = updatedCount > 0;

    if (hasChanges) {
      anyUpdates = true;
      logger.info();
      utils.logSuccess(
        `${tool.displayName} configured - ${updatedCount} file${updatedCount > 1 ? "s" : ""} updated:`,
      );
    } else {
      logger.info();
      utils.logBullet(`${tool.displayName} - all files up to date`);
    }

    // Always show the file list
    for (const file of result.files) {
      const status = file.updated ? "(updated)" : "(unchanged)";
      utils.logBullet(`  ${file.path} ${status}`);
    }
  }

  logger.info();

  if (anyUpdates) {
    utils.logSuccess("AI tools configuration complete!");
    logger.info();
    logger.info("Next steps:");
    utils.logBullet("Restart your AI tools to load the new configuration");
    utils.logBullet("Try asking your AI assistant about your Firebase project structure");
    utils.logBullet("AI assistants now understand Firebase CLI commands and debugging");
  } else {
    utils.logSuccess("All AI tools are already up to date.");
  }
}

function getEnabledFeatures(config: any): string[] {
  const features = [];
  if (config.functions) features.push("functions");

  // Future: Add these when we have corresponding prompt files
  // if (config.firestore)) features.push("firestore");
  // if (config.hosting)) features.push("hosting");
  // if (config.storage)) features.push("storage");
  // if (config.database)) features.push("database");
  // if (config.dataconnect)) features.push("dataconnect");

  return features;
}
