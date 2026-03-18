import * as fs from "fs/promises";
import * as path from "path";
import { spawn, spawnSync } from "child_process";

import { logger } from "../logger";
import * as prompt from "../prompt";
import * as apphosting from "../gcp/apphosting";
import * as utils from "../utils";
import { readTemplate } from "../templates";
import * as track from "../track";
import { apphostingSecretsSetAction } from "../apphosting/secrets";
import * as env from "../functions/env";
import { FirebaseError } from "../error";
import * as os from "os";

export interface MigrateOptions {
  project?: string;
  startAntigravity?: boolean;
}

interface McpServerConfig {
  command: string;
  args: string[];
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

async function setupAntigravityMcpServer(rootPath: string, appType?: AppType): Promise<void> {
  const mcpConfigDir = path.join(os.homedir(), ".gemini", "antigravity");
  const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");

  let mcpConfig: McpConfig = { mcpServers: {} };
  try {
    await fs.mkdir(mcpConfigDir, { recursive: true });
    const content = await fs
      .readFile(mcpConfigPath, "utf-8")
      .catch((err: Error & { code?: string }) => {
        if (err.code === "ENOENT") {
          return null;
        }
        throw err;
      });

    if (content) {
      mcpConfig = JSON.parse(content) as McpConfig;
      if (!mcpConfig.mcpServers) {
        mcpConfig.mcpServers = {};
      }
    }

    let updated = false;

    if (!mcpConfig.mcpServers["firebase"]) {
      if (utils.commandExistsSync("npx")) {
        const confirmFirebase = await prompt.confirm({
          message: "Would you like to enable the Firebase MCP server for Antigravity?",
          default: true,
        });

        if (confirmFirebase) {
          mcpConfig.mcpServers["firebase"] = {
            command: "npx",
            args: ["-y", "firebase-tools@latest", "mcp", "--dir", path.resolve(rootPath)],
          };
          updated = true;
          logger.info(`✅ Configured Firebase MCP server in ${mcpConfigPath}`);
        }
      } else {
        logger.info("ℹ️ npx not found on PATH, skipping Firebase MCP server configuration.");
      }
    } else {
      logger.info("ℹ️ Firebase MCP server already configured in Antigravity, skipping.");
    }

    if (appType === "FLUTTER") {
      if (utils.commandExistsSync("dart")) {
        if (!mcpConfig.mcpServers["dart"]) {
          const confirmDart = await prompt.confirm({
            message: "Would you like to enable the Dart MCP server for Antigravity?",
            default: true,
          });

          if (confirmDart) {
            mcpConfig.mcpServers["dart"] = {
              command: "dart",
              args: ["mcp-server"],
            };
            updated = true;
            logger.info(`✅ Configured Dart MCP server in ${mcpConfigPath}`);
          }
        } else {
          logger.info("ℹ️ Dart MCP server already configured in Antigravity, skipping.");
        }
      } else {
        utils.logWarning(
          "Couldn't find Dart/Flutter on PATH. Install Flutter by following the instruction at https://docs.flutter.dev/install.",
        );
      }
    }

    if (updated) {
      await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    utils.logWarning(`Could not configure Antigravity MCP server: ${message}`);
  }
}

interface Metadata {
  projectId?: string;
  [key: string]: any;
}

type AppType = "NEXT_JS" | "FLUTTER" | "ANGULAR" | "OTHER";

async function detectAppType(rootPath: string): Promise<AppType> {
  // Check for Flutter
  try {
    await fs.access(path.join(rootPath, "pubspec.yaml"));
    return "FLUTTER";
  } catch {
    // Not Flutter
  }

  // Check for Angular
  try {
    await fs.access(path.join(rootPath, "angular.json"));
    return "ANGULAR";
  } catch {
    // Not Angular (directly)
  }

  // Check package.json for Next.js or Angular
  try {
    const packageJsonPath = path.join(rootPath, "package.json");
    const packageJsonContent = await fs.readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonContent);
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps.next) {
      return "NEXT_JS";
    }
    if (deps["@angular/core"]) {
      return "ANGULAR";
    }
  } catch {
    // No package.json or error reading it
  }

