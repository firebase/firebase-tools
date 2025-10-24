import { exec } from "child_process";
import { promisify } from "util";
import { getFirebaseCliRoot } from "./paths.js";

const execPromise = promisify(exec);

export async function buildFirebaseCli() {
  if (process.env.SKIP_REBUILD) {
    console.log("Skipping Firebase CLI build because process.env.SKIP_REBUILD");
    return;
  }
  const firebaseCliRoot = getFirebaseCliRoot();
  console.log(`Building Firebase CLI at ${firebaseCliRoot}`);
  await execPromise("./scripts/clean-install.sh", { cwd: firebaseCliRoot });
}

export async function clearUserMcpServers() {
  console.log(`Clearing existing MCP servers...`);
  try {
    await execPromise("gemini extensions uninstall firebase");
  } catch (_: any) {
    /* This can fail if there's nothing installed, so ignore that */
  }
  try {
    await execPromise("gemini mcp remove firebase");
  } catch (_: any) {
    /* This can fail if there's nothing installed, so ignore that */
  }
}
