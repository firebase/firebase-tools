import * as fs from "fs/promises";
import * as path from "path";
import { execSync, spawn } from "child_process";
import * as readline from "node:readline/promises";

interface GitHubItem {
  name: string;
  type: "dir" | "file";
  url: string;
  download_url: string;
}

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

interface Metadata {
  projectId?: string;
  [key: string]: any;
}

async function extractMetadata(rootPath: string): Promise<{
  projectId: string;
  appName: string;
  blueprintContent: string;
}> {
  // 1. Verify export & Extract Metadata
  const metadataPath = path.join(rootPath, "metadata.json");
  let metadata: Metadata = {};
  try {
    const metadataContent = await fs.readFile(metadataPath, "utf8");
    metadata = JSON.parse(metadataContent) as Metadata;
  } catch (err) {}

  let projectId = metadata.projectId;
  if (!projectId) {
    // try to get from .firebaserc
    try {
      const firebasercContent = await fs.readFile(path.join(rootPath, ".firebaserc"), "utf8");
      const firebaserc = JSON.parse(firebasercContent) as { projects?: { default?: string } };
      projectId = firebaserc.projects?.default;
    } catch (err) {}
  }

  if (projectId) {
    console.log(`✅ Detected Firebase Project: ${projectId}`);
  } else {
    projectId = "studio-8559296606-bdfe5"; // FIXME
  }

  // 2. Extract App Name and Blueprint Content
  let appName = "firebase-studio-export";
  let blueprintContent = "";
  const blueprintPath = path.join(rootPath, "docs", "blueprint.md");
  try {
    blueprintContent = await fs.readFile(blueprintPath, "utf8");
    const nameMatch = blueprintContent.match(/# \*\*App Name\*\*: (.*)/);
    if (nameMatch && nameMatch[1]) {
      appName = nameMatch[1].trim();
    }
  } catch (err) {}

  if (appName !== "firebase-studio-export") {
    console.log(`✅ Detected App Name: ${appName}`);
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
  const readmeTemplate = await fs.readFile(path.join(__dirname, "readme_template.md"), "utf8");
  const newReadme = readmeTemplate
    .replace("${appName}", appName)
    .replace("${appName}", appName) // Replace twice for name and previous name
    .replace("${exportDate}", new Date().toLocaleDateString())
    .replace("${blueprintContent}", blueprintContent.replace(/# \*\*App Name\*\*: .*/, "").trim());

  await fs.writeFile(readmePath, newReadme);
  console.log("✅ Updated README.md with project details and origin info");

  // Remove docs/blueprint.md and empty docs directory
  const docsDir = path.join(rootPath, "docs");
  const blueprintPath = path.join(docsDir, "blueprint.md");
  try {
    await fs.unlink(blueprintPath);
    console.log("✅ Cleaned up docs/blueprint.md");
  } catch (err) {}

  try {
    const files = await fs.readdir(docsDir);
    if (files.length === 0) {
      await fs.rmdir(docsDir);
      console.log("✅ Removed empty docs directory");
    }
  } catch (err) {}
}

async function injectAgyContext(rootPath: string, projectId: string, appName: string): Promise<void> {
  const agentDir = path.join(rootPath, ".agent");
  const rulesDir = path.join(agentDir, "rules");
  const workflowsDir = path.join(agentDir, "workflows");
  const skillsDir = path.join(agentDir, "skills");

  await fs.mkdir(rulesDir, { recursive: true });
  await fs.mkdir(workflowsDir, { recursive: true });
  await fs.mkdir(skillsDir, { recursive: true });

  // Download Skills from GitHub
  console.log("⏳ Fetching AGY skills from firebase/agent-skills...");
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
      console.warn("⚠️ GitHub API response for skills is not an array.");
    }
    console.log(`✅ Downloaded Firebase skills`);
  } catch (err: any) {
    console.warn("⚠️ Could not download AGY skills, skipping.", err.message);
  }


  // Download Genkit skill
  console.log("⏳ Fetching Genkit skill...");
  try {
    const genkitSkillDir = path.join(skillsDir, "developing-genkit-js");
    await downloadGitHubDir(
      "https://api.github.com/repos/genkit-ai/skills/contents/skills/developing-genkit-js?ref=main",
      genkitSkillDir,
    );
    console.log(`✅ Downloaded Genkit skill`);
  } catch (err: any) {
    console.warn("⚠️ Could not download Genkit skill, skipping.", err.message);
  }
  
  // System Instructions
  const systemInstructionsTemplate = await fs.readFile(
    path.join(__dirname, "system_instructions.md"),
    "utf8",
  );
  const systemInstructions = systemInstructionsTemplate
    .replace("${projectId}", projectId || "")
    .replace("${appName}", appName);

  await fs.writeFile(path.join(rulesDir, "migration-context.md"), systemInstructions);
  console.log("✅ Injected AGY rules");

  // Startup Workflow
  const startupWorkflow = await fs.readFile(
    path.join(__dirname, "workflows", "startup_workflow.md"),
    "utf8",
  );
  await fs.writeFile(path.join(workflowsDir, "startup.md"), startupWorkflow);
  console.log("✅ Created AGY startup workflow");
}

async function assertSystemState(): Promise<void> {
  // Assertion: Check for firebase-tools
  try {
    execSync("firebase --version", { stdio: "ignore" });
    console.log("✅ Firebase CLI detected");
  } catch (err) {
    console.error("❌ Error: Firebase CLI (firebase-tools) is not installed or not in your PATH.");
    console.error("👉 Please install it using: npm install -g firebase-tools");
    process.exit(1);
  }

  // Assertion: Check for Antigravity (agy)
  try {
    execSync("agy --version", { stdio: "ignore" });
    console.log("✅ Antigravity IDE CLI (agy) detected");
  } catch (err) {
    const downloadLink = "https://antigravity.google/download";

    console.warn("⚠️ Warning: Antigravity IDE CLI (agy) not found in your PATH.");
    console.warn(
      `👉 To ensure a seamless migration, please download and install Antigravity: ${downloadLink}`,
    );
    process.exit(1);
  }
}

interface Backend {
  name: string;
  displayName?: string;
}

async function createFirebaseConfigs(rootPath: string, projectId: string): Promise<void> {
  // 3. Create Firebase Configs
  // .firebaserc
  const firebaserc = {
    projects: {
      default: projectId,
    },
  };
  await fs.writeFile(path.join(rootPath, ".firebaserc"), JSON.stringify(firebaserc, null, 2));
  console.log("✅ Created .firebaserc");

  // firebase.json (App Hosting)
  const firebaseJsonPath = path.join(rootPath, "firebase.json");
  try {
    await fs.access(firebaseJsonPath);
    console.log("ℹ️ firebase.json already exists, skipping creation.");
  } catch {
    let backendId = "studio"; // Default
    try {
      console.log(`⏳ Fetching App Hosting backends for project ${projectId}...`);
      const backendsOutput = execSync(
        `firebase apphosting:backends:list --project=${projectId} --json`,
        { encoding: "utf8" },
      );
      const backendsData = JSON.parse(backendsOutput) as { result?: Backend[] };
      const backends = backendsData.result || [];

      if (backends.length > 0) {
        const studioBackend = backends.find(
          (b) => b.name.endsWith("/studio") || b.displayName?.toLowerCase() === "studio",
        );
        if (studioBackend) {
          backendId = studioBackend.name.split("/").pop()!;
        } else {
          backendId = backends[0].name.split("/").pop()!;
        }
        console.log(`✅ Selected App Hosting backend: ${backendId}`);
      } else {
        console.warn('⚠️ No App Hosting backends found, using default "studio"');
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch backends from Firebase CLI, using default "studio"');
    }

    const firebaseJson = {
      apphosting: {
        backendId: backendId,
      },
    };
    await fs.writeFile(firebaseJsonPath, JSON.stringify(firebaseJson, null, 2));
    console.log(`✅ Created firebase.json with backendId: ${backendId}`);
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
  console.log("✅ Created .vscode/tasks.json");

  // Clean and set preferences in .vscode/settings.json
  const settingsPath = path.join(vscodeDir, "settings.json");
  let settings: Record<string, any> = {};
  try {
    const settingsContent = await fs.readFile(settingsPath, "utf8");
    settings = JSON.parse(settingsContent) as Record<string, any>;
  } catch (err) {}

  const cleanSettings: Record<string, any> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!key.startsWith("IDX.")) {
      cleanSettings[key] = value;
    }
  }

  // Add AGY/VSCode startup preference
  cleanSettings["workbench.startupEditor"] = "readme";

  await fs.writeFile(settingsPath, JSON.stringify(cleanSettings, null, 2));
  console.log("✅ Updated .vscode/settings.json with startup preferences");

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
  console.log("✅ Created .vscode/launch.json");
}

async function askToOpenAgy(
  rootPath: string,
  appName: string,
  noStartAgyFlag: boolean,
): Promise<void> {
  // 8. Open in Antigravity (Optional)
  if (noStartAgyFlag) {
    console.log(
      `\n👉 Next steps: Open this folder in Antigravity and run the "Initial Project Setup" workflow.`,
    );
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      `\n🚀 Migration complete for ${appName}! Would you like to open it in Antigravity now? (y/n): `,
    );
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      console.log(`⏳ Opening ${appName} in Antigravity...`);
      try {
        const agyProcess = spawn("agy", ["."], {
          cwd: rootPath,
          stdio: "ignore",
          detached: true,
        });
        agyProcess.unref();
      } catch (err) {
        console.warn("⚠️ Could not open Antigravity IDE automatically. Please open it manually.");
      }
    } else {
      console.log(
        `\n👉 Next steps: Open this folder in Antigravity and run the "Initial Project Setup" workflow.`,
      );
    }
  } finally {
    rl.close();
  }
}

