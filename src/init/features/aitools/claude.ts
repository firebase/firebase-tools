import { exec } from "child_process";
import { promisify } from "util";
import * as utils from "../../../utils";
import { Config } from "../../../config";
import { AIToolModule } from "./types";
import { confirm } from "../../../prompt";

const execAsync = promisify(exec);

export const claude: AIToolModule = {
  name: "claude",
  displayName: "Claude Code",

  async configure(_config: Config, projectPath: string, _enabledFeatures: string[]): Promise<void> {
    // Check if claude CLI exists
    try {
      await execAsync("which claude");
    } catch (e) {
      utils.logWarning("Claude CLI not found. Please install it first:");
      utils.logBullet("  - Visit: https://docs.anthropic.com/en/docs/claude-code");
      utils.logBullet("  - Or run: brew install claude (on macOS)");
      return;
    }

    // Build the MCP add command
    const cmd = `claude mcp add firebase -e PROJECT_ROOT="${projectPath}" -- npx -y firebase-tools experimental:mcp`;

    utils.logBullet("Will execute the following command:");
    utils.logBullet(`  ${cmd}`);

    const shouldProceed = await confirm({
      message: "Proceed with Claude Code MCP server installation?",
      default: true,
    });

    if (!shouldProceed) {
      utils.logBullet("Skipping Claude Code configuration.");
      return;
    }

    try {
      utils.logBullet("Installing MCP server for Claude Code...");
      const { stdout } = await execAsync(cmd);

      utils.logSuccess("✓ Claude Code MCP server installed successfully");

      if (stdout && stdout.trim()) {
        utils.logBullet("Output:");
        utils.logBullet(stdout);
      }

      utils.logBullet("");
      utils.logBullet("Next steps for Claude Code:");
      utils.logBullet("  1. Restart Claude Code to load the new MCP server");
      utils.logBullet("  2. You should see 'firebase' in the MCP servers list");
      utils.logBullet("  3. Claude Code will now understand Firebase CLI commands");
    } catch (error: any) {
      utils.logWarning(`Failed to install MCP server: ${error.message}`);
      if (error.stderr) {
        utils.logWarning(`Error details: ${error.stderr}`);
      }
      utils.logBullet("");
      utils.logBullet("You can try running the command manually:");
      utils.logBullet(`  ${cmd}`);
    }
  },
};
