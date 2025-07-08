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
      console.log();
      utils.logLabeledWarning("Missing", "Claude CLI not found");
      utils.logBullet("📚 Install instructions:");
      utils.logBullet("   • Visit: https://docs.anthropic.com/en/docs/claude-code");
      utils.logBullet("   • macOS: brew install claude");
      return;
    }

    // Build the MCP add command
    const cmd = `claude mcp add firebase -e PROJECT_ROOT="${projectPath}" -- npx -y firebase-tools experimental:mcp`;

    console.log();
    utils.logLabeledBullet("Setup", "Ready to install Firebase MCP server for Claude Code");
    utils.logBullet("🔧 Command to execute:");
    utils.logBullet(`   ${cmd}`);
    console.log();

    const shouldProceed = await confirm({
      message: "Proceed with installation?",
      default: true,
    });

    if (!shouldProceed) {
      utils.logBullet("🚫 Skipping Claude Code configuration.");
      return;
    }

    try {
      console.log();
      utils.logBullet("🔄 Installing MCP server...");
      const { stdout } = await execAsync(cmd);

      console.log();
      utils.logLabeledSuccess("Claude Code", "MCP server installed successfully! 🎆");

      if (stdout && stdout.trim()) {
        console.log();
        utils.logLabeledBullet("Output", "Installation details:");
        utils.logBullet(stdout);
      }
    } catch (error: any) {
      console.log();
      utils.logLabeledWarning("Error", `Failed to install MCP server: ${error.message}`);
      if (error.stderr) {
        utils.logWarning(`Details: ${error.stderr}`);
      }
      console.log();
      utils.logBullet("💡 You can try running the command manually:");
      utils.logBullet(`   ${cmd}`);
      console.log();
    }
  },
};
