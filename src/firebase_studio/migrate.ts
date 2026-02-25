import * as fs from "fs/promises";
import * as path from "path";
import { execSync, spawn } from "child_process";

import { logger } from "../logger";
import { FirebaseError } from "../error";
import * as prompt from "../prompt";
import * as apphosting from "../gcp/apphosting";
import * as utils from "../utils";
import { readTemplate } from "../templates";

export interface MigrateOptions {
  noStartAgy: boolean;
}

interface GitHubItem {
  name: string;
  type: "dir" | "file";
  url: string;
  download_url: string;
}

interface Metadata {
  projectId?: string;
  [key: string]: any;
}

// TODO revisit quota limits
async function downloadGitHubDir(apiUrl: string, localPath: string): Promise<void> {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch directory listing: ${apiUrl}`);
  }
  const items = (await response.json()) as GitHubItem[];

  await fs.mkdir(localPath, { recursive: true });

  for (const item of items) {
    const itemLocalPath = path.join(localPath, item.name);
    if (item.type === "dir") {
      await downloadGitHubDir(item.url, itemLocalPath);
    } else if (item.type === "file") {
      const fileResponse = await fetch(item.download_url);
      if (fileResponse.ok) {
        const content = await fileResponse.arrayBuffer();
        await fs.writeFile(itemLocalPath, Buffer.from(content));
      }
    }
  }
}

async function extractMetadata(rootPath: string): Promise<{
  projectId: string | undefined;
  appName: string;
  blueprintContent: string;
}> {
  // Verify export & Extract Metadata
  const metadataPath = path.join(rootPath, "metadata.json");
  let metadata: Metadata = {};
  try {
    const metadataContent = await fs.readFile(metadataPath, "utf8");
    metadata = JSON.parse(metadataContent) as Metadata;
  } catch (err: unknown) {
    logger.debug(`Could not read metadata.json at ${metadataPath}: ${err}`);
  }

  let projectId = metadata.projectId;
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
    logger.info(`✅ Detected Firebase Project: ${projectId}`);
  } else {
    // TODO need a mitigation here
    logger.info(`✅ Failed to determine the Firebase Project ID`);
  }

  // Extract App Name and Blueprint Content
  let appName = "firebase-studio-export";
  let blueprintContent = "";
  const blueprintPath = path.join(rootPath, "docs", "blueprint.md");
  try {
    blueprintContent = await fs.readFile(blueprintPath, "utf8");
    const nameMatch = blueprintContent.match(/# \*\*App Name\*\*: (.*)/);
    if (nameMatch && nameMatch[1]) {
      appName = nameMatch[1].trim();
    }
  } catch (err: unknown) {
    logger.debug(`Could not read blueprint.md at ${blueprintPath}: ${err}`);
  }

  if (appName !== "firebase-studio-export") {
    logger.info(`✅ Detected App Name: ${appName}`);
  }

  return { projectId, appName, blueprintContent };
}

async function updateReadme(
  rootPath: string,
  blueprintContent: string,
  appName: string,
): Promise<void> {
  // Update README.md
  const readmePath = path.join(rootPath, "README.md");
  const readmeTemplate = await readTemplate("firebase-studio-export/readme_template.md");
  const newReadme = readmeTemplate
    .replace(/\${appName}/g, appName)
    .replace("${exportDate}", new Date().toISOString().split("T")[0]) // YYYY-MM-DD format
    .replace("${blueprintContent}", blueprintContent.replace(/# \*\*App Name\*\*: .*/, "").trim());

  await fs.writeFile(readmePath, newReadme);
  logger.info("✅ Updated README.md with project details and origin info");
}

async function injectAgyContext(
  rootPath: string,
  projectId: string | undefined,
  appName: string,
): Promise<void> {
  const agentDir = path.join(rootPath, ".agent");
  const rulesDir = path.join(agentDir, "rules");
  const workflowsDir = path.join(agentDir, "workflows");
  const skillsDir = path.join(agentDir, "skills");

  await fs.mkdir(rulesDir, { recursive: true });
  await fs.mkdir(workflowsDir, { recursive: true });
  await fs.mkdir(skillsDir, { recursive: true });

  // Download Skills from GitHub
  logger.info("⏳ Fetching AGY skills from firebase/agent-skills...");
  try {
    const skillsResponse = await fetch(
      "https://api.github.com/repos/firebase/agent-skills/contents/skills",
    );
    if (!skillsResponse.ok) {
      throw new Error(`GitHub API returned ${skillsResponse.status}`);
    }
    const skillsData = (await skillsResponse.json()) as GitHubItem[];

    if (Array.isArray(skillsData)) {
      for (const item of skillsData) {
        if (item.type === "dir") {
          const skillName = item.name;
          const skillDir = path.join(skillsDir, skillName);

          await downloadGitHubDir(item.url, skillDir);
        }
      }
    } else {
      utils.logWarning("GitHub API response for skills is not an array.");
    }
    logger.info(`✅ Downloaded Firebase skills`);
  } catch (err: unknown) {
    utils.logWarning(`Could not download AGY skills, skipping. ${err}`);
  }

  // Download Genkit skill
  logger.info("⏳ Fetching Genkit skill...");
  try {
    const genkitSkillDir = path.join(skillsDir, "developing-genkit-js");
    await downloadGitHubDir(
      "https://api.github.com/repos/genkit-ai/skills/contents/skills/developing-genkit-js?ref=main",
      genkitSkillDir,
    );
    logger.info(`✅ Downloaded Genkit skill`);
  } catch (err: unknown) {
    utils.logWarning(`Could not download Genkit skill, skipping. ${err}`);
  }

  // System Instructions
  const systemInstructionsTemplate = await readTemplate(
    "firebase-studio-export/system_instructions_template.md",
  );
  const systemInstructions = systemInstructionsTemplate
    .replace("${projectId}", projectId || "None")
    .replace("${appName}", appName);

  await fs.writeFile(path.join(rulesDir, "migration-context.md"), systemInstructions);
  logger.info("✅ Injected AGY rules");

  // Startup Workflow
  try {
    const startupWorkflow = await readTemplate(
      "firebase-studio-export/workflows/startup_workflow.md",
    );
    await fs.writeFile(path.join(workflowsDir, "startup.md"), startupWorkflow);
    logger.info("✅ Created AGY startup workflow");
  } catch (err: unknown) {
    logger.debug(`Could not read or write startup workflow: ${err}`);
  }
}

async function assertSystemState(): Promise<void> {
  // Assertion: Check for Antigravity (agy)
  try {
    execSync("agy --version", { stdio: "ignore" });
    logger.info("✅ Antigravity IDE CLI (agy) detected");
  } catch (err: unknown) {
    const downloadLink = "https://antigravity.google/download";
    throw new FirebaseError(
      `Antigravity IDE CLI (agy) not found in your PATH. To ensure a seamless migration, please download and install Antigravity: ${downloadLink}`,
      { exit: 1 },
    );
  }
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
        const studioBackend = backends.find(
          (b) => b.name.endsWith("/studio") || b.name.toLowerCase().includes("studio"),
        );
        if (studioBackend) {
          backendId = studioBackend.name.split("/").pop()!;
        } else {
          backendId = backends[0].name.split("/").pop()!;
        }
        logger.info(`✅ Selected App Hosting backend: ${backendId}`);
      } else {
        utils.logWarning('No App Hosting backends found, using default "studio"');
      }
    } catch (err: unknown) {
      utils.logWarning(
        `Could not fetch backends from Firebase CLI, using default "studio". ${err}`,
      );
    }

    const firebaseJson = {
      apphosting: {
        backendId: backendId,
        ignore: [
          "node_modules",
          ".git",
          ".agent",
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

async function writeAgyConfigs(rootPath: string): Promise<void> {
  // 5. IDE Configs (VS Code / AGY)
  const vscodeDir = path.join(rootPath, ".vscode");
  await fs.mkdir(vscodeDir, { recursive: true });

  // Create tasks.json for pre-launch tasks
  const tasksJson = {
    version: "2.0.0",
    tasks: [
      {
        label: "npm-install",
        type: "shell",
        command: "npm install",
        problemMatcher: [],
      },
    ],
  };
  await fs.writeFile(path.join(vscodeDir, "tasks.json"), JSON.stringify(tasksJson, null, 2));
  logger.info("✅ Created .vscode/tasks.json");

  // Clean and set preferences in .vscode/settings.json
  const settingsPath = path.join(vscodeDir, "settings.json");
  let settings: Record<string, any> = {};
  try {
    const settingsContent = await fs.readFile(settingsPath, "utf8");
    settings = JSON.parse(settingsContent) as Record<string, any>;
  } catch (err: unknown) {
    logger.debug(`Could not read ${settingsPath}: ${err}`);
  }

  const cleanSettings: Record<string, any> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!key.startsWith("IDX.")) {
      cleanSettings[key] = value;
    }
  }

  // Add AGY/VSCode startup preference
  cleanSettings["workbench.startupEditor"] = "readme";

  await fs.writeFile(settingsPath, JSON.stringify(cleanSettings, null, 2));
  logger.info("✅ Updated .vscode/settings.json with startup preferences");

  const launchJson = {
    version: "0.2.0",
    configurations: [
      {
        type: "node",
        request: "launch",
        name: "Next.js: debug server-side",
        runtimeExecutable: "npm",
        runtimeArgs: ["run", "dev"],
        port: 9002,
        console: "integratedTerminal",
        preLaunchTask: "npm-install",
      },
    ],
  };
  await fs.writeFile(path.join(vscodeDir, "launch.json"), JSON.stringify(launchJson, null, 2));
  logger.info("✅ Created .vscode/launch.json");
}

async function cleanupUnusedFiles(rootPath: string): Promise<void> {
  // Remove docs/blueprint.md and empty docs directory
  const docsDir = path.join(rootPath, "docs");
  const blueprintPath = path.join(docsDir, "blueprint.md");
  try {
    await fs.unlink(blueprintPath);
    logger.info("✅ Cleaned up docs/blueprint.md");
  } catch (err: unknown) {
    logger.debug(`Could not delete ${blueprintPath}: ${err}`);
  }

  try {
    const files = await fs.readdir(docsDir);
    if (files.length === 0) {
      await fs.rmdir(docsDir);
      logger.info("✅ Removed empty docs directory");
    }
  } catch (err: unknown) {
    logger.debug(`Could not remove ${docsDir}: ${err}`);
  }

  const metadataPath = path.join(rootPath, "metadata.json");
  try {
    await fs.unlink(metadataPath);
    logger.info("✅ Cleaned up metadata.json");
  } catch (err: unknown) {
    logger.debug(`Could not delete ${metadataPath}: ${err}`);
  }

  const modifiedPath = path.join(rootPath, ".modified");
  try {
    await fs.unlink(modifiedPath);
    logger.info("✅ Cleaned up .modified");
  } catch (err: unknown) {
    logger.debug(`Could not delete ${modifiedPath}: ${err}`);
  }
}
async function askToOpenAntigravity(
  rootPath: string,
  appName: string,
  noStartAgyFlag: boolean,
): Promise<void> {
  // 8. Open in Antigravity (Optional)
  if (noStartAgyFlag) {
    logger.info(
      '\n👉 Next steps: Open this folder in Antigravity and run the "Initial Project Setup" workflow.',
    );
    return;
  }

  const answer = await prompt.confirm({
    message: `Migration complete for ${appName}! Would you like to open it in Antigravity now?`,
    default: true,
  });

  if (answer) {
    logger.info(`⏳ Opening ${appName} in Antigravity...`);
    try {
      const agyProcess = spawn("agy", ["."], {
        cwd: rootPath,
        stdio: "ignore",
        detached: true,
      });
      agyProcess.unref();
    } catch (err: unknown) {
      utils.logWarning("Could not open Antigravity IDE automatically. Please open it manually.");
    }
  } else {
    logger.info(
      '\n👉 Next steps: Open this folder in Antigravity and run the "Initial Project Setup" workflow.',
    );
  }
}

export async function migrate(
  rootPath: string,
  options: MigrateOptions = { noStartAgy: false },
): Promise<void> {
  logger.info("🚀 Starting Firebase Studio to Antigravity migration...");

  await assertSystemState();

  const { projectId, appName, blueprintContent } = await extractMetadata(rootPath);

  await updateReadme(rootPath, blueprintContent, appName);
  await createFirebaseConfigs(rootPath, projectId);
  await injectAgyContext(rootPath, projectId, appName);
  await writeAgyConfigs(rootPath);
  await cleanupUnusedFiles(rootPath);

  // Suggest renaming if we are in the 'download' folder
  const currentFolderName = path.basename(rootPath);
  if (currentFolderName === "download") {
    logger.info(
      `\n💡 Tip: You might want to rename this folder to "${appName.toLowerCase().replace(/\s+/g, "-")}"`,
    );
  }

  await askToOpenAntigravity(rootPath, appName, options.noStartAgy);
}