  // Check for Next.js config files
  for (const configFile of ["next.config.js", "next.config.mjs"]) {
    try {
      await fs.access(path.join(rootPath, configFile));
      return "NEXT_JS";
    } catch {
      // Not this config file, try the next one.
    }
  }

  return "OTHER";
}

// Based on https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects
const isValidFirebaseProjectId = (projectId: string): boolean => {
  // ^[a-z]         : Starts with a lowercase letter
  // [a-z0-9-]{4,28}: Middle characters (allows hyphens, letters, numbers), makes total length 6-30
  // [a-z0-9]$      : Ends with a lowercase letter or number (no hyphens)
  const projectIdRegex = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

  return projectIdRegex.test(projectId);
};

export async function extractMetadata(
  rootPath: string,
  overrideProjectId?: string,
): Promise<{
  projectId: string | undefined;
  appName: string;
}> {
  // Verify export & Extract Metadata
  const studioJsonPath = path.join(rootPath, "studio.json");
  const metadataPath = path.join(rootPath, "metadata.json");
  let metadata: Metadata = {};
  // Try to read studio.json aka metadata.json. Preference given to studio.json
  for (const metadataFile of [metadataPath, studioJsonPath]) {
    try {
      const metadataContent = await fs.readFile(metadataFile, "utf8");
      metadata = JSON.parse(metadataContent) as Metadata;
      logger.info(`✅ Read ${metadataFile}`);
    } catch (err: unknown) {
      logger.debug(`Could not read metadata at ${metadataFile}: ${err}`);
    }
  }

  logger.debug(`overrideProjectId ${overrideProjectId}`);
  logger.debug(`metadata.projectId ${metadata.projectId}`);
  let projectId = overrideProjectId || metadata.projectId;
  if (!projectId) {
    // try to get project ID from .firebaserc
    try {
      const firebasercContent = await fs.readFile(path.join(rootPath, ".firebaserc"), "utf8");
      const firebaserc = JSON.parse(firebasercContent) as { projects?: { default?: string } };
      projectId = firebaserc.projects?.default;
    } catch (err: unknown) {
      logger.debug(`Could not read .firebaserc at ${rootPath}: ${err}`);
    }
  }

  if (projectId) {
    if (!isValidFirebaseProjectId(projectId)) {
      throw new FirebaseError(`Invalid project ID: ${projectId}.`, {
        exit: 1,
      });
    }
    logger.info(`✅ Using Firebase Project: ${projectId}`);
  } else {
    logger.debug(
      `❌ Failed to determine the Firebase Project ID. You can set a project later by setting the '--project' flag.`,
    );
  }

  // Extract App Name
  let appName = "firebase-studio-export";
  const blueprintPath = path.join(rootPath, "docs", "blueprint.md");
  try {
    const content = await fs.readFile(blueprintPath, "utf8");
    const nameMatch = content.match(/# \*\*App Name\*\*: (.*)/);
    if (nameMatch && nameMatch[1]) {
      appName = nameMatch[1].trim();
    }
  } catch (err: unknown) {
    logger.debug(`Could not read blueprint.md at ${blueprintPath}: ${err}`);
  }

  if (appName !== "firebase-studio-export") {
    logger.info(`✅ Detected App Name: ${appName}`);
  }

  return { projectId, appName };
}

async function updateReadme(rootPath: string, framework: AppType): Promise<void> {
  // Update README.md
  const readmePath = path.join(rootPath, "README.md");
  const readmeTemplate = await readTemplate("firebase-studio-export/readme_template.md");

  const frameworkConfigs: Record<AppType, { startCommand: string; localUrl: string }> = {
    NEXT_JS: { startCommand: "npm run dev", localUrl: "http://localhost:9002" },
    ANGULAR: { startCommand: "npm run start", localUrl: "http://localhost:4200" },
    FLUTTER: {
      startCommand: "flutter run -d chrome --web-port=8080",
      localUrl: "http://localhost:8080",
    },
    OTHER: { startCommand: "npm run dev", localUrl: "http://localhost:9002" },
  };

  const { startCommand, localUrl } = frameworkConfigs[framework];

  let existingReadme = "";
  try {
    existingReadme = await fs.readFile(readmePath, "utf8");
  } catch (err: unknown) {
    // If README.md doesn't exist, just continue with an empty string
  }

  let newReadme = readmeTemplate
    .replace("${exportDate}", new Date().toISOString().split("T")[0]) // YYYY-MM-DD format
    .replace("${startCommand}", startCommand)
    .replace("${localUrl}", localUrl);

  if (existingReadme.trim()) {
    newReadme += `\n\n---\n\n## Previous README.md contents:\n\n${existingReadme}`;
  }

  await fs.writeFile(readmePath, newReadme);
  logger.info("✅ Updated README.md with project details and origin info");
}

async function injectAntigravityContext(
  rootPath: string,
  projectId: string | undefined,
  appName: string,
): Promise<void> {
  const agentDir = path.join(rootPath, ".agents");
  const rulesDir = path.join(agentDir, "rules");
  const workflowsDir = path.join(agentDir, "workflows");
  const skillsDir = path.join(agentDir, "skills");

  await fs.mkdir(rulesDir, { recursive: true });
  await fs.mkdir(workflowsDir, { recursive: true });
  await fs.mkdir(skillsDir, { recursive: true });

  // Add Skills using npx
  logger.info("⏳ Adding Antigravity skills...");
  try {
    const result = spawnSync(
      "npx",
      // gemini-CLI is chosen as a workaround for the .agents subfolder (instead of .agent)
      // which is current for antigravity's location from vercel.
      ["-y", "skills", "add", "firebase/agent-skills", "-a", "gemini-cli", "--skill", "*", "-y"],
      {
        cwd: rootPath,
        stdio: "ignore",
        shell: process.platform === "win32",
      },
    );
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`npx skills add exited with code ${result.status}`);
    }
    logger.info(`✅ Added Antigravity skills`);
  } catch (err: unknown) {
    utils.logWarning(`Could not add Antigravity skills, skipping. ${err}`);
  }

  // System Instructions
  const systemInstructionsTemplate = await readTemplate(
    "firebase-studio-export/system_instructions_template.md",
  );
  const systemInstructions = systemInstructionsTemplate.replace("${appName}", appName);

  await fs.writeFile(path.join(rulesDir, "migration-context.md"), systemInstructions);
  logger.info("✅ Injected Antigravity rules");

  // Cleanup Workflow
  try {
    const cleanupWorkflow = await readTemplate("firebase-studio-export/workflows/cleanup.md");
    await fs.writeFile(path.join(workflowsDir, "cleanup.md"), cleanupWorkflow);
    logger.info("✅ Created Antigravity startup workflow");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Could not read or write startup workflow: ${message}`);
  }
}

async function getAgyCommand(startAgy?: boolean): Promise<string | undefined> {
  // Assertion: Check for Antigravity (agy or antigravity)
  // If we're not starting the IDE, skip the check.
  if (!startAgy) {
    return undefined;
  }

  const commands = ["agy", "antigravity"];
  for (const cmd of commands) {
    if (utils.commandExistsSync(cmd)) {
      logger.info(`✅ Antigravity IDE detected`);
      return cmd;
    }
  }

  // Check common macOS install location
  if (process.platform === "darwin") {
    const macPath = "/Applications/Antigravity.app/Contents/Resources/app/bin/agy";
    try {
      await fs.access(macPath);
      logger.info(`✅ Antigravity IDE detected at ${macPath}`);
      return macPath;
    } catch {
      // Not found in Applications
    }
  }

  // Check common Windows install location
  if (process.platform === "win32") {
    const winPath = path.join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "Antigravity",
      "bin",
      "agy.exe",
    );
    try {
      await fs.access(winPath);
      logger.info(`✅ Antigravity IDE CLI detected at ${winPath}`);
      return winPath;
    } catch {
      // Not found in LocalAppData
    }
  }

  const downloadLink = "https://antigravity.google/download";
  logger.info(
    `⚠️ Antigravity IDE not found in your PATH. To ensure a seamless migration, please download and install Antigravity: ${downloadLink}`,
  );
  return undefined;
}

async function createFirebaseConfigs(
  rootPath: string,
  projectId: string | undefined,
): Promise<void> {
  if (!projectId) {
    return;
  }
  const firebaserc = {
    projects: {
      default: projectId,
    },
  };
  await fs.writeFile(path.join(rootPath, ".firebaserc"), JSON.stringify(firebaserc, null, 2));
  logger.info("✅ Created .firebaserc");

  // firebase.json (App Hosting)
  const firebaseJsonPath = path.join(rootPath, "firebase.json");
  try {
    await fs.access(firebaseJsonPath);
    logger.info("ℹ️ firebase.json already exists, skipping creation.");
  } catch {
    let backendId = "studio"; // Default
    try {
      logger.info(`⏳ Fetching App Hosting backends for project ${projectId}...`);
      const backendsData = await apphosting.listBackends(projectId, "-");
      const backends = backendsData.backends || [];

      if (backends.length > 0) {
        const backendIds = backends.map((b) => b.name.split("/").pop()!);
        const studioBackend = backends.find(
          (b) => b.name.endsWith("/studio") || b.name.toLowerCase().includes("studio"),
        );

        let selectedBackendId = "";
        if (studioBackend) {
          selectedBackendId = studioBackend.name.split("/").pop()!;
        } else {
          selectedBackendId = backendIds[0];
        }

        const confirmBackend = await prompt.confirm({
          message: `Would you like to use the App Hosting backend "${selectedBackendId}"?`,
          default: true,
          nonInteractive: process.env.NODE_ENV === "test",
        });

        if (confirmBackend) {
          backendId = selectedBackendId;
        } else {
          logger.info("Available App Hosting backends:");
          for (const id of backendIds) {
            logger.info(`  - ${id}`);
          }

          const inputBackendId = await prompt.input({
            message: "Please enter the name of the backend you would like to use:",
          });

          if (!backendIds.includes(inputBackendId)) {
            throw new FirebaseError(`Invalid backend selected: ${inputBackendId}`, { exit: 1 });
          }
          backendId = inputBackendId;
        }

        logger.info(`✅ Selected App Hosting backend: ${backendId}`);
      } else {
        utils.logWarning('No App Hosting backends found, using default "studio"');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      utils.logWarning(
        `Could not fetch backends from Firebase CLI, using default "studio". ${message}`,
      );
    }

    const firebaseJson = {
      apphosting: {
        backendId: backendId,
        ignore: [
          "node_modules",
          ".git",
          ".agents",
          ".idx",
          "firebase-debug.log",
          "firebase-debug.*.log",
          "functions",
        ],
      },
    };
    await fs.writeFile(firebaseJsonPath, JSON.stringify(firebaseJson, null, 2));
    logger.info(`✅ Created firebase.json with backendId: ${backendId}`);
  }
}

async function writeAntigravityConfigs(rootPath: string, framework: AppType): Promise<void> {
  // 5. IDE Configs (VS Code / AGY)
  const vscodeDir = path.join(rootPath, ".vscode");
  await fs.mkdir(vscodeDir, { recursive: true });

  // Create tasks.json for pre-launch tasks
  const tasksJson: any = {
    version: "2.0.0",
    tasks: [],
  };

  if (framework === "FLUTTER") {
    tasksJson.tasks.push({
      label: "flutter-pub-get",
      type: "shell",
      command: "flutter pub get",
      problemMatcher: [],
      group: {
        kind: "build",
        isDefault: true,
      },
    });
  } else {
    tasksJson.tasks.push({
      label: "npm-install",
      type: "shell",
      command: "npm install",
      problemMatcher: [],
    });
  }

  await fs.writeFile(path.join(vscodeDir, "tasks.json"), JSON.stringify(tasksJson, null, 2));
  logger.info("✅ Created .vscode/tasks.json");

  // Clean and set preferences in .vscode/settings.json
  const settingsPath = path.join(vscodeDir, "settings.json");
  let settings: Record<string, any> = {};
  try {
    const settingsContent = await fs.readFile(settingsPath, "utf8");
    settings = JSON.parse(settingsContent) as Record<string, any>;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Could not read ${settingsPath}: ${message}`);
  }

  const cleanSettings: Record<string, any> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!key.startsWith("IDX.")) {
      cleanSettings[key] = value;
    }
  }

  // Add Antigravity/VSCode startup preference
  cleanSettings["workbench.startupEditor"] = "readme";

  await fs.writeFile(settingsPath, JSON.stringify(cleanSettings, null, 2));
  logger.info("✅ Updated .vscode/settings.json with startup preferences");

  const launchJson: any = {
    version: "0.2.0",
    configurations: [],
  };

  if (framework === "ANGULAR") {
    launchJson.configurations.push({
      type: "node",
      request: "launch",
      name: "Angular: debug server-side",
      runtimeExecutable: "npm",
      runtimeArgs: ["run", "start"],
      port: 4200,
      console: "integratedTerminal",
      preLaunchTask: "npm-install",
    });
  } else if (framework === "NEXT_JS") {
    launchJson.configurations.push({
      type: "node",
      request: "launch",
      name: "Next.js: debug server-side",
      runtimeExecutable: "npm",
      runtimeArgs: ["run", "dev"],
      port: 9002,
      console: "integratedTerminal",
      preLaunchTask: "npm-install",
    });
  } else if (framework === "FLUTTER") {
    launchJson.configurations.push({
      name: "Flutter",
      request: "launch",
      type: "dart",
      preLaunchTask: "flutter-pub-get",
    });
  } else {
    return;
  }

  await fs.writeFile(path.join(vscodeDir, "launch.json"), JSON.stringify(launchJson, null, 2));
  logger.info("✅ Created .vscode/launch.json");
}

