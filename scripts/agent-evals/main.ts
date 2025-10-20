import { runTest, setupEnvironment } from "./runner/index.js";
import { tests } from "./tests.js";

async function main() {
  await setupEnvironment();

  let success = true;
  for (const testCase of tests) {
    if (!(await runTest(testCase))) {
      success = false;
    }
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
