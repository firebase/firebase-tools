import { Command } from "../command";
import { requireAuth } from "../requireAuth";

export const command = new Command("mcp")
  .alias("experimental:mcp")
  .description("Run the multi-modal conversational platform (MCP) server.")
  .before(requireAuth)
  .action(() => {
    throw new Error("MCP logic is implemented elsewhere, this should never be reached.");
  });
