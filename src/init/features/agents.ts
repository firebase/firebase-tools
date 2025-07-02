import * as clc from "colorette";
import * as path from "path";
import * as utils from "../../utils";
import { checkbox, confirm } from "../../prompt";
import { Setup } from "../index";
import { Config } from "../../config";
import * as fs from "fs";
import { readTemplateSync } from "../../templates";

interface AgentsInitSelections {
  tools?: string[];
  optimizeForFeatures?: boolean;
}

const AGENT_CHOICES = [
  {
    value: "cursor",
    name: "Cursor (MCP server + .cursor/rules/firebase.mdc)",
    checked: false,
  },
  {
    value: "gemini",
    name: "Gemini CLI (extension + combined context file)",
    checked: false,
  },
  {
    value: "studio",
    name: "Firebase Studio (.idx/airules.md)",
    checked: false,
  },
];

export async function doSetup(setup: Setup, config: Config) {
  utils.logBullet("🔥 Welcome to Firebase AI Agents Setup");

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

  for (const tool of selections.tools) {
    await configureTool(tool, config, projectPath, enabledFeatures);
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

async function configureTool(
  tool: string,
  config: Config,
  projectPath: string,
  enabledFeatures: string[]
): Promise<void> {
  switch (tool) {
    case "cursor":
      await configureCursor(config, projectPath, enabledFeatures);
      break;
    case "gemini":
      await configureGemini(config, projectPath, enabledFeatures);
      break;
    case "studio":
      await configureStudio(config, projectPath, enabledFeatures);
      break;
    default:
      utils.logWarning(`Unknown tool: ${tool}`);
  }
}

async function configureCursor(
  config: Config,
  projectPath: string,
  enabledFeatures: string[]
): Promise<void> {
  // Create MCP configuration from template
  const mcpTemplate = readTemplateSync("init/agents/cursor-mcp.json");
  const mcpConfig = mcpTemplate.replace("{{PROJECT_PATH}}", projectPath);

  // Write MCP config to .cursor/mcp.json
  config.writeProjectFile(".cursor/mcp.json", mcpConfig);

  // Write Firebase context file
  const firebaseContext = generateFirebaseContext(enabledFeatures, "cursor");
  config.writeProjectFile(".cursor/rules/firebase.mdc", firebaseContext);

  utils.logBullet(`✓ Cursor configuration written to:`);
  utils.logBullet(`  - .cursor/mcp.json (MCP server config)`);
  utils.logBullet(`  - .cursor/rules/firebase.mdc (AI context)`);
}

async function configureGemini(
  config: Config,
  projectPath: string,
  enabledFeatures: string[]
): Promise<void> {
  // Create extension configuration from template
  const extensionTemplate = readTemplateSync("init/agents/gemini-extension.json");
  const extensionConfig = extensionTemplate.replace("{{PROJECT_PATH}}", projectPath);

  // Write extension config
  config.writeProjectFile(
    ".gemini/extensions/firebase/gemini-extension.json",
    extensionConfig
  );

  // Write combined context file
  const geminiContext = generateFirebaseContext(enabledFeatures, "gemini");
  config.writeProjectFile(".gemini/extensions/firebase/GEMINI.md", geminiContext);

  utils.logBullet(`✓ Gemini CLI extension created at:`);
  utils.logBullet(`  - .gemini/extensions/firebase/`);
  utils.logBullet(`  - Context includes: FIREBASE.md + FIREBASE_FUNCTIONS.md`);
}

async function configureStudio(
  config: Config,
  projectPath: string,
  enabledFeatures: string[]
): Promise<void> {
  // Write Firebase AI rules file
  const studioContext = generateFirebaseContext(enabledFeatures, "studio");
  config.writeProjectFile(".idx/airules.md", studioContext);

  utils.logBullet(`✓ Firebase Studio configuration written to:`);
  utils.logBullet(`  - .idx/airules.md (AI rules)`);
  utils.logBullet(`  - Refresh your Firebase Studio workspace to load new rules`);
}

function generateFirebaseContext(enabledFeatures: string[], tool: string): string {
  // Read base Firebase context from prompts directory
  const promptsDir = path.join(__dirname, "../../../prompts");
  let context = fs.readFileSync(path.join(promptsDir, "FIREBASE.md"), "utf8");

  // Add product-specific contexts based on enabled features
  if (enabledFeatures.includes("functions")) {
    const functionsContext = fs.readFileSync(path.join(promptsDir, "FIREBASE_FUNCTIONS.md"), "utf8");
    if (tool === "cursor") {
      // For Cursor, reference the separate file
      context += "\n\n@file ./FIREBASE_FUNCTIONS.md";
    } else {
      // For Gemini, append the content
      context += "\n\n# Firebase Functions Context\n\n" + functionsContext;
    }
  }

  // Add headers based on tool type
  if (tool === "cursor") {
    const header = readTemplateSync("init/agents/cursor-rules-header.txt");
    context = header + "\n\n" + context;
  } else if (tool === "studio") {
    const header = readTemplateSync("init/agents/studio-airules-header.md");
    // For Studio, integrate the Firebase context into the project context section
    const studioContent = header + "\n\nThis is a Firebase project with the following structure and conventions:\n\n" + context;
    
    // Add Functions-specific guidance if enabled
    if (enabledFeatures.includes("functions")) {
      const functionsContext = fs.readFileSync(path.join(promptsDir, "FIREBASE_FUNCTIONS.md"), "utf8");
      return studioContent + "\n\n## Firebase Functions Guidelines\n\n" + functionsContext;
    }
    
    return studioContent;
  }

  return context;
}