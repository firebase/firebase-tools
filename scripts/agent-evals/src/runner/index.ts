import * as path from "path";
import * as os from "os";
import { randomBytes } from "node:crypto";
import { mkdirSync, copyFileSync } from "node:fs";
import { AgentTestRunner } from "./agent-test-runner";
import { GeminiCliRunner } from "./gemini-cli-runner";
import { buildFirebaseCli } from "./setup";
import { addCleanup } from "../helpers/cleanup";
import { TemplateName, copyTemplate, buildTemplates } from "../template/index";
import { ToolMockName } from "../mock/tool-mocks";
import { RunDirectories } from "./paths";

export * from "./agent-test-runner";

const dateName = new Date().toISOString().replace("T", "_").replace(/:/g, "-").replace(".", "-");

const FIREBASE_CONFIG_FILENAME = "firebase-tools.json";
const CONFIGSTORE_DIR = ".config/configstore";
const HOME_CONFIGSTORE_DIR = path.resolve(os.homedir(), CONFIGSTORE_DIR);

export async function setupEnvironment(): Promise<void> {
  await buildFirebaseCli();
  await buildTemplates();
}

export interface AgentTestOptions {
  // Name of the template directory to copy into this test run. Leave this empty
  // to run the test in an empty directory
  templateName?: TemplateName;
  // List of MCP Tool mocks to apply, in order. Later mocks overwrite earlier
  // mocks.
  toolMocks?: ToolMockName[];
  // List of paths to skills to enable for this test
  skills?: string[];
  // Whether to enable the Firebase MCP server. Defaults to true.
  enableMcp?: boolean;
}

export async function startAgentTest(
  mocha: Mocha.Context,
  options?: AgentTestOptions,
): Promise<AgentTestRunner> {
  if (!mocha.test) {
    throw new Error("startAgentTest must be called inside of an `it` block of a Mocha test.");
  }
  const testName = mocha.test.fullTitle();
  const dirs = createRunDirectory(testName);

  if (options?.templateName) {
    copyTemplate(options.templateName, dirs.runDir);
  }
  if (process.env.COPY_FIREBASE_CLI_CONFIG) {
    const toDir = path.resolve(dirs.userDir, CONFIGSTORE_DIR);
    console.log(
      `Copying Firebase CLI configs from ${HOME_CONFIGSTORE_DIR} to \n${toDir} so the test can use your auth credentials`,
    );
    copyFirebaseCliConfigstore(HOME_CONFIGSTORE_DIR, toDir);
  }

  const run = new GeminiCliRunner(
    testName,
    dirs,
    options?.toolMocks || [],
    options?.skills,
    options?.enableMcp,
  );
  await run.waitForReadyPrompt();

  addCleanup(async () => {
    await run.exit();
  });

  return run;
}

function createRunDirectory(testName: string): RunDirectories {
  const sanitizedName = testName
    .toLowerCase()
    .replace(/^[^a-z0-9]/, "")
    .replace(/[^a-z0-9]/g, "-");
  const testDir = path.resolve(
    path.join("output", dateName, `${sanitizedName}-${randomBytes(8).toString("hex")}`),
  );

  const runDir = path.join(testDir, "repo");
  mkdirSync(runDir, { recursive: true });

  const userDir = path.join(testDir, "user");
  mkdirSync(userDir, { recursive: true });

  return { testDir, runDir, userDir };
}

function copyFirebaseCliConfigstore(fromDir: string, toDir: string) {
  mkdirSync(toDir, { recursive: true });
  try {
    copyFileSync(
      path.join(fromDir, FIREBASE_CONFIG_FILENAME),
      path.join(toDir, FIREBASE_CONFIG_FILENAME),
    );
  } catch (e: any) {
    if (e.code === "ENOENT") {
      const sourceFile = path.join(fromDir, FIREBASE_CONFIG_FILENAME);
      console.warn(
        `Firebase CLI config file not found at ${sourceFile}. Skipping copy. If you want to use your local Firebase login, please log in with the Firebase CLI.`,
      );
    } else {
      throw e;
    }
  }
}
