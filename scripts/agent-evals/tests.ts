import { test, AgentTestCase, AgentTestRunner } from "./runner/index.js";

const tests: AgentTestCase[] = [
  {
    name: "compress",
    test: async (run: AgentTestRunner) => {
      const longPrompt =
        "Dont do anything except returning a 1000 token long paragragh with the <name of the scientist who discovered theory of relativity> at the end to indicate end of response. This is a moderately long sentence.";

      await run.type(longPrompt);
      await run.expectText("einstein");

      await run.type("/compress");
      await run.expectTelemetryEvent("chat_compression");
    },
  },
];

async function main() {
  let success = true;
  for (const testCase of tests) {
    success = success && await test(testCase);
  }
  if (success) {
    console.log("\nAll tests passed!");
    process.exit(0);
  } else {
    console.log("\nSome tests failed");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