async function cleanupUnusedFiles(rootPath: string): Promise<void> {
  // Remove the empty docs directory
  const docsDir = path.join(rootPath, "docs");

  try {
    const files = await fs.readdir(docsDir);
    if (files.length === 0) {
      await fs.rmdir(docsDir);
      logger.info("✅ Removed empty docs directory");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Could not remove ${docsDir}: ${message}`);
  }

  const modifiedPath = path.join(rootPath, ".modified");
  try {
    await fs.unlink(modifiedPath);
    logger.info("✅ Cleaned up .modified");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Could not delete ${modifiedPath}: ${message}`);
  }

  const mcpJsonPath = path.join(rootPath, ".idx", "mcp.json");
  try {
    await fs.unlink(mcpJsonPath);
    logger.info("✅ Cleaned up .idx/mcp.json");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Could not delete ${mcpJsonPath}: ${message}`);
  }
}

/**
 * Upgrades Genkit related dependencies to 1.29 in package.json.
 */
async function upgradeGenkitVersion(rootPath: string): Promise<void> {
  const packageJsonPath = path.join(rootPath, "package.json");
  try {
    const packageJsonContent = await fs.readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonContent) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    let modified = false;

    const upgradeDeps = (deps: Record<string, string> | undefined): void => {
      if (!deps) {
        return;
      }
      for (const [name, version] of Object.entries(deps)) {
        if (name === "genkit" || name === "genkit-cli" || name.startsWith("@genkit-ai/")) {
          if (version !== "1.29") {
            deps[name] = "1.29";
            modified = true;
          }
        }
      }
    };

    upgradeDeps(packageJson.dependencies);
    upgradeDeps(packageJson.devDependencies);

    if (modified) {
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
      logger.info("✅ Upgraded Genkit version to 1.29 in package.json");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Could not upgrade Genkit version: ${message}`);
  }
}

