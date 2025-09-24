import { Command } from "../command";
import { requireAuth } from "../requireAuth";

export const command = new Command("mcp")
  .description(
    "Start an MCP server with access to the current working directory's project and resources.",
  )
  .before(requireAuth)
  .action(() => {
    throw new Error("MCP logic is implemented elsewhere, this should never be reached.");
  });
