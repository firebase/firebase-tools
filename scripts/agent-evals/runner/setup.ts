import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export async function buildFirebaseCli() {
  await execPromise("cd ../../ && npm run build");
}

export async function setupMcpServer() {
  console.log("Starting mock MCP server...");
  // These can fail if there's nothing installed, so ignore that
  try {
    await execPromise("gemini extensions uninstall firebase");
  } catch (e: any) {}
  try {
    await execPromise("gemini mcp remove firebase");
  } catch (e: any) {}
  await execPromise("gemini mcp add firebase ../../lib/bin/firebase.js experimental:mcp");
}
