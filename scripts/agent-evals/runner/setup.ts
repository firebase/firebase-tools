import { exec } from "child_process";
import path from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";

const execPromise = promisify(exec);

export async function buildFirebaseCli() {
  const firebaseCliRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
  );
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
