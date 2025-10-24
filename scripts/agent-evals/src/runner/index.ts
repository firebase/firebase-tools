import path from "node:path";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { AgentTestRunner } from "./agent-test-runner.js";
import { GeminiCliRunner } from "./gemini-cli-runner.js";
import { buildFirebaseCli, clearUserMcpServers } from "./setup.js";
import { addCleanup } from "../helpers/cleanup.js";
import { TemplateName, copyTemplate, buildTemplates } from "../template/index.js";
import {ToolMockName} from '../mock/tool-mocks.js';

export * from "./agent-test-runner.js";

const dateName = new Date().toISOString().replace("T", "_").replace(/:/g, "-").replace(".", "-");

export async function setupEnvironment(): Promise<void> {
  await buildFirebaseCli();
  await clearUserMcpServers();
  await buildTemplates();
}

export interface AgentTestOptions {
  // Name of the template directory to copy into this test run. Leave this empty
  // to run the test in an empty directory
  templateName?: TemplateName;
  // List of MCP Tool mocks to apply, in order. Later mocks overwrite earlier
  // mocks.
  toolMocks?: ToolMockName[];
}

export async function startAgentTest(
  mocha: Mocha.Context,
  options?: AgentTestOptions,
): Promise<AgentTestRunner> {
  if (!mocha.test) {
    throw new Error("startAgentTest must be called inside of an `it` block of a Mocha test.");
  }
  const testName = mocha.test.fullTitle();
  const { testDir, runDir } = createRunDirectory(testName);

  if (options?.templateName) {
    copyTemplate(options.templateName, runDir);
  }

  const run = new GeminiCliRunner(testName, testDir, runDir);
  await run.waitForReadyPrompt();

  addCleanup(async () => {
    await run.exit();
  });

  return run;
}

function createRunDirectory(testName: string): { testDir: string; runDir: string } {
  const sanitizedName = testName.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const testDir = path.resolve(
    path.join("output", dateName, `${sanitizedName}-${randomBytes(8).toString("hex")}`),
  );
  const runDir = path.join(testDir, "repo");
  mkdirSync(runDir, { recursive: true });
  return { testDir, runDir };
}
