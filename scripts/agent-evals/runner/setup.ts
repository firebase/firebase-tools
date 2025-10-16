import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export async function buildFirebaseCli() {
  console.log(`Building the Firebase CLI...`);
  await execPromise("cd ../../ && npm run build");
}

export async function clearUserMcpServers() {
  console.log(`Clearing existing MCP servers...`);
  // These can fail if there's nothing installed, so ignore that
  try {
    await execPromise("gemini extensions uninstall firebase");
  } catch (e: any) {}
  try {
    await execPromise("gemini mcp remove firebase");
  } catch (e: any) {}
}