export async function uploadSecrets(
  rootPath: string,
  projectId: string | undefined,
): Promise<void> {
  if (!projectId) {
    return;
  }

  const envPath = path.join(rootPath, ".env");
  try {
    await fs.access(envPath);
  } catch {
    // .env does not exist
    return;
  }

  try {
    const envContent = await fs.readFile(envPath, "utf8");
    const parsedEnv = env.parse(envContent);
    const geminiApiKey = parsedEnv.envs["GEMINI_API_KEY"];

    if (geminiApiKey && geminiApiKey.trim().length > 0) {
      logger.info("⏳ Uploading GEMINI_API_KEY from .env to App Hosting secrets...");
      await apphostingSecretsSetAction(
        "GEMINI_API_KEY",
        projectId,
        undefined, // projectNumber
        undefined, // location
        envPath,
        true, // nonInteractive
      );
      logger.info("✅ Uploaded GEMINI_API_KEY secret");
    } else {
      logger.debug("Skipping GEMINI_API_KEY upload: key is missing or blank in .env");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    utils.logWarning(`Failed to upload GEMINI_API_KEY secret: ${message}`);
  }
}

async function askToOpenAntigravity(
  rootPath: string,
  appName: string,
  startAntigravity?: boolean,
): Promise<void> {
  const agyCommand = await getAgyCommand(startAntigravity);

  logger.info(`\n🎉 Your Firebase Studio project "${appName}" is now ready for Antigravity!`);
  logger.info(
    "Antigravity is Google's agentic IDE, where you can collaborate with AI agents to build, test, and deploy your application.",
  );
  logger.info("\nWhat to do next inside Antigravity:");
  logger.info(
    "  1.  Review the README.md: It has been updated with specifics about this migrated project.",
  );
  logger.info(
    "  2.  Open the Agent Chat: Use the side panel or press Cmd+L (Ctrl+L on Windows/Linux). This is your main interface with the AI.",
  );

  logger.info("\nFile any bugs at https://github.com/firebase/firebase-tools/issues");

  if (!startAntigravity || !agyCommand) {
    return;
  }

  const answer = await prompt.confirm({
    message: "Would you like to open it in Antigravity now?",
    default: true,
  });

  if (answer) {
    logger.info(`⏳ Opening ${appName} in Antigravity...`);
    try {
      const antigravityProcess = spawn(agyCommand, ["."], {
        cwd: rootPath,
        stdio: "ignore",
        detached: true,
        shell: process.platform === "win32",
      });
      antigravityProcess.unref();
    } catch (err: unknown) {
      utils.logWarning("Could not open Antigravity IDE automatically. Please open it manually.");
    }
  }
}

async function checkDirectoryExists(dir: string): Promise<void> {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      throw new FirebaseError(`The path ${dir} is not a directory.`, { exit: 1 });
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new FirebaseError(`The directory ${dir} does not exist.`, { exit: 1 });
    }
    throw err;
  }
}

