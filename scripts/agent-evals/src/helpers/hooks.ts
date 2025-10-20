import { runCleanup } from "./cleanup.js";

// Ensures that every test run ends with a cleaned up CLI
afterEach(async () => {
  await runCleanup();
});
