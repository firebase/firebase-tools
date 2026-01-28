import * as fs from "fs";
import * as path from "path";
import * as utils from "../../utils";
import { checkbox, select } from "../../prompt";
import { Setup } from "../index";
import { Config } from "../../config";
import { AI_TOOLS, AIToolChoice, AIToolModule } from "./aitools/index";
import { logger } from "../../logger";

interface AgentsInitSelections {
  tools?: string[];
}

const AGENT_CHOICES: AIToolChoice[] = Object.values(AI_TOOLS).map((tool) => ({
  value: tool.name,
  name: tool.displayName,
  checked: false,
}));

// We'll look for skills relative to where the code is running
// In development: <repo>/skills
// In production: <lib>/skills (we need to make sure this is copied/available)
function getSkillsDir(): string {
  // We are in src/init/features (or lib/init/features)
  // ../../../ maps to the root of the package
  const skillsDir = path.join(__dirname, "../../../skills");
  if (fs.existsSync(skillsDir)) {
    logger.debug(`Found skills directory at ${skillsDir}`);
    return skillsDir;
  }

  return "";
}

async function setupSkills(config: Config) {
  const toolsWithSkills = Object.values(AI_TOOLS).filter((t) => t["getSkillPath"]);

  if (toolsWithSkills.length === 0) {
    utils.logWarning("No tools currently support automatic skill setup.");
    return;
  }

  const choices = toolsWithSkills.map((t) => ({
    name: t.displayName,
    value: t,
  }));

  const selectedTool = await select<AIToolModule>({
    message: "For which platform would you like to set up agent skills?",
    choices,
  });

  if (!selectedTool || !selectedTool.getSkillPath) {
    return;
  }

  const skillPath = selectedTool.getSkillPath(config.projectDir);
  const skillsDir = getSkillsDir();

  if (!skillsDir) {
    utils.logWarning(
      "Could not locate skills definitions. Please update firebase-tools to the latest version.",
    );
    return;
  }

  if (!fs.existsSync(skillPath)) {
    // If the rules directory doesn't exist, we should probably create it or verify the tool is configured
    // For Cursor, it's .cursor/rules, which might not exist yet if they haven't run init aitools
    utils.logBullet(`Creating directory: ${skillPath}`);
    fs.mkdirSync(skillPath, { recursive: true });
  }

  // List all skills
  const skills = fs.readdirSync(skillsDir).filter((f) => {
    const fullPath = path.join(skillsDir, f);
    return fs.statSync(fullPath).isDirectory();
  });

  if (skills.length === 0) {
    utils.logWarning("No skills found.");
    return;
  }

  logger.info();
  logger.info(`Found ${skills.length} skills. Symlinking to ${skillPath}...`);

  for (const skill of skills) {
    const sourcePath = path.join(skillsDir, skill);
    const targetPath = path.join(skillPath, skill);

    try {
      if (fs.existsSync(targetPath)) {
        const stats = fs.lstatSync(targetPath);
        if (stats.isSymbolicLink()) {
          fs.unlinkSync(targetPath);
        } else {
          // It's a real file/directory. Backup? warn?
          // For now, let's warn and skip
          utils.logWarning(`Target ${skill} already exists and is not a symlink. Skipping.`);
          continue;
        }
      }

      fs.symlinkSync(sourcePath, targetPath);
      utils.logSuccess(`Linked skill: ${skill}`);
    } catch (e: any) {
      utils.logWarning(`Failed to link skill ${skill}: ${e.message}`);
    }
  }

  logger.info();
  utils.logSuccess(`Successfully set up agent skills for ${selectedTool.displayName}`);
}

export async function doSetup(setup: Setup, config: Config) {
  logger.info();
  logger.info(
    "This command will configure AI coding assistants to work with your Firebase project by:",
  );
  utils.logBullet("• Setting up the Firebase MCP server for direct Firebase operations");
  utils.logBullet("• Installing agent skills that help AI understand:");
  utils.logBullet("  - Firebase project structure and firebase.json configuration");
  utils.logBullet("  - Common Firebase CLI commands and debugging practices");
  utils.logBullet("  - Product-specific guidance (Functions, Firestore, Hosting, etc.)");
  logger.info();

  logger.info();

  const action = await select<string>({
    message: "What do you like to set up?",
    choices: [
      { name: "MCP Server and Context Files", value: "tools" },
      { name: "Agent Skills", value: "skills" },
    ],
  });

  if (action === "skills") {
    await setupSkills(config);
    return;
  }

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