export async function migrate(
  rootPath: string,
  options: MigrateOptions = { startAntigravity: true },
): Promise<void> {
  await checkDirectoryExists(rootPath);
  const appType: AppType = await detectAppType(rootPath);
  void track.trackGA4("firebase_studio_migrate", { app_type: appType, result: "started" });

  logger.info("🚀 Starting Firebase Studio to Antigravity migration...");

  const { projectId, appName } = await extractMetadata(rootPath, options.project);

  if (appType) {
    logger.info(`✅ Detected framework: ${appType}`);
  }

  await updateReadme(rootPath, appType);
  await createFirebaseConfigs(rootPath, projectId);
  await uploadSecrets(rootPath, projectId);
  await upgradeGenkitVersion(rootPath);
  await injectAntigravityContext(rootPath, projectId, appName);
  await writeAntigravityConfigs(rootPath, appType);
  await setupAntigravityMcpServer(rootPath, appType);
  await cleanupUnusedFiles(rootPath);

  // Suggest renaming if we are in the 'download' folder
  const currentFolderName = path.basename(rootPath);
  if (currentFolderName === "download") {
    logger.info(
      `\n💡 Tip: You may want to rename this folder to "${appName.toLowerCase().replace(/\s+/g, "-")}"`,
    );
  }

  await track.trackGA4("firebase_studio_migrate", { app_type: appType, result: "success" });
  await askToOpenAntigravity(rootPath, appName, options.startAntigravity);
}