export async function migrate(rootPath: string): Promise<void> {
  const args = process.argv.slice(2);
  const noStartAgyFlag = args.includes("--nostart_agy");

  console.log("🚀 Starting Firebase Studio to Antigravity migration...");

  await assertSystemState();

  const { projectId, appName, blueprintContent } = await extractMetadata(rootPath);

  await updateReadme(rootPath, blueprintContent, appName);

  await createFirebaseConfigs(rootPath, projectId);

  // 4. Inject AGY Context
  await injectAgyContext(rootPath, projectId, appName);
  await writeAgyConfigs(rootPath);
  // 6. Cleanup
  const metadataPath = path.join(rootPath, "metadata.json");
  try {
    await fs.unlink(metadataPath);
    console.log("✅ Cleaned up metadata.json");
  } catch (err) {}

  const modifiedPath = path.join(rootPath, ".modified");
  try {
    await fs.unlink(modifiedPath);
    console.log("✅ Cleaned up .modified");
  } catch (err) {}

  // 7. Folder Renaming (Optional/Attempt)
  // Note: This might fail if the script is running inside the folder

  // Suggest renaming if we are in the 'download' folder
  const currentFolderName = path.basename(rootPath);
  if (currentFolderName === "download") {
    console.log(
      `\n💡 Tip: You might want to rename this folder to "${appName
        .toLowerCase()
        .replace(/\\s+/g, "-")}"`,
    );
  }
  await askToOpenAgy(rootPath, appName, noStartAgyFlag);
}