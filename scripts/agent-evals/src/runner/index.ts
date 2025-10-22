import { AgentTestRunner } from "./agent-test-runner.js";
import { GeminiCliRunner } from "./gemini-cli-runner.js";
import { buildFirebaseCli, clearUserMcpServers } from "./setup.js";
import { addCleanup } from "../helpers/cleanup.js";

export * from "./agent-test-runner.js";

export async function setupEnvironment(): Promise<void> {
  await buildFirebaseCli();
  await clearUserMcpServers();
}

export interface AgentTestOptions {
  templateName: string;
}

export async function startAgentTest(mocha: Mocha.Context, options?: AgentTestOptions): Promise<AgentTestRunner> {
  if (!mocha.test) {
    throw new Error("startAgentTest must be called inside of an `it` block of a Mocha test.");
  }
  const testName = mocha.test.fullTitle();
  const run = new GeminiCliRunner(testName);
  await run.waitForReadyPrompt();

  addCleanup(async () => {
    await run.exit();
  });

  return run;
}
