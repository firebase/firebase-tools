import { exec } from "child_process";
import { promisify } from "util";
import * as utils from "../../../utils";
import { Config } from "../../../config";
import { AIToolModule } from "./types";

const execAsync = promisify(exec);

export const claude: AIToolModule = {
  name: "claude",
  displayName: "Claude Code",

  async configure(config: Config, projectPath: string, _enabledFeatures: string[]): Promise<void> {
    // Check if claude CLI exists
    try {
      await execAsync("which claude");
    } catch (e) {
      utils.logWarning("Claude CLI not found. Install from: https://docs.anthropic.com/en/docs/claude-code");
      return;
    }

    // Build the MCP add command
    const cmd = `claude mcp add firebase -e PROJECT_ROOT="${projectPath}" -- npx -y firebase-tools experimental:mcp`;

    try {
      await execAsync(cmd);
      // Write a simple config file to indicate setup is complete
      config.writeProjectFile(".claude/settings.local.json", JSON.stringify({
        "mcp-servers": {
          "firebase": {
            "configured": true
          }
        }
      }, null, 2));
      
      utils.logSuccess("✓ Claude Code configuration written to:");
      utils.logBullet("  - .claude/settings.local.json");
    } catch (error: any) {
      // Silently fail - user can run command manually if needed
    }
  },
};
