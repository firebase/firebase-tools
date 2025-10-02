import { AgentTestRunner } from "./agent-test-runner";
import { GeminiCliRunner } from "./gemini-cli-runner";
import { setupMcpServer } from "./setup";

export * from "./agent-test-runner";

export interface AgentTestCase {
  name: string;
  test: (run: AgentTestRunner) => Promise<void>;
}

export async function test(testCase: AgentTestCase): Promise<boolean> {
  // await setupMcpServer();

  console.log(`[RUNNING] ${testCase.name}`);
  const run = new GeminiCliRunner(testCase.name);
  let success = true;

  try {
    await run.waitForReadyPrompt();
    await testCase.test(run);
    console.error(`[PASS] ${testCase.name}`);

  } catch (e) {
    console.error(`[FAIL] ${testCase.name}`, e);
    success = false;

  } finally {
    await run.exit();
    return success;
  }
}
